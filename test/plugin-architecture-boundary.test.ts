import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const root = new URL("../", import.meta.url).pathname;
const coreRoot = join(root, "src/core");
const hostFiles = [
  "apps/web/src/app/app.component.ts",
  "apps/web/src/app/templates/packages/shared/dashboard-page.component.ts",
  "apps/web/src/app/plugins/plugin-frontend-registry.service.ts",
  "apps/web/src/app/plugins/plugin-outlet.component.ts",
  "apps/web/src/app/i18n/catalogs/core.catalog.ts"
];

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : path.endsWith(".ts") ? [path] : [];
  });
}

test("core and dashboard host do not hardcode decoupled product module IDs", () => {
  // Intentional allowlist: Documents and Files remain coupled while Documents depends on Files.
  const files = [...walk(coreRoot), ...hostFiles.map(path => join(root, path))];
  const forbidden = /\b(?:time-tracking|connected-devices|notes)\b/i;
  const violations = files.flatMap(path => {
    const source = readFileSync(path, "utf8");
    return forbidden.test(source) ? [relative(root, path)] : [];
  });
  assert.deepEqual(violations, []);
});
