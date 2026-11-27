import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { composePermissionCatalog } from "../src/core/permission-catalog.js";
import { createFrontendRegistrationMap } from "../apps/web/src/app/plugins/plugin-frontend-registration-map.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && /\.(?:ts|html|js|mjs)$/.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

test("Core and host dashboard stay independent from feature package identifiers", async () => {
  // Documents and Files are the only approved shared-storage boundary names in Core.
  const coreFiles = await sourceFiles(resolve(root, "src/core"));
  for (const path of coreFiles) {
    const source = await readFile(path, "utf8");
    for (const name of ["connected-devices", "time-tracking"]) {
      assert.doesNotMatch(source, new RegExp("\\b" + name + "\\b", "i"), relative(root, path) + " must not depend on feature package " + name);
    }
  }

  const hostFiles = [
    "apps/web/src/app/app.component.ts",
    "apps/web/src/app/templates/packages/shared/dashboard-page.component.ts",
    "apps/web/src/app/plugins/plugin-frontend-registry.service.ts",
    "apps/web/src/app/i18n/catalogs/core.catalog.ts",
    "apps/web/src/app/i18n/bee-i18n.service.ts"
  ];
  for (const file of hostFiles) {
    const source = await readFile(resolve(root, file), "utf8");
    assert.doesNotMatch(source, /\b(?:documents|connected-devices|time-tracking)\b/i, file + " must consume generic frontend registrations");
  }
});


