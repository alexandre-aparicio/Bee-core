import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { MongoClient } from "mongodb";
import { BeeDynamicPluginRuntime } from "../src/core/dynamic-plugin-runtime.js";
import { BeeEventBus } from "../src/core/event-bus.js";
import type { BeeContext, BeeLogger } from "../src/core/types.js";

const logger: BeeLogger = { info() {}, warn() {}, error() {} };

test("Files-dependent external plugins receive the host Files storage root", async () => {
  const hostServer = Fastify();
  const context: BeeContext = {
    appName: "Bee-Core",
    version: "test",
    events: new BeeEventBus(),
    logger,
    server: hostServer,
    mongoClient: new MongoClient("mongodb://localhost:27017"),
    config: Object.freeze({
      mongoDbName: "bee_core_test",
      fileStoragePath: "/srv/bee-custom-files",
      sessionIdSecret: "a".repeat(64)
    })
  };
  const runtime = new BeeDynamicPluginRuntime(
    () => context,
    "b".repeat(64),
    () => [{ name: "files", version: "0.1.0", status: "started" } as any]
  );
  let receivedStorageRoot: unknown;
  try {
    await runtime.mount({
      manifest: { name: "documents", version: "0.1.5", dependencies: ["files"] },
      initialize(pluginContext) {
        receivedStorageRoot = pluginContext.config.fileStoragePath;
      }
    });
    assert.equal(receivedStorageRoot, "/srv/bee-custom-files");
  } finally {
    await runtime.stopAll();
    await hostServer.close();
  }
});
