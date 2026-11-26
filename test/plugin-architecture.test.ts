import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && /\.(?:ts|html)$/.test(entry.name) ? [path] : [];
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


test("Connected Devices is ZIP-only and has no Core or Angular static registration", async () => {
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
  const builtInPlans = manifestRegistry.split("export const TRUSTED_PLUGIN_PACKAGES")[0] ?? "";
  const trustedPackages = manifestRegistry.split("export const MIGRATABLE_BUILT_IN_PACKAGE_IDS")[0] ?? "";
  assert.doesNotMatch(builtInPlans, /connected-devices/, "Connected Devices must not be a built-in plan entitlement");
  assert.doesNotMatch(trustedPackages, /id:\s*"connected-devices"/, "Connected Devices must not be seeded as a trusted bundled package");

  const frontendRegistrations = await readFile(resolve(root, "apps/web/src/app/plugins/plugin-frontend-registrations.ts"), "utf8");
  assert.doesNotMatch(frontendRegistrations, /connected-devices|connectedDevicesFrontend/i);
  const remoteRegistry = await readFile(resolve(root, "apps/web/src/app/plugins/plugin-frontend-registry.service.ts"), "utf8");
  assert.match(remoteRegistry, /setRemoteNavigation/);
  const dashboard = await readFile(resolve(root, "apps/web/src/app/app.component.ts"), "utf8");
  assert.doesNotMatch(dashboard, /connected-devices|connectedDevicesFrontend/i, "the dashboard root must not know the Connected Devices package ID");
  assert.match(dashboard, /setRemoteNavigation/);
  assert.match(dashboard, /frontendRoutes/);
  const packageUpload = await readFile(resolve(root, "src/plugins/platform-admin/platform-admin.plugin.ts"), "utf8");
  assert.match(packageUpload, /frontendRoutes:Array.isArray\(manifest.frontend\?\.routes\)/, "verified ZIP navigation metadata must be persisted with the catalogue entry");
  const tenantCatalog = await readFile(resolve(root, "src/core/plugin-entitlements.ts"), "utf8");
  assert.match(tenantCatalog, /frontendRoutes: Array.isArray\(plugin.frontendRoutes\)/, "tenant-visible package routes must be projected from the package catalogue");

  for (const file of [
    "apps/web/src/app/connected-devices/connected-devices-api.service.ts",
    "apps/web/src/app/connected-devices/connected-devices.component.ts",
    "apps/web/src/app/connected-devices/connected-devices.frontend.ts"
  ]) {
    await assert.rejects(readFile(resolve(root, file), "utf8"), { code: "ENOENT" }, file + " must be removed from the Angular host");
  }
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
