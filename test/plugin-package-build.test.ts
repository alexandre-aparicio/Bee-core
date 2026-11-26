import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Script } from "node:vm";
import { buildPluginPackages } from "../scripts/build-plugin-packages.mjs";
import { installSignedPluginZip } from "../src/core/plugin-zip-installer.js";

const distReady = existsSync(join(process.cwd(), "dist/plugins/documents/documents.plugin.js"));

test("RSA publisher keys use SHA-256 and are accepted by the runtime ZIP verifier", { skip: !distReady }, async () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 3072 });
  const root = await mkdtemp(join(tmpdir(), "bee-rsa-publisher-packages-"));
  try {
    const built = await buildPluginPackages({
      privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
      outputDir: join(root, "archives")
    });
    const timeTracking = built.find(item => item.id === "time-tracking");
    assert.ok(timeTracking);
    const installed = await installSignedPluginZip({
      archive: await readFile(timeTracking.path),
      storageRoot: join(root, "installed"),
      publisherPublicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
      runtimeVersion: "0.3.1"
    });
    assert.equal(installed.manifest.id, "time-tracking");
    assert.equal(installed.manifest.version, "0.2.1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("four first-party modules build as independently signed ZIP packages", { skip: !distReady }, async () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const root = await mkdtemp(join(tmpdir(), "bee-first-party-packages-"));
  try {
    const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const built = await buildPluginPackages({
      privateKeyPem,
      publicKeyPem,
      outputDir: join(root, "archives")
    });
    const mismatchedPair = generateKeyPairSync("ed25519");
    await assert.rejects(
      () => buildPluginPackages({
        privateKeyPem,
        publicKeyPem: mismatchedPair.publicKey.export({ type: "spki", format: "pem" }).toString(),
        outputDir: join(root, "rejected")
      }),
      /does not match/
    );
    assert.deepEqual(built.map(item => item.id).sort(), ["connected-devices", "documents", "hello-world", "time-tracking"]);
    for (const item of built) {
      assert.ok(item.bytes > 100);
      const installed = await installSignedPluginZip({
        archive: await readFile(item.path),
        storageRoot: join(root, "installed"),
        publisherPublicKey: publicKeyPem,
        runtimeVersion: "0.3.1"
      });
      assert.equal(installed.manifest.id, item.id);
      assert.ok(installed.extractedFiles >= 4);
      if (item.id === "hello-world") {
        assert.equal(installed.manifest.frontend.entrypoint, "frontend/index.html");
        assert.ok(installed.manifest.frontend.assets?.includes("frontend/main.js"));
        const html = await readFile(join(installed.packageDirectory, "frontend/index.html"), "utf8");
        const script = await readFile(join(installed.packageDirectory, "frontend/main.js"), "utf8");
        assert.match(html, /Hola Mundo/);
        assert.match(script, /bee-plugin:ready/);
      } else if (item.id === "connected-devices") {
        assert.deepEqual(installed.manifest.dependencies.map(dependency => dependency.pluginId).sort(), ["auth", "organizations"]);
        assert.deepEqual(installed.manifest.tenantDependencies, []);
        assert.equal(installed.manifest.frontend.entrypoint, "frontend/index.html");
        assert.deepEqual(installed.manifest.frontend.routes?.map(route => route.path), ["/dashboard/connected-devices"]);
        assert.deepEqual(installed.manifest.frontend.apiPrefixes, ["/connected-devices"]);
        assert.ok(installed.manifest.frontend.assets?.includes("frontend/qrcode.min.js"));
        const html = await readFile(join(installed.packageDirectory, "frontend/index.html"), "utf8");
        const script = await readFile(join(installed.packageDirectory, "frontend/main.js"), "utf8");
        const qr = await readFile(join(installed.packageDirectory, "frontend/qrcode.min.js"), "utf8");
        assert.match(html, /Connected Devices/);
        assert.match(html, /qrcode.min.js/);
        assert.match(script, /pairing-challenges/);
        assert.match(script, /approve/);
        assert.match(script, /bee-plugin:api-request/);
        assert.match(script, /function showConfirm/);
        assert.match(script, /role="alertdialog"/, "destructive actions must use an accessible warning dialog");
        assert.match(script, /Delete device permanently/);
        assert.match(script, /action.type==="delete"\?"DELETE":"POST"/);
        assert.match(script, /action.type==="delete"\?undefined:\{\}/, "DELETE requests must not send an empty JSON body");
        assert.match(script, /unlink/, "the owner UI must retain the unlink action");
        const simulator = await readFile(resolve(process.cwd(), "apps/web/src/assets/device-simulator/device-simulator.js"), "utf8");
        assert.match(simulator, /method:"POST",body:"\{\}"/, "the device simulator must send a JSON heartbeat body");
        const bridge = await readFile(resolve(process.cwd(), "apps/web/src/app/plugins/plugin-outlet.component.ts"), "utf8");
        assert.match(bridge, /if\s*\(body\s*!==\s*undefined\)/, "the package bridge must omit Content-Type when DELETE has no body");
        assert.doesNotThrow(() => new Script(script), "the standalone Connected Devices frontend must be valid JavaScript");
        assert.doesNotThrow(() => new Script(qr), "the bundled QR renderer must be valid JavaScript");
      } else if (item.id === "time-tracking") {
        assert.equal(installed.manifest.version, "0.2.1", "the package version bump must exercise the tenant upgrade path");
        assert.deepEqual(installed.manifest.dependencies.map(dependency => dependency.pluginId).sort(), ["auth", "organizations"]);
        assert.deepEqual(installed.manifest.tenantDependencies, []);
        assert.equal(installed.manifest.backend.entrypoint, "dist/backend/index.mjs");
        assert.deepEqual(installed.manifest.frontend, { routes: [] }, "native Angular frontend must not be declared in the ZIP");
        assert.equal(existsSync(join(installed.packageDirectory, "frontend")), false, "backend-only Control Horario ZIP must not contain a frontend/ directory");
        assert.ok(existsSync(join(installed.packageDirectory, installed.manifest.backend.entrypoint)), "the backend-only manifest must install its runtime entrypoint");
      } else if (item.id === "documents") {
        assert.deepEqual(installed.manifest.dependencies.map(dependency => dependency.pluginId).sort(), ["auth", "files", "organizations"]);
        assert.equal(installed.manifest.version, "0.4.0", "clean package builds must publish the current Documents version, never the stale 0.1.0 release");
        assert.deepEqual(installed.manifest.tenantDependencies, [], "Files is a host runtime dependency and must not be installed as a tenant package dependency");
        assert.equal(installed.manifest.activationPolicy, "manual", "Documents must be installed explicitly, not auto-provisioned with Files");
        const documentsPlugin = await readFile(resolve(process.cwd(), "src/plugins/documents/documents.plugin.ts"), "utf8");
        const documentsService = await readFile(resolve(process.cwd(), "src/plugins/documents/documents.service.ts"), "utf8");
        assert.match(documentsPlugin, /dependencies:\["auth","organizations","files"\]/, "Documents may depend on the host Files service");
        assert.match(documentsPlugin, /version:"0\.4\.0"/, "the backend entrypoint must report the same current package version");
        assert.match(documentsPlugin, /activationPolicy:"manual"/, "Documents must be independently installed, not auto-provisioned with Files");
        const documentsManifest = await readFile(resolve(process.cwd(), "src/plugins/documents/plugin.manifest.ts"), "utf8");
        assert.match(documentsManifest, /version:\s*"0\.4\.0"/);
        assert.match(documentsManifest, /dependencies:\s*\["files"\]/, "Files remains an explicit runtime dependency");
        assert.match(documentsManifest, /tenantDependencies:\s*\[\]/, "Files must not be installed as a tenant dependency of Documents");
        assert.match(documentsManifest, /activationPolicy:\s*"manual"/);
        const runtimeSource = await readFile(resolve(process.cwd(), "src/index.ts"), "utf8");
        assert.doesNotMatch(runtimeSource, /import\s*\{\s*documentsPlugin\s*\}/, "Documents backend must not be bundled into the host runtime");
        assert.doesNotMatch(runtimeSource, /plugins\.register\(documentsPlugin\)/, "Documents must only load through its signed package");
        assert.doesNotMatch(runtimeSource, /builtinFallbacks[\s\S]*documents/, "a failed or absent Documents ZIP must not silently activate a bundled 0.1.0 fallback");
        assert.match(documentsService, /await hasPluginEntitlement\(db,tenant\.tenantId,"documents"\).*await isPluginInstalled\(db,tenant\.tenantId,"documents"\).*await isPluginEnabled\(db,tenant\.tenantId,"documents"\)/);
        assert.match(documentsService, /Documents is not entitled, installed or enabled/, "Documents must fail closed when its package access is unavailable");
        assert.equal(installed.manifest.frontend.entrypoint, "frontend/index.html");
        assert.deepEqual(installed.manifest.frontend.apiPrefixes, ["/documents", "/files"], "Documents may call the host Files API without owning or installing Files");
        assert.ok(installed.manifest.frontend.assets?.includes("frontend/main.js"));
        const html = await readFile(join(installed.packageDirectory, "frontend/index.html"), "utf8");
        const script = await readFile(join(installed.packageDirectory, "frontend/main.js"), "utf8");
        assert.match(html, /Documents/);
        assert.match(script, /bee-plugin:api-request/);
        assert.match(script, /__beeBinary/);
        assert.match(script, /saveFolderShares/);
        assert.match(script, /dragstart/);
        assert.doesNotThrow(() => new Script(script), "the standalone Documents frontend must be valid JavaScript");
      } else {
        assert.equal(installed.manifest.frontend.routes.length, 0);
      }
      const entrypoint = join(installed.packageDirectory, installed.manifest.backend.entrypoint);
      const loaded = await import(pathToFileURL(entrypoint).href) as { default?: { manifest?: { name?: string; version?: string }; tenantMigrations?: Array<{ id: string; checksum: string; phase?: string }> } };
      assert.equal(loaded.default?.manifest?.name, item.id);
      assert.equal(loaded.default?.manifest?.version, item.version);
      if (item.id === "time-tracking") {
        assert.deepEqual(installed.manifest.migrations, [{
          id: "001_create_time_tracking_indexes",
          checksum: "cab33997679133194d812b3f7ef827097ca45a925dcfcc55083a58bc90321b37",
          phase: "install"
        }], "Control Horario ZIP must declare the tenant migration it ships");
        assert.deepEqual(loaded.default?.tenantMigrations?.map(migration => ({
          id: migration.id, checksum: migration.checksum, phase: migration.phase
        })), installed.manifest.migrations, "runtime migration implementation must match the signed ZIP manifest");
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});



test("Hello Mundo is not registered or advertised as a bundled plugin", async () => {
  const runtimeSource = await readFile(join(process.cwd(), "src/index.ts"), "utf8");
  const entitlementSource = await readFile(join(process.cwd(), "src/core/plugin-entitlements.ts"), "utf8");
  const registrySource = await readFile(join(process.cwd(), "src/core/platform-plugin-registry.ts"), "utf8");
  const platformAdminSource = await readFile(join(process.cwd(), "src/plugins/platform-admin/platform-admin.plugin.ts"), "utf8");
  const manifestRegistrySource = await readFile(join(process.cwd(), "src/plugins/plugin-manifest-registry.ts"), "utf8");

  assert.doesNotMatch(runtimeSource, /import\s*\{\s*helloWorldPlugin\s*\}/);
  assert.doesNotMatch(runtimeSource, /plugins\.register\(helloWorldPlugin\)/);
  assert.match(runtimeSource, /loadSignedZipPlugins\(\)/, "Hello Mundo remains loadable through the signed ZIP runtime");
  assert.doesNotMatch(entitlementSource, /hello-world/, "Hello Mundo must not be seeded as a built-in catalog item or included in built-in plans");
  assert.match(registrySource, /retireBundledPlatformPackage/, "legacy bundled records must be retired");
  assert.match(registrySource, /status:\s*"deprecated"/, "retired package records must be hidden from active listings");
  assert.match(platformAdminSource, /RETIRED_PACKAGE_POLICIES/, "platform startup must consume the central retirement policy");
  assert.match(manifestRegistrySource, /id:\s*"hello-world",\s*retireSignedZip:\s*false/, "Hello Mundo retirement must be declared in the central package registry");
});


test("Control Horario backend is independent from Files and scopes tenant-owned persistence through its repository", async () => {
  const pluginSource = await readFile(join(process.cwd(), "src/plugins/time-tracking/time-tracking.plugin.ts"), "utf8");
  const packageSource = await readFile(join(process.cwd(), "scripts/build-plugin-packages.mjs"), "utf8");
  const entitlementSource = await readFile(join(process.cwd(), "src/core/plugin-entitlements.ts"), "utf8");
  const repositorySource = await readFile(join(process.cwd(), "src/plugins/time-tracking/time-tracking.repository.ts"), "utf8");
  const handlersSource = await readFile(join(process.cwd(), "src/plugins/time-tracking/time-tracking.handlers.ts"), "utf8");
  const platformAdminSource = await readFile(join(process.cwd(), "src/plugins/platform-admin/platform-admin.plugin.ts"), "utf8");

  assert.match(pluginSource, /dependencies:\s*\["auth",\s*"organizations"\]/);
  assert.doesNotMatch(pluginSource, /files|FilesStorageAdapter/i);
  assert.doesNotMatch(entitlementSource, /id: "time-tracking",\s*name: "Control Horario"/, "Control Horario must not remain a trusted bundled marketplace package");
  const manifestRegistrySource = await readFile(join(process.cwd(), "src/plugins/plugin-manifest-registry.ts"), "utf8");
  assert.match(platformAdminSource, /RETIRED_PACKAGE_POLICIES/, "platform startup must consume the central retirement policy");
  assert.match(manifestRegistrySource, /id:\s*"time-tracking",\s*retireSignedZip:\s*false/, "Control Horario bundled retirement must be declared centrally");
  assert.match(packageSource, /id:\s*"time-tracking"[\s\S]*?dependencies:\s*\["auth",\s*"organizations"\]/);
  assert.doesNotMatch(packageSource.match(/\{ id: "time-tracking"[\s\S]*?\},/)?.[0] ?? "", /files|marketplace/i);
  assert.match(repositorySource, /sessionsForTenant/);
  assert.match(repositorySource, /schedulesForTenant/);
  assert.match(repositorySource, /correctionsForTenant/);
  assert.match(repositorySource, /membershipsForTenant/);
  assert.doesNotMatch(handlersSource, /new TenantCollection/);
  const runtimeSource = await readFile(join(process.cwd(), "src/index.ts"), "utf8");
  const timeTrackingFrontendSource = await readFile(join(process.cwd(), "apps/web/src/app/time-tracking/time-tracking.frontend.ts"), "utf8");
  const frontendRegistrationsSource = await readFile(join(process.cwd(), "apps/web/src/app/plugins/plugin-frontend-registrations.ts"), "utf8");
  assert.doesNotMatch(runtimeSource, /import\s*\{\s*timeTrackingPlugin\s*\}/, "Control Horario backend must load from its signed ZIP only");
  assert.doesNotMatch(runtimeSource, /plugins\.register\(timeTrackingPlugin\)/, "Control Horario must not retain a bundled backend fallback");
  assert.match(timeTrackingFrontendSource, /loadComponent:[\s\S]*BeeTimeTrackingComponent/);
  assert.match(frontendRegistrationsSource, /timeTrackingFrontend/);
  const outletSource = await readFile(join(process.cwd(), "apps/web/src/app/plugins/plugin-outlet.component.ts"), "utf8");
  assert.ok(outletSource.indexOf("this.registry.resolve(pluginId)") < outletSource.indexOf("this.loadRemoteRuntime(pluginId)"), "native plugin frontends must render before the remote iframe fallback");
  assert.match(handlersSource, /repository\.sessionsForTenant/);
  assert.match(handlersSource, /repository\.schedulesForTenant/);
  assert.match(handlersSource, /repository\.correctionsForTenant/);
  assert.match(handlersSource, /repository\.membershipsForTenant/);
});
