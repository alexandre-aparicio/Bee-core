import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
import { authPlugin } from "../src/plugins/auth/auth.plugin.js";
import { BeeEventBus } from "../src/core/event-bus.js";
import type { BeeContext, BeeLogger } from "../src/core/types.js";

const uri = process.env.MONGODB_TEST_URI;
test("auth integration: login, token introspection, refresh rotation and logout", { skip: !uri }, async () => {
  const dbName = "bee_core_test_" + Date.now();
  const client = new MongoClient(uri!);
  await client.connect();
  const db = client.db(dbName);
  const passwordHash = await bcrypt.hash("Test-password-12345", 10);
  await db.collection("users").insertOne({ id: "test-user", email: "test@example.com", passwordHash, roles: ["user"], enabled: true, allowedClients: ["dashboard"], createdAt: new Date(), updatedAt: new Date() });
  const app = Fastify();
  const logger: BeeLogger = { info(){}, warn(){}, error(){} };
  const ctx: BeeContext = { appName: "Bee test", version: "test", events: new BeeEventBus(), logger, server: app, config: { jwtSecret: "01234567890123456789012345678901", mongoUri: uri!, mongoDbName: dbName, authAdminEmail: "", authAdminPassword: "" } };
  try {
    await authPlugin.initialize?.(ctx);
    await app.ready();
    const bad = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "test@example.com", password: "wrong", client: "dashboard" } });
    assert.equal(bad.statusCode, 401);
    const denied = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "test@example.com", password: "Test-password-12345", client: "public" } });
    assert.equal(denied.statusCode, 403);
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "test@example.com", password: "Test-password-12345", client: "dashboard" } });
    assert.equal(login.statusCode, 200);
    const tokens = login.json();
    assert.ok(tokens.accessToken); assert.ok(tokens.refreshToken);
    const defaultTemplates = await app.inject({ method: "GET", url: "/templates/preferences", headers: { authorization: "Bearer " + tokens.accessToken } });
    assert.equal(defaultTemplates.statusCode, 200);
    assert.deepEqual(defaultTemplates.json().selection, { public: "aurora", dashboard: "midnight" });
    const saveTemplates = await app.inject({ method: "PUT", url: "/templates/preferences", headers: { authorization: "Bearer " + tokens.accessToken }, payload: { public: "editorial", dashboard: "paper" } });
    assert.equal(saveTemplates.statusCode, 200);
    assert.deepEqual(saveTemplates.json().selection, { public: "editorial", dashboard: "paper" });
    const readTemplates = await app.inject({ method: "GET", url: "/templates/preferences", headers: { authorization: "Bearer " + tokens.accessToken } });
    assert.deepEqual(readTemplates.json().selection, { public: "editorial", dashboard: "paper" });
    const invalidTemplate = await app.inject({ method: "PUT", url: "/templates/preferences", headers: { authorization: "Bearer " + tokens.accessToken }, payload: { public: "remote-script" } });
    assert.equal(invalidTemplate.statusCode, 400);
    const unauthenticatedTemplates = await app.inject({ method: "GET", url: "/templates/preferences" });
    assert.equal(unauthenticatedTemplates.statusCode, 401);

    const me = await app.inject({ method: "GET", url: "/auth/me", headers: { authorization: "Bearer " + tokens.accessToken } });
    assert.equal(me.statusCode, 200); assert.equal(me.json().authenticated, true);
    const refresh = await app.inject({ method: "POST", url: "/auth/refresh", payload: { refreshToken: tokens.refreshToken } });
    assert.equal(refresh.statusCode, 200);
    const refreshed = refresh.json(); assert.notEqual(refreshed.refreshToken, tokens.refreshToken);
    const replay = await app.inject({ method: "POST", url: "/auth/refresh", payload: { refreshToken: tokens.refreshToken } });
    assert.equal(replay.statusCode, 401);
    const logout = await app.inject({ method: "POST", url: "/auth/logout", headers: { authorization: "Bearer " + refreshed.accessToken }, payload: { refreshToken: refreshed.refreshToken } });
    assert.equal(logout.statusCode, 200);
    const afterLogout = await app.inject({ method: "POST", url: "/auth/refresh", payload: { refreshToken: refreshed.refreshToken } });
    assert.equal(afterLogout.statusCode, 401);
  } finally {
    await app.close();
    await client.db(dbName).dropDatabase();
    await client.close();
  }
});
