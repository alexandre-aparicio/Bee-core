import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Script } from "node:vm";

function readDictionary(source: string, name: "EN" | "ES", next: string): Record<string, unknown> {
  const start = source.indexOf("const " + name + "=");
  const end = source.indexOf(next, start);
  assert.ok(start >= 0 && end > start, name + " dictionary must be present in the signed ZIP frontend");
  const assignment = source.slice(start + ("const " + name + "=").length, end).trim().replace(/;$/, "");
  return new Script("(" + assignment + ")").runInNewContext() as Record<string, unknown>;
}

test("Control Horario English and Spanish dictionaries have identical keys", async () => {
  const source = await readFile(resolve(process.cwd(), "src/plugins/time-tracking/frontend/main.js"), "utf8");
  const english = readDictionary(source, "EN", ";\nconst ES=");
  const spanish = readDictionary(source, "ES", ";\nlet lang=");
  const enKeys = Object.keys(english).sort();
  const esKeys = Object.keys(spanish).sort();
  assert.deepEqual(enKeys, esKeys, "EN/ES translation keys must remain in parity");
  assert.equal(new Set(enKeys).size, enKeys.length, "English dictionary must not contain duplicate keys");
  assert.equal(new Set(esKeys).size, esKeys.length, "Spanish dictionary must not contain duplicate keys");
});

test("Control Horario ZIP UI keys and every backend error code have localized messages", async () => {
  const root = process.cwd();
  const frontend = await readFile(resolve(root, "src/plugins/time-tracking/frontend/main.js"), "utf8");
  const handlers = await readFile(resolve(root, "src/plugins/time-tracking/time-tracking.handlers.ts"), "utf8");
  const english = readDictionary(frontend, "EN", ";\nconst ES=");
  const spanish = readDictionary(frontend, "ES", ";\nlet lang=");
  const referencedKeys = [...frontend.matchAll(/\bt\("([^"]+)"\)/g)].map(match => match[1]);
  for (const key of referencedKeys) {
    assert.ok(Object.hasOwn(english, key), "Missing English Control Horario translation: " + key);
    assert.ok(Object.hasOwn(spanish, key), "Missing Spanish Control Horario translation: " + key);
  }
  for (const key of ["success_clock_in", "success_break_start", "success_break_end", "success_clock_out", "pending", "approved", "rejected"]) {
    assert.ok(Object.hasOwn(english, key), "Missing dynamic English translation: " + key);
    assert.ok(Object.hasOwn(spanish, key), "Missing dynamic Spanish translation: " + key);
  }

  const errorMapper = frontend.match(/function apiError\(code\)\{const messages=\{([\s\S]*?)\};return messages\[code\]/)?.[1] ?? "";
  assert.ok(errorMapper, "ZIP frontend must translate backend error codes");
  const errorCodes = [...handlers.matchAll(/errorCode:\s*"([^"]+)"/g)].map(match => match[1]);
  assert.ok(errorCodes.length > 0, "Backend must expose stable error codes");
  for (const code of errorCodes) {
    assert.match(errorMapper, new RegExp("\\b" + code + ":"), "Missing user-facing error message for backend code: " + code);
  }
});
