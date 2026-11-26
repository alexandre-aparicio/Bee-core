import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("Control Horario English and Spanish catalogues have identical keys", async () => {
  const source = await readFile(
    resolve(process.cwd(), "apps/web/src/app/i18n/catalogs/modules/time-tracking.catalog.ts"),
    "utf8"
  );
  const english = source.match(/export const TIME_TRACKING_EN = \{([\s\S]*?)\} as const;/)?.[1];
  const spanish = source.match(/export const TIME_TRACKING_ES = \{([\s\S]*?)\} as const;/)?.[1];
  assert.ok(english, "English catalogue must be present");
  assert.ok(spanish, "Spanish catalogue must be present");
  const keys = (body: string) => [...body.matchAll(/^\s*"([^"]+)":/gm)].map(match => match[1]).sort();
  const enKeys = keys(english);
  const esKeys = keys(spanish);
  assert.deepEqual(enKeys, esKeys, "EN/ES translation keys must remain in parity");
  assert.equal(new Set(enKeys).size, enKeys.length, "English catalogue must not contain duplicate keys");
  assert.equal(new Set(esKeys).size, esKeys.length, "Spanish catalogue must not contain duplicate keys");
});
