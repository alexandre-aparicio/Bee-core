import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
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


test("Connected Devices backend is ZIP-only and its native Angular frontend is statically registered", async () => {
  const backendBootstrap = await readFile(resolve(root, "src/index.ts"), "utf8");
  assert.doesNotMatch(backendBootstrap, /connectedDevicesPlugin|connected-devices/, "backend bootstrap must not import or register Connected Devices");

  const coreSources = [
    "src/core/plugin-manager.ts",
    "src/core/plugin-entitlements.ts",
    "src/core/plugin-package.ts",
    "src/plugins/platform-admin/platform-admin.plugin.ts"
  ];
  for (const file of coreSources) {
    const source = await readFile(resolve(root, file), "utf8");
    assert.doesNotMatch(source, /connected-devices|connectedDevicesPlugin/i, file + " must not contain Connected Devices package-specific logic");
  }

  const manifestRegistry = await readFile(resolve(root, "src/plugins/plugin-manifest-registry.ts"), "utf8");
  const builtInPlans = manifestRegistry.slice(manifestRegistry.indexOf("export const BUILT_IN_PLANS"), manifestRegistry.indexOf("export const TRUSTED_PLUGIN_PACKAGES"));
  const trustedPackages = manifestRegistry.split("export const MIGRATABLE_BUILT_IN_PACKAGE_IDS")[0] ?? "";
  assert.doesNotMatch(builtInPlans, /connected-devices/, "Connected Devices must not be a built-in plan entitlement");
  assert.doesNotMatch(trustedPackages, /id:\s*"connected-devices"/, "Connected Devices must not be seeded as a trusted bundled package");

  const hostAccess = await readFile(resolve(root, "src/index.ts"), "utf8");
  const marketplace = await readFile(resolve(root, "src/plugins/marketplace/marketplace.plugin.ts"), "utf8");
  const packagePlugin = await readFile(resolve(root, "src/plugins/connected-devices/connected-devices.plugin.ts"), "utf8");
  const packageManifest = await readFile(resolve(root, "src/plugins/connected-devices/plugin.manifest.ts"), "utf8");
  const packageBuilder = await readFile(resolve(root, "scripts/build-plugin-packages.mjs"), "utf8");
  const runtime = await readFile(resolve(root, "src/core/dynamic-plugin-runtime.ts"), "utf8");
  assert.ok(hostAccess.includes('pluginServices.register("core.plugin-access"'));
  assert.doesNotMatch(hostAccess, /marketplace\\.plugin-access|LEGACY_PLUGIN_PLAN_ASSIGNMENT_MIGRATIONS/);
  assert.doesNotMatch(marketplace, /marketplace\\.plugin-access/);
  assert.ok(packagePlugin.includes('core.plugin-access'));
  assert.ok(packagePlugin.includes('afterRuntimeLoaded'));
  assert.doesNotMatch(packagePlugin + packageManifest, /marketplace/);
  assert.ok(runtime.includes('afterRuntimeLoaded'));
  assert.ok(packageBuilder.includes('id: "connected-devices"') && packageBuilder.includes('dependencies: ["auth", "organizations"]'));
  const legacyRegistry = await readFile(resolve(root, "src/plugins/plugin-manifest-registry.ts"), "utf8");
  assert.doesNotMatch(legacyRegistry, /connected-devices|connectedDevices|LEGACY_PLUGIN_PLAN_ASSIGNMENT_MIGRATIONS/);
  assert.ok(packagePlugin.includes('migrateLegacyConnectedDevicesPlanAssignments'));
  const frontendRegistrations = await readFile(resolve(root, "apps/web/src/app/plugins/plugin-frontend-registrations.ts"), "utf8");
  assert.match(frontendRegistrations, /connectedDevicesFrontend/);
  const remoteRegistry = await readFile(resolve(root, "apps/web/src/app/plugins/plugin-frontend-registry.service.ts"), "utf8");
  assert.match(remoteRegistry, /setRemoteNavigation/);
  const dashboard = await readFile(resolve(root, "apps/web/src/app/app.component.ts"), "utf8");
  assert.doesNotMatch(dashboard, /connected-devices|connectedDevicesFrontend/i, "the dashboard root must consume the generic frontend registry");
  assert.match(dashboard, /setRemoteNavigation/);
  assert.match(dashboard, /frontendRoutes/);
  const packageUpload = await readFile(resolve(root, "src/plugins/platform-admin/platform-admin.plugin.ts"), "utf8");
  assert.ok(packageUpload.includes("admin-plan-selection-v1"));
  assert.match(packageUpload, /frontendRoutes:Array.isArray\(manifest.frontend\?\.routes\)/, "verified ZIP navigation metadata must be persisted with the catalogue entry");
  const tenantCatalog = await readFile(resolve(root, "src/core/plugin-entitlements.ts"), "utf8");
  assert.match(tenantCatalog, /frontendRoutes: Array.isArray\(plugin.frontendRoutes\)/, "tenant-visible package routes must be projected from the package catalogue");

  const frontend = await readFile(resolve(root, "apps/web/src/app/connected-devices/connected-devices.frontend.ts"), "utf8");
  const component = await readFile(resolve(root, "apps/web/src/app/connected-devices/connected-devices.component.ts"), "utf8");
  assert.ok(frontend.includes("loadComponent:") && frontend.includes("BeeConnectedDevicesComponent"));
  assert.ok(frontend.includes("/dashboard/connected-devices"));
  assert.doesNotMatch(component, /iframe|postMessage|marketplace/);
  assert.ok(component.includes('fetch("/api" + path'));
  assert.ok((await readFile(resolve(root, "apps/web/src/assets/connected-devices/qrcode.min.js"), "utf8")).length > 1000,
    "QR renderer must be shipped as a web asset, not inside the backend ZIP");
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

test("remote plugin theme bridge sends semantic presentation only", async () => {
  const outlet = await readFile(resolve(root, "apps/web/src/app/plugins/plugin-outlet.component.ts"), "utf8");
  assert.match(outlet, /type:\s*"bee-plugin:theme"/);
  assert.match(outlet, /getComputedStyle\(host\)/);
  assert.match(outlet, /surface-raised/);
  assert.match(outlet, /status-success/);
  const themeMethods = outlet.slice(outlet.indexOf("private themePayload()"), outlet.indexOf("private async loadRemoteRuntime"));
  assert.match(themeMethods, /postMessage\(\{ type: "bee-plugin:theme"/);
  assert.doesNotMatch(themeMethods, /accessToken|authorization|credential|secret|jwt/i,
    "theme messages must never include credentials or authentication material");

  const component = await readFile(resolve(root, "apps/web/src/app/connected-devices/connected-devices.component.ts"), "utf8");
  assert.ok(component.includes("var(--bee-text)"));
  assert.ok(component.includes("var(--bee-surface)"));
  assert.doesNotMatch(component, /bee-plugin:theme|postMessage|iframe/,
    "the native Angular UI inherits the host theme directly and must not use a cross-frame bridge");
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
    // This is the single source for package metadata and legacy migration policy.
    "src/plugins/plugin-manifest-registry.ts": ["files"],
    // Feature IDs may appear only in the declarative registration list.
    "apps/web/src/app/plugins/plugin-frontend-registrations.ts": ["documents", "time-tracking", "connected-devices"],
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
