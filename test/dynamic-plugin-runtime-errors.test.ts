import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { BeeEventBus } from "../src/core/event-bus.js";
import { BeeDynamicPluginRuntime } from "../src/core/dynamic-plugin-runtime.js";

test("isolated plugin failures are logged without query strings and return a generic 500", async () => {
  const logged: Array<{ message: string; context: any }> = [];
  const app = Fastify({ logger: false });
  const context: any = {
    appName: "Bee-Core",
    version: "0.3.1",
    events: new BeeEventBus(),
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: (message: string, details?: unknown) => logged.push({ message, context: details })
    },
    config: {},
    server: app,
    mongoClient: {}
  };
  const runtime = new BeeDynamicPluginRuntime(() => context, "x".repeat(64), () => []);
  await runtime.mount({
    manifest: { name: "diagnostic-probe", version: "1.0.0", apiPrefixes: ["/diagnostic-probe"] },
    initialize(pluginContext: any) {
      pluginContext.server.get("/diagnostic-probe/fail", async () => {
        throw new Error("simulated database failure");
      });
    }
  });
  app.all("/*", async (request, reply) => runtime.dispatch(request, reply));
  await app.ready();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/diagnostic-probe/fail?token=must-not-be-logged"
    });
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.json(), { error: "Internal server error." });
    assert.equal(logged.length, 1);
    assert.equal(logged[0].message, "External plugin request failed");
    assert.equal(logged[0].context.pluginId, "diagnostic-probe");
    assert.equal(logged[0].context.path, "/diagnostic-probe/fail");
    assert.equal(logged[0].context.errorMessage, "simulated database failure");
    assert.equal(JSON.stringify(logged).includes("must-not-be-logged"), false);
  } finally {
    await runtime.stopAll();
    await app.close();
  }
});
