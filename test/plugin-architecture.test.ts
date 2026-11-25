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
