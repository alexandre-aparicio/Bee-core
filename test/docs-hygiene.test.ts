import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("MVP progress stays within 40 lines and contains tables only", async () => {
  const progress = await readFile(new URL("../docs/mvp-progress.md", import.meta.url), "utf8");
  const lines = progress.trimEnd().split(/\r?\n/);
  assert.ok(lines.length <= 40, `docs/mvp-progress.md has ${lines.length} lines (maximum 40)`);
  assert.ok(lines.every(line => line.trim() === "" || line.startsWith("|")), "docs/mvp-progress.md must contain tables only");
});

test("main baseline stays within 60 lines", async () => {
  const baseline = await readFile(new URL("../docs/main-polish-baseline.md", import.meta.url), "utf8");
  const lines = baseline.trimEnd().split(/\r?\n/);
  assert.ok(lines.length <= 60, `docs/main-polish-baseline.md has ${lines.length} lines (maximum 60)`);
});
