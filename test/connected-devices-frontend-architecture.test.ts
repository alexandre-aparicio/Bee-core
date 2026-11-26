import { test } from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("Connected Devices UI is a native Angular frontend, not a ZIP iframe runtime", async () => {
  const root = process.cwd();
  const registrations = await readFile(resolve(root, "apps/web/src/app/plugins/plugin-frontend-registrations.ts"), "utf8");
  const frontend = await readFile(resolve(root, "apps/web/src/app/connected-devices/connected-devices.frontend.ts"), "utf8");
  const component = await readFile(resolve(root, "apps/web/src/app/connected-devices/connected-devices.component.ts"), "utf8");
  const outlet = await readFile(resolve(root, "apps/web/src/app/plugins/plugin-outlet.component.ts"), "utf8");
  assert.match(registrations, /connectedDevicesFrontend/);
  assert.match(frontend, /pluginId:\s*"connected-devices"/);
  assert.match(frontend, /loadComponent:\s*\(\)\s*=>\s*import\("\.\/connected-devices\.component"\)/);
  assert.match(frontend, /route:\s*"\/dashboard\/connected-devices"/);
  assert.match(component, /fetch\("\/api"\s*\+/);
  assert.match(component, /\/connected-devices/);
  assert.doesNotMatch(component, /iframe|postMessage|marketplace\/plugins/);
  assert.match(outlet, /Prefer a registered native host component/);
});

test("Connected Devices signed ZIP contains backend only", async () => {
  const root = process.cwd();
  const builder = await readFile(resolve(root, "scripts/build-plugin-packages.mjs"), "utf8");
  const plugin = await readFile(resolve(root, "src/plugins/connected-devices/connected-devices.plugin.ts"), "utf8");
  const manifest = await readFile(resolve(root, "src/plugins/connected-devices/plugin.manifest.ts"), "utf8");
  const definition = builder.match(/\{ id: "connected-devices",[\s\S]*?\},\n\s*\{ id: "time-tracking"/)?.[0] ?? "";
  assert.ok(definition, "Connected Devices package definition must exist");
  assert.match(definition, /frontend:\s*\{\s*routes:\s*\[\],\s*apiPrefixes:\s*\["\/connected-devices"\]\s*\}/);
  assert.match(plugin, /version:"0\.1\.5"/);
  assert.doesNotMatch(plugin, /frontend:/);
  assert.match(manifest, /version: "0\.1\.5"/);
  for (const path of [
    "src/plugins/connected-devices/frontend/index.html",
    "src/plugins/connected-devices/frontend/main.js",
    "src/plugins/connected-devices/frontend/qrcode.min.js"
  ]) {
    await assert.rejects(access(resolve(root, path)), "Obsolete ZIP frontend asset must not exist: " + path);
  }
});