test("Connected Devices frontend is a signed Native Federation remote, not static Core code", async () => {
  const bootstrap = await readFile(resolve(root, "src/index.ts"), "utf8");
  assert.doesNotMatch(bootstrap, /connectedDevicesPlugin|connected-devices/);
  const registry = await readFile(resolve(root, "src/plugins/plugin-manifest-registry.ts"), "utf8");
  assert.doesNotMatch(registry, /connected-devices|connectedDevices|LEGACY_PLUGIN_PLAN_ASSIGNMENT_MIGRATIONS/);
  const builder = await readFile(resolve(root, "scripts/build-plugin-packages.mjs"), "utf8");
  assert.match(builder, /frontendDist:/);
  assert.match(builder, /remoteEntry:\s*"frontend\/remoteEntry\.json"/);
  assert.match(builder, /remoteName:\s*"connectedDevices"/);
  assert.match(builder, /exposedModule:\s*"\.\/Component"/);
  assert.match(builder, /collectFrontendDistribution/);

  const hostRegistrations = await readFile(resolve(root, "apps/web/src/app/plugins/plugin-frontend-registrations.ts"), "utf8");
  assert.doesNotMatch(hostRegistrations, /connected-devices|connectedDevices/i);
  const hostSources = await sourceFiles(resolve(root, "apps/web/src/app"));
  assert.equal(hostSources.some(path => path.includes("/connected-devices/")), false,
    "Connected Devices feature source must not be compiled from the Core Angular application");
  assert.equal(existsSync(resolve(root, "apps/web/src/app/connected-devices/connected-devices.component.ts")), false);

  const federation = await readFile(resolve(root, "plugins/connected-devices/frontend/federation.config.js"), "utf8");
  const remoteEntry = await readFile(resolve(root, "plugins/connected-devices/frontend/src/plugin.component.ts"), "utf8");
  const component = await readFile(resolve(root, "plugins/connected-devices/frontend/src/connected-devices.component.ts"), "utf8");
  assert.match(federation, /withNativeFederation/);
  assert.match(federation, /shareAll\(\{ singleton:\s*true, strictVersion:\s*true/);
  assert.match(remoteEntry, /BeeConnectedDevicesComponent as PluginComponent/);
  assert.match(component, /export class BeeConnectedDevicesComponent/);
  assert.match(component, /assetBaseUrl/);
  assert.match(component, /pairing-challenges/);
  assert.doesNotMatch(component, /iframe|postMessage|marketplace/);

  const outlet = await readFile(resolve(root, "apps/web/src/app/plugins/plugin-outlet.component.ts"), "utf8");
  const nativeMount = outlet.slice(outlet.indexOf('if (runtime.transport === "native-federation"'), outlet.indexOf("if (!runtime.entrypoint)"));
  assert.match(nativeMount, /loadRemoteModule/);
  assert.match(nativeMount, /createComponent/);
  assert.match(nativeMount, /assetBaseUrl/);
  assert.doesNotMatch(nativeMount, /iframe|postMessage/);
  const frontendRegistry = await readFile(resolve(root, "apps/web/src/app/plugins/plugin-frontend-registry.service.ts"), "utf8");
  assert.match(frontendRegistry, /setRemoteNavigation/);
  const dashboard = await readFile(resolve(root, "apps/web/src/app/app.component.ts"), "utf8");
  assert.doesNotMatch(dashboard, /connected-devices|connectedDevicesFrontend/i);
  assert.match(dashboard, /frontendRoutes/);
  const packageUpload = await readFile(resolve(root, "src/plugins/platform-admin/platform-admin.plugin.ts"), "utf8");
  assert.match(packageUpload, /frontendRoutes:Array.isArray\(manifest.frontend\?\.routes\)/);
  const tenantCatalog = await readFile(resolve(root, "src/core/plugin-entitlements.ts"), "utf8");
  assert.match(tenantCatalog, /frontendRoutes: Array.isArray\(plugin.frontendRoutes\)/);
});

test("Connected Devices simulator remains a separate developer asset with its security allowances", async () => {
  const angular = await readFile(resolve(root, "apps/web/angular.json"), "utf8");
  const styleGuard = JSON.parse(await readFile(resolve(root, "apps/web/scripts/style-guard.config.json"), "utf8"));
  const simulator = await readFile(resolve(root, "apps/web/src/assets/device-simulator/device-simulator.js"), "utf8");
  const server = await readFile(resolve(root, "src/index.ts"), "utf8");
  assert.match(angular, /src\/assets\/device-simulator/);
  assert.ok(styleGuard.allowlist?.some((item: { pattern?: string }) => item.pattern === "src/assets/device-simulator/**"));
  assert.match(simulator, /fetch\(api\(\)\+path/);
  assert.match(simulator, /method:"POST",body:"\{\}"/, "heartbeat must keep an explicit JSON body");
  assert.match(server, /"https:\/\/localhost,capacitor:\/\/localhost"/);
  assert.match(server, /"x-device-pairing-secret"/);
  assert.match(server, /"POST"/);
});

test("Native Federation Connected Devices inherits host theme tokens without a cross-frame bridge", async () => {
  const outlet = await readFile(resolve(root, "apps/web/src/app/plugins/plugin-outlet.component.ts"), "utf8");
  const nativeMount = outlet.slice(outlet.indexOf('if (runtime.transport === "native-federation"'), outlet.indexOf("if (!runtime.entrypoint)"));
  assert.match(nativeMount, /loadRemoteModule/);
  assert.match(nativeMount, /createComponent/);
  assert.doesNotMatch(nativeMount, /postMessage|iframe/);
  const component = await readFile(resolve(root, "plugins/connected-devices/frontend/src/connected-devices.component.ts"), "utf8");
  const template = await readFile(resolve(root, "plugins/connected-devices/frontend/src/connected-devices.component.html"), "utf8");
  const styles = await readFile(resolve(root, "plugins/connected-devices/frontend/src/connected-devices.component.css"), "utf8");
  assert.match(template, /class="bee-page-header"/);
  assert.match(template, /class="bee-stat-card"/);
  assert.match(component, /styleUrls:\s*\["\.\/connected-devices\.component\.css"\]/);
  assert.match(styles, /var\(--bee-(?:text|surface|border|accent)/);
  assert.doesNotMatch(component + template, /bee-plugin:theme|postMessage|iframe/);
});


test("generic host paths contain no feature-specific branches outside the explicit manifest and registration allowlist", async () => {
  const roots = [
    "src/plugins/marketplace",
    "src/plugins/platform-admin",
    "apps/web/src/app/plugins",
    "apps/web/src/app/templates"
  ];
  const files = [
    "src/index.ts",
    "src/plugins/plugin-manifest-registry.ts",
    ...(await Promise.all(roots.map(rootPath => sourceFiles(resolve(root, rootPath))))).flat()
  ];
  const allowed: Record<string, readonly string[]> = {
    // The backend bootstrap retains the approved Files and Documents native fallbacks.
    "src/index.ts": ["files", "documents"],
    // The registry contains only host package metadata and generic retirement exceptions.
    "src/plugins/plugin-manifest-registry.ts": ["files", "time-tracking"],
    // Feature IDs may appear only in the declarative registration list.
    "apps/web/src/app/plugins/plugin-frontend-registrations.ts": ["documents", "time-tracking"],
    // These generic uses refer to browser file inputs and package archive files, not plugin IDs.
    "src/plugins/platform-admin/platform-admin.plugin.ts": ["files"],
    "apps/web/src/app/plugins/plugin-settings.component.ts": ["files"]
  };
  const identifiers = ["documents", "files", "connected-devices", "time-tracking"];
  for (const relativePath of files.map(file => relative(root, file))) {
    const source = await readFile(resolve(root, relativePath), "utf8");
    for (const identifier of identifiers) {
      if (allowed[relativePath]?.includes(identifier)) continue;
      assert.doesNotMatch(source, new RegExp("\\b" + identifier + "\\b", "i"),
        relativePath + " must not contain a hard-coded " + identifier + " module branch");
    }
  }
});

test("permission catalog and frontend registry compose a previously unknown plugin ID", () => {
  const pluginId = "fixture.analytics";
  const permission = {
    key: pluginId + ".read",
    module: pluginId,
    resource: "reports",
    action: "read",
    label: "Read reports",
    defaultGrants: { owner: true, admin: true, manager: true, member: false }
  };
  const composed = composePermissionCatalog([{ id: pluginId, permissions: [permission] }]);
  assert.ok(composed.some(item => item.key === pluginId + ".read" && item.module === pluginId),
    "a feature-owned permission must compose without a Core module branch");

  const registration = {
    pluginId,
    navigation: { id: pluginId, label: "Analytics", labelEs: "Analítica", icon: "chart", group: "WORKSPACE" }
  };
  const registry = createFrontendRegistrationMap([registration]);
  assert.equal(registry.get(pluginId), registration,
    "a generic frontend registration must resolve an arbitrary valid plugin ID");
  assert.throws(() => createFrontendRegistrationMap([registration, registration]), /Duplicate plugin frontend registration/);
});
