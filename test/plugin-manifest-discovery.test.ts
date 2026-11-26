import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { TRUSTED_PLUGIN_PACKAGES } from "../src/plugins/plugin-manifest-registry.js";

const root = process.cwd();

test("first-party package manifests are owned by plugin folders and consumed by registry and ZIP builder", async () => {
  const pluginFolders = await readdir(resolve(root, "src/plugins"), { withFileTypes: true });
  const folderNames = new Set(pluginFolders.filter(item => item.isDirectory()).map(item => item.name));
  for (const pluginId of ["time-tracking", "connected-devices"]) {
    assert.ok(folderNames.has(pluginId), "plugin folder must exist: " + pluginId);
    const manifest = await readFile(resolve(root, "src/plugins", pluginId, "plugin.manifest.ts"), "utf8");
    assert.match(manifest, /export const PLUGIN_MANIFEST/);
    assert.match(manifest, new RegExp('id: "' + pluginId + '"'));
    assert.match(manifest, /permissions:\s*\[/);
    assert.match(manifest, /permissions:\s*\[/);
  }

  const builder = await readFile(resolve(root, "scripts/build-plugin-packages.mjs"), "utf8");
  assert.match(builder, /async function discoverPluginManifests/);
  assert.match(builder, /readdir\(sourceRoot/);
  assert.match(builder, /plugin\.manifest\.ts/);
  assert.match(builder, /permissions: pluginManifest\?\.permissions/);
  assert.doesNotMatch(builder, /PACKAGE_PERMISSIONS/, "permission arrays must not be duplicated in the package builder");

  assert.equal(TRUSTED_PLUGIN_PACKAGES.some(item => item.id === "documents"), false,
    "Documents must not be seeded as a trusted built-in package");
});
