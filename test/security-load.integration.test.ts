import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { MongoClient } from "mongodb";
import { authPlugin } from "../src/plugins/auth/auth.plugin.js";
import { BeeEventBus } from "../src/core/event-bus.js";
import type { BeeContext, BeeLogger } from "../src/core/types.js";

const uri = process.env.MONGODB_TEST_URI;

test("public stream-ticket flood stays bounded and returns 429 at capacity", { skip: !uri }, async () => {
  const dbName = "bee_security_load_" + Date.now();
  const client = new MongoClient(uri!);
  await client.connect();
  const db = client.db(dbName);
  const app = Fastify();
  const logger: BeeLogger = { info(){}, warn(){}, error(){} };
  const ctx: BeeContext = {
    appName: "Bee security load test",
    version: "test",
    events: new BeeEventBus(),
    logger,
    server: app,
    mongoClient: client,
    config: {
      jwtSecret: "01234567890123456789012345678901",
      mongoUri: uri!,
      mongoDbName: dbName,
      authAdminEmail: "",
      authAdminPassword: ""
    }
  };

  try {
    await authPlugin.initialize?.(ctx);
    await app.ready();
    const before = process.memoryUsage().rss;
    let accepted = 0;
    let rejected = 0;

    for (let batch = 0; batch < 6; batch++) {
      const responses = await Promise.all(Array.from({ length: 1_000 }, () =>
        app.inject({ method: "POST", url: "/templates/public-stream-ticket", headers: { host: "load.example.test" } })
      ));
      for (const response of responses) {
        if (response.statusCode === 200) accepted++;
        else if (response.statusCode === 429) rejected++;
        else assert.fail("unexpected status from public ticket endpoint: " + response.statusCode);
      }
    }

    assert.equal(accepted, 5_000, "the live ticket store must never exceed its configured capacity");
    assert.equal(rejected, 1_000, "requests beyond capacity must be rejected, not retained or evicted");
    const after = process.memoryUsage().rss;
    assert.ok(after - before < 96 * 1024 * 1024, "RSS growth under the bounded flood must remain below 96 MiB");
    assert.equal((await app.inject({ method: "POST", url: "/templates/public-stream-ticket", headers: { host: "load.example.test" } })).statusCode, 429);
  } finally {
    await app.close();
    await db.dropDatabase();
    await client.close();
  }
});
