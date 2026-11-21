import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { BeePluginManager } from "../src/core/plugin-manager.js";
import { BeeEventBus } from "../src/core/event-bus.js";
import type { BeeContext, BeeLogger } from "../src/core/types.js";

const logs: Array<{ level: string; message: string; context?: unknown }> = [];
const logger: BeeLogger = {
  info: (message, context) => logs.push({ level: "info", message, context }),
  warn: (message, context) => logs.push({ level: "warn", message, context }),
  error: (message, context) => logs.push({ level: "error", message, context })
};
function makeContext(server: ReturnType<typeof Fastify>): BeeContext {
  return {
    appName: "Bee-Core", version: "test", events: new BeeEventBus(), logger, server,
    config: Object.freeze({ mongoUri: "mongodb://secret", mongoDbName: "test", authAdminPassword: "secret", publicBaseDomain: "test.local", fileStoragePath: "/tmp/files", jwtSecret: "hidden" })
  };
}

test("rejects duplicate plugin names case-insensitively", () => {
  const manager = new BeePluginManager();
  manager.register({ manifest: { name: "Auth", version: "1" } });
  assert.throws(() => manager.register({ manifest: { name: "auth", version: "2" } }), /already registered/i);
});

test("fails plugin with missing dependency and reports the reason", async () => {
  const server = Fastify(), manager = new BeePluginManager();
  manager.register({ manifest: { name: "dependent", version: "1", dependencies: ["absent"] } });
  await manager.mountAll(makeContext(server));
  const plugin = manager.list()[0];
  assert.equal(plugin.status, "failed");
  assert.match(plugin.error ?? "", /Missing plugin dependency/i);
  await server.close();
});

test("failure of a dependency prevents dependent plugin startup", async () => {
  const server = Fastify(), manager = new BeePluginManager();
  let dependentStarted = false;
  manager.register({ manifest: { name: "base", version: "1" }, initialize() { throw new Error("base failed"); } });
  manager.register({ manifest: { name: "dependent", version: "1", dependencies: ["base"] }, start() { dependentStarted = true; } });
  await manager.mountAll(makeContext(server));
  assert.equal(manager.list().find(p => p.name === "base")?.status, "failed");
  assert.equal(manager.list().find(p => p.name === "dependent")?.status, "failed");
  assert.equal(dependentStarted, false);
  await server.close();
});

test("resolves dependency names case-insensitively", async () => {
  const server = Fastify(), manager = new BeePluginManager(), order: string[] = [];
  manager.register({ manifest: { name: "Auth", version: "1" }, start() { order.push("auth"); } });
  manager.register({ manifest: { name: "files", version: "1", dependencies: ["AUTH"] }, start() { order.push("files"); } });
  await manager.mountAll(makeContext(server));
  assert.deepEqual(order, ["auth", "files"]);
  assert.ok(manager.list().every(p => p.status === "started"));
  await server.close();
});

test("plugin Fastify decorators are isolated from sibling plugin scopes", async () => {
  const server = Fastify(), manager = new BeePluginManager();
  let visibleFromSibling = false;
  manager.register({ manifest: { name: "one", version: "1" }, initialize(ctx) { ctx.server.decorate("privateOne", "one"); } });
  manager.register({ manifest: { name: "two", version: "1" } , initialize(ctx) { visibleFromSibling = ctx.server.hasDecorator("privateOne"); } });
  await manager.mountAll(makeContext(server));
  assert.equal(visibleFromSibling, false);
  await server.close();
});

test("plugin config is frozen and secrets outside allowlist are omitted", async () => {
  const server = Fastify(), manager = new BeePluginManager();
  let config: Readonly<Record<string, unknown>> | undefined;
  manager.register({ manifest: { name: "files", version: "1" }, initialize(ctx) { config = ctx.config; } });
  await manager.mountAll(makeContext(server));
  assert.equal(Object.isFrozen(config), true);
  assert.deepEqual(Object.keys(config ?? {}).sort(), ["fileStoragePath", "mongoDbName", "mongoUri"]);
  assert.equal("jwtSecret" in (config ?? {}), false);
  assert.equal("authAdminPassword" in (config ?? {}), false);
  await server.close();
});

test("plugin scoped logger prefixes messages with plugin name", async () => {
  logs.length = 0;
  const server = Fastify(), manager = new BeePluginManager();
  manager.register({ manifest: { name: "hello", version: "1" }, initialize(ctx) { ctx.logger.info("test log"); } });
  await manager.mountAll(makeContext(server));
  assert.ok(logs.some(entry => entry.level === "info" && entry.message === "[hello] test log"));
  await server.close();
});

test("plugins stop in reverse registration order", async () => {
  const server = Fastify(), manager = new BeePluginManager(), order: string[] = [];
  manager.register({ manifest: { name: "first", version: "1" }, stop() { order.push("first"); } });
  manager.register({ manifest: { name: "second", version: "1" }, stop() { order.push("second"); } });
  await manager.mountAll(makeContext(server));
  await manager.stopAll(makeContext(server));
  assert.deepEqual(order, ["second", "first"]);
  assert.ok(manager.list().every(p => p.status === "stopped"));
  await server.close();
});

test("a plugin shutdown failure does not prevent remaining plugins from stopping", async () => {
  const server = Fastify(), manager = new BeePluginManager(), stopped: string[] = [];
  manager.register({ manifest: { name: "first", version: "1" }, stop() { stopped.push("first"); } });
  manager.register({ manifest: { name: "second", version: "1" }, stop() { stopped.push("second"); throw new Error("stop failure"); } });
  await manager.mountAll(makeContext(server));
  await manager.stopAll(makeContext(server));
  assert.deepEqual(stopped, ["second", "first"]);
  assert.equal(manager.list().find(p => p.name === "second")?.status, "failed");
  assert.equal(manager.list().find(p => p.name === "first")?.status, "stopped");
  await server.close();
});

test("plugin start failure marks plugin failed and cleans it up without blocking another plugin", async () => {
  const server = Fastify(), manager = new BeePluginManager();
  let cleanupCalled = false, healthyStarted = false;
  manager.register({ manifest: { name: "broken-start", version: "1" }, start() { throw new Error("start error"); }, stop() { cleanupCalled = true; } });
  manager.register({ manifest: { name: "healthy", version: "1" }, start() { healthyStarted = true; } });
  await manager.mountAll(makeContext(server));
  assert.equal(manager.list().find(p => p.name === "broken-start")?.status, "failed");
  assert.equal(cleanupCalled, true);
  assert.equal(healthyStarted, true);
  await server.close();
});


test("scoped logger prefixes warn and error and scoped config cannot be mutated", async () => {
  logs.length = 0;
  const server = Fastify(), manager = new BeePluginManager();
  let mutationRejected = false;
  manager.register({ manifest: { name: "files", version: "1" }, initialize(ctx) {
    ctx.logger.warn("warning");
    ctx.logger.error("error");
    try { (ctx.config as Record<string, unknown>).mongoUri = "changed"; } catch { mutationRejected = true; }
  } });
  await manager.mountAll(makeContext(server));
  assert.ok(logs.some(entry => entry.level === "warn" && entry.message === "[files] warning"));
  assert.ok(logs.some(entry => entry.level === "error" && entry.message === "[files] error"));
  assert.equal(mutationRejected, true);
  await server.close();
});
