import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Script } from "node:vm";
import { buildPluginPackages } from "../scripts/build-plugin-packages.mjs";
import { installSignedPluginZip } from "../src/core/plugin-zip-installer.js";

const distReady = existsSync(join(process.cwd(), "dist/plugins/documents/documents.plugin.js"));

test("four first-party modules build as independently signed ZIP packages", { skip: !distReady }, async () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const root = await mkdtemp(join(tmpdir(), "bee-first-party-packages-"));
  try {
    const built = await buildPluginPackages({
      privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      outputDir: join(root, "archives")
    });
    assert.deepEqual(built.map(item => item.id).sort(), ["connected-devices", "documents", "hello-world", "time-tracking"]);
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
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
        assert.equal(installed.manifest.frontend.entrypoint, "frontend/index.html");
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
        assert.doesNotThrow(() => new Script(script), "the standalone Connected Devices frontend must be valid JavaScript");
        assert.doesNotThrow(() => new Script(qr), "the bundled QR renderer must be valid JavaScript");
      } else if (item.id === "time-tracking") {
        assert.equal(installed.manifest.frontend.entrypoint, "frontend/index.html");
        assert.deepEqual(installed.manifest.frontend.apiPrefixes, ["/time-tracking"]);
        assert.ok(installed.manifest.frontend.assets?.includes("frontend/main.js"));
        const html = await readFile(join(installed.packageDirectory, "frontend/index.html"), "utf8");
        const script = await readFile(join(installed.packageDirectory, "frontend/main.js"), "utf8");
        assert.match(html, /Control horario/);
        assert.match(script, /clock-in/);
        assert.match(script, /team\/schedules/);
        assert.match(script, /team\/corrections/);
        assert.match(script, /submitCorrection/);
        assert.match(script, /saveSchedule/);
        assert.match(script, /confirmReview/);
        assert.match(script, /renderReviewModal/);
        assert.match(script, /clock-in/);
        assert.match(script, /break-start/);
        assert.match(script, /break-end/);
        assert.match(script, /clock-out/);
        assert.doesNotThrow(() => new Script(script), "the standalone Time Tracking frontend must be valid JavaScript");
      } else if (item.id === "documents") {
        assert.equal(installed.manifest.version, "0.1.2", "Documents must publish the decoupled manual-activation package version");
        assert.equal(installed.manifest.activationPolicy, "manual", "Documents must follow the same opt-in tenant activation policy as Hello Mundo");
        assert.equal(installed.manifest.frontend.entrypoint, "frontend/index.html");
        assert.deepEqual(installed.manifest.frontend.apiPrefixes, ["/documents", "/public/documents"]);
        assert.deepEqual(installed.manifest.dependencies.map((dependency: { pluginId: string }) => dependency.pluginId), ["auth", "organizations"]);
        assert.deepEqual(installed.manifest.tenantDependencies, []);
        assert.ok(existsSync(join(installed.packageDirectory, "dist/plugins/documents/documents-storage.adapter.js")), "the signed ZIP must include Documents-owned storage in its backend graph");
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



test("Hello Mundo and Documents are not registered or advertised as bundled plugins", async () => {
  const runtimeSource = await readFile(join(process.cwd(), "src/index.ts"), "utf8");
  const entitlementSource = await readFile(join(process.cwd(), "src/core/plugin-entitlements.ts"), "utf8");
  const registrySource = await readFile(join(process.cwd(), "src/core/platform-plugin-registry.ts"), "utf8");
  const platformAdminSource = await readFile(join(process.cwd(), "src/plugins/platform-admin/platform-admin.plugin.ts"), "utf8");
  const pluginManagerSource = await readFile(join(process.cwd(), "src/core/plugin-manager.ts"), "utf8");
  const frontendRegistrySource = await readFile(join(process.cwd(), "apps/web/src/app/plugins/plugin-frontend-registry.service.ts"), "utf8");
  const appComponentSource = await readFile(join(process.cwd(), "apps/web/src/app/app.component.ts"), "utf8");

  assert.doesNotMatch(runtimeSource, /import\s*\{\s*helloWorldPlugin\s*\}/);
  assert.doesNotMatch(runtimeSource, /plugins\.register\(helloWorldPlugin\)/);
  assert.match(runtimeSource, /loadSignedZipPlugins\(\)/, "Hello Mundo remains loadable through the signed ZIP runtime");
  assert.doesNotMatch(entitlementSource, /hello-world/, "Hello Mundo must not be seeded as a built-in catalog item or included in built-in plans");
  assert.doesNotMatch(runtimeSource, /documentsPlugin|documentsStoragePath/, "Documents backend and storage configuration must not be statically registered in Core");
  assert.doesNotMatch(pluginManagerSource, /documentsStoragePath|documents:\s*\[/, "Core must not contain a Documents-specific configuration allowlist");
  assert.doesNotMatch(frontendRegistrySource, /BeeDocumentsComponent|\["documents"/, "Documents must not be registered as a bundled Angular frontend");
  assert.doesNotMatch(appComponentSource, /documents/i, "the Angular shell must discover Documents through signed plugin routes, not hardcoded module wiring");
  assert.match(registrySource, /retireBundledPlatformPackage/, "legacy bundled records must be retired");
  assert.match(registrySource, /status:\s*"deprecated"/, "retired package records must be hidden from active listings");
  assert.match(platformAdminSource, /retireBundledPlatformPackage\(db,\s*"hello-world"\)/, "platform startup must retire the old bundled Hello Mundo record");
  assert.match(platformAdminSource, /retireBundledPlatformPackage\(db,\s*"documents"\)/, "platform startup must retire the old bundled Documents record");
});
