import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { MongoClient } from "mongodb";
import { BeePluginManager } from "../src/core/plugin-manager.js";
import { BeeEventBus } from "../src/core/event-bus.js";
import type { BeeContext, BeePlugin, BeeLogger } from "../src/core/types.js";

const logger: BeeLogger = { info: () => {}, warn: () => {}, error: () => {} };

function context(server: ReturnType<typeof Fastify>): BeeContext {
  return {
    appName: "Bee-Core", version: "test", events: new BeeEventBus(), logger, server,
    mongoClient: new MongoClient("mongodb://localhost:27017"),
    config: Object.freeze({ mongoDbName: "testdb", authAdminEmail: "admin@test", authAdminPassword: "private", fileStoragePath: "/files", publicBaseDomain: "test.local", jwtSecret: "test-jwt-secret-with-at-least-32-characters" })
  };
}

test("plugin scopes isolate routes and filter config keys", async () => {
  const server = Fastify();
  const manager = new BeePluginManager();
  let authConfig: Record<string, unknown> | undefined;
  let filesConfig: Record<string, unknown> | undefined;
  const auth: BeePlugin = {
    manifest: { name: "auth", version: "1", requiredServices: ["mongoDbName", "sessionIdSecret"], optionalServices: ["authAdminEmail", "authAdminPassword", "publicBaseDomain"] },
    initialize(ctx) {
      authConfig = ctx.config as Record<string, unknown>;
      ctx.server.get("/auth-scope-test", async () => ({ plugin: ctx.pluginName }));
    }
  };
  const files: BeePlugin = {
    manifest: { name: "files", version: "1", dependencies: ["auth"], requiredServices: ["mongoDbName", "sessionIdSecret"], optionalServices: ["fileStoragePath"] },
    initialize(ctx) {
      filesConfig = ctx.config as Record<string, unknown>;
      ctx.server.get("/files-scope-test", async () => ({ plugin: ctx.pluginName }));
    }
  };
  manager.register(auth);
  manager.register(files);
  await manager.mountAll(context(server));

  assert.deepEqual(Object.keys(authConfig ?? {}).sort(), ["authAdminEmail", "authAdminPassword", "mongoDbName", "publicBaseDomain", "sessionIdSecret"]);
  assert.deepEqual(Object.keys(filesConfig ?? {}).sort(), ["fileStoragePath", "mongoDbName", "sessionIdSecret"]);
  assert.equal("authAdminPassword" in (filesConfig ?? {}), false);
  assert.ok(typeof authConfig?.sessionIdSecret === "string" && String(authConfig.sessionIdSecret).length === 64, "auth must receive a dedicated derived session-reference secret");
  assert.equal(authConfig?.sessionIdSecret, filesConfig?.sessionIdSecret, "plugins must share the same derived key to resolve session-bound references");
  assert.equal("jwtSecret" in (authConfig ?? {}), false, "plugins must not receive the JWT signing secret");
  assert.equal("jwtSecret" in (filesConfig ?? {}), false, "plugins must not receive the JWT signing secret");

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

test("topological ordering handles transitive dependencies and keeps ready siblings stable", async () => {
  const server = Fastify(), manager = new BeePluginManager(), order: string[] = [];
  manager.register({ manifest: { name: "leaf", version: "1", dependencies: ["middle"] }, start() { order.push("leaf"); } });
  manager.register({ manifest: { name: "middle", version: "1", dependencies: ["base"] }, start() { order.push("middle"); } });
  manager.register({ manifest: { name: "sibling", version: "1" }, start() { order.push("sibling"); } });
  manager.register({ manifest: { name: "base", version: "1" }, start() { order.push("base"); } });
  await manager.mountAll(context(server));
  assert.deepEqual(order, ["sibling", "base", "middle", "leaf"]);
  await manager.stopAll(context(server));
  await server.close();
});

test("stopAll continues through multiple plugins after an earlier stop hook throws", async () => {
  const server = Fastify(), manager = new BeePluginManager(), stopped: string[] = [];
  manager.register({ manifest: { name: "first", version: "1" }, stop() { stopped.push("first"); } });
  manager.register({ manifest: { name: "middle", version: "1" }, stop() { stopped.push("middle"); } });
  manager.register({ manifest: { name: "last", version: "1" }, stop() { stopped.push("last"); throw new Error("shutdown failure"); } });
  await manager.mountAll(context(server));
  await manager.stopAll(context(server));
  assert.deepEqual(stopped, ["last", "middle", "first"]);
  assert.equal(manager.list().find(plugin => plugin.name === "last")?.status, "failed");
  assert.equal(manager.list().find(plugin => plugin.name === "middle")?.status, "stopped");
  assert.equal(manager.list().find(plugin => plugin.name === "first")?.status, "stopped");
  await server.close();
});

test("all plugin scopes receive the exact same core MongoClient instance", async () => {
  const server = Fastify(), manager = new BeePluginManager();
  const rootContext = context(server);
  const received: unknown[] = [];
  manager.register({ manifest: { name: "first", version: "1" }, initialize(ctx) { received.push(ctx.mongoClient); } });
  manager.register({ manifest: { name: "second", version: "1" }, initialize(ctx) { received.push(ctx.mongoClient); } });
  await manager.mountAll(rootContext);
  assert.equal(received.length, 2);
  assert.ok(received.every(client => client === rootContext.mongoClient));
  await server.close();
});


test("plugin manager rejects undeclared host services and duplicate service declarations", () => {
  const manager = new BeePluginManager();
  assert.throws(() => manager.register({ manifest: { name: "unsafe", version: "1", requiredServices: ["jwtSecret"] } }), /unsupported service/);
  assert.throws(() => manager.register({ manifest: { name: "duplicate", version: "1", requiredServices: ["mongoDbName", "mongoDbName"] } }), /duplicate required services/);
});


test("plugin manager reports missing required services before initialization", async () => {
  const server = Fastify();
  const manager = new BeePluginManager();
  manager.register({ manifest: { name: "requires-database", version: "1", requiredServices: ["defaultTenantId"] } });
  await manager.mountAll(context(server));
  const plugin = manager.list().find(item => item.name === "requires-database");
  assert.equal(plugin?.status, "failed");
  assert.match(plugin?.error ?? "", /requires unavailable service.*defaultTenantId/i);
  await server.close();
});
