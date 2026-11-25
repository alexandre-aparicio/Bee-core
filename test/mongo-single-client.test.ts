import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runtimeFiles = [
  "../src/index.ts",
  "../src/plugins/auth/auth.plugin.ts",
  "../src/plugins/files/files.plugin.ts",
  "../src/plugins/mail/mail.plugin.ts",
  "../src/plugins/marketplace/marketplace.plugin.ts",
  "../src/plugins/notifications/notifications.plugin.ts",
  "../src/plugins/organizations/organizations.plugin.ts",
  "../src/plugins/platform-admin/platform-admin.plugin.ts"
];

test("the core owns the only MongoClient and every data plugin reuses it", () => {
  const sources = runtimeFiles.map(path => readFileSync(new URL(path, import.meta.url), "utf8"));
  const [core, ...plugins] = sources;
  assert.equal(core.split("new MongoClient(").length - 1, 1);
  assert.equal(plugins.reduce((count, source) => count + source.split("new MongoClient(").length - 1, 0), 0);
  assert.ok(plugins.every(source => source.includes("ctx.mongoClient.db(")));
  assert.ok(core.includes("await mongoClient.connect()"));
  assert.ok(core.includes("app.addHook(\"onClose\"") && core.includes("mongoClient.close()"));
});
