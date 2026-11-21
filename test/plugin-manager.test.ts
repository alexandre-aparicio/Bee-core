import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { BeePluginManager } from "../src/core/plugin-manager.js";
import { BeeEventBus } from "../src/core/event-bus.js";
import type { BeeContext, BeePlugin, BeeLogger } from "../src/core/types.js";

const logger: BeeLogger = { info: () => {}, warn: () => {}, error: () => {} };

function context(server: ReturnType<typeof Fastify>): BeeContext {
  return {
    appName: "Bee-Core", version: "test", events: new BeeEventBus(), logger, server,
    config: Object.freeze({ mongoUri: "mongodb://secret", mongoDbName: "testdb", authAdminEmail: "admin@test", authAdminPassword: "private", fileStoragePath: "/files", publicBaseDomain: "test.local", jwtSecret: "secret" })
  };
}

test("plugin scopes isolate routes and filter config keys", async () => {
  const server = Fastify();
  const manager = new BeePluginManager();
  let authConfig: Record<string, unknown> | undefined;
  let filesConfig: Record<string, unknown> | undefined;
  const auth: BeePlugin = {
    manifest: { name: "auth", version: "1" },
    initialize(ctx) {
      authConfig = ctx.config as Record<string, unknown>;
      ctx.server.get("/auth-scope-test", async () => ({ plugin: ctx.pluginName }));
    }
  };
  const files: BeePlugin = {
    manifest: { name: "files", version: "1", dependencies: ["auth"] },
    initialize(ctx) {
      filesConfig = ctx.config as Record<string, unknown>;
      ctx.server.get("/files-scope-test", async () => ({ plugin: ctx.pluginName }));
    }
  };
  manager.register(auth);
  manager.register(files);
  await manager.mountAll(context(server));

  assert.deepEqual(Object.keys(authConfig ?? {}).sort(), ["authAdminEmail", "authAdminPassword", "jwtSecret", "mongoDbName", "mongoUri", "publicBaseDomain"]);
  assert.deepEqual(Object.keys(filesConfig ?? {}).sort(), ["fileStoragePath", "mongoDbName", "mongoUri"]);
  assert.equal("authAdminPassword" in (filesConfig ?? {}), false);
  assert.equal(authConfig?.jwtSecret, "secret", "auth must receive the same JWT secret used by the application verifier");
  assert.equal("jwtSecret" in (filesConfig ?? {}), false, "JWT secret must remain isolated from non-auth plugins");

  const authResponse = await server.inject({ method: "GET", url: "/auth-scope-test" });
  const filesResponse = await server.inject({ method: "GET", url: "/files-scope-test" });
  assert.equal(authResponse.statusCode, 200);
  assert.deepEqual(authResponse.json(), { plugin: "auth" });
  assert.equal(filesResponse.statusCode, 200);
  assert.deepEqual(filesResponse.json(), { plugin: "files" });
  assert.deepEqual(manager.list().map(plugin => plugin.status), ["started", "started"]);
  await server.close();
});

test("failed plugin initialization does not stop independent plugin", async () => {
  const server = Fastify();
  const manager = new BeePluginManager();
  let healthyStarted = false;
  manager.register({ manifest: { name: "broken", version: "1" }, initialize() { throw new Error("injected error"); } });
  manager.register({ manifest: { name: "healthy", version: "1" }, start() { healthyStarted = true; } });
  await manager.mountAll(context(server));
  const states = manager.list();
  assert.equal(states.find(plugin => plugin.name === "broken")?.status, "failed");
  assert.equal(states.find(plugin => plugin.name === "healthy")?.status, "started");
  assert.equal(healthyStarted, true);
  await server.close();
});

test("dependency order is resolved before mounting regardless of registration order", async () => {
  const server = Fastify();
  const manager = new BeePluginManager();
  const order: string[] = [];
  manager.register({ manifest: { name: "dependent", version: "1", dependencies: ["base"] }, initialize() { order.push("dependent"); } });
  manager.register({ manifest: { name: "base", version: "1" }, initialize() { order.push("base"); } });
  await manager.mountAll(context(server));
  assert.deepEqual(order, ["base", "dependent"]);
  assert.equal(manager.list().every(plugin => plugin.status === "started"), true);
  await server.close();
});
