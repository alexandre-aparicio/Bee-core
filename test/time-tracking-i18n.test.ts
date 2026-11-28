import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("Control Horario English and Spanish catalogues have identical keys", async () => {
  const source = await readFile(
    resolve(process.cwd(), "plugins/time-tracking/frontend/src/time-tracking.catalog.ts"),
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


test("Control Horario UI and backend error codes resolve to catalogue entries", async () => {
  const root = process.cwd();
  const catalog = await readFile(resolve(root, "plugins/time-tracking/frontend/src/time-tracking.catalog.ts"), "utf8");
  const component = await readFile(resolve(root, "plugins/time-tracking/frontend/src/time-tracking.component.ts"), "utf8");
  const template = await readFile(resolve(root, "plugins/time-tracking/frontend/src/time-tracking.component.html"), "utf8");
  const handlers = await readFile(resolve(root, "src/plugins/time-tracking/time-tracking.handlers.ts"), "utf8");
  const english = catalog.match(/export const TIME_TRACKING_EN = \{([\s\S]*?)\} as const;/)?.[1] ?? "";
  const catalogueKeys = new Set([...english.matchAll(/^\s*"([^"]+)":/gm)].map(match => match[1]));
  const referencedKeys = [...(component + "\n" + template).matchAll(/\bt\(\s*['"]([^'"]+)['"]\s*\)/g)].map(match => match[1]);
  for (const key of referencedKeys) assert.ok(catalogueKeys.has(key), "Missing Control Horario translation: " + key);

  const dynamicKeys = [
    "management", "my_information", "schedule_planning", "my_schedule", "schedule_configure",
    "schedule_view", "incidents", "requests", "my_requests", "corrections", "sent_requests",
    "entry", "exit", "weekday_sunday", "weekday_monday", "weekday_tuesday", "weekday_wednesday",
    "weekday_thursday", "weekday_friday", "weekday_saturday"
  ];
  for (const key of dynamicKeys) assert.ok(catalogueKeys.has(key), "Missing dynamic Control Horario translation: " + key);

  const errorCodes = [...handlers.matchAll(/errorCode:\s*"([^"]+)"/g)].map(match => match[1]);
  assert.ok(errorCodes.length > 0, "Backend must expose stable error codes");
  for (const code of errorCodes) assert.ok(catalogueKeys.has("error_" + code), "Missing backend error translation: " + code);
});
