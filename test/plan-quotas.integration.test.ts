import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
import { authPlugin } from "../src/plugins/auth/auth.plugin.js";
import { organizationsPlugin } from "../src/plugins/organizations/organizations.plugin.js";
import { seedPluginCommerce } from "../src/core/plugin-entitlements.js";
import { BeeEventBus } from "../src/core/event-bus.js";
import type { BeeContext, BeeLogger } from "../src/core/types.js";

const uri = process.env.MONGODB_TEST_URI;

test("company plan user quota reserves capacity for active members and pending invitations", { skip: !uri }, async () => {
  const dbName = "bee_user_quota_test_" + Date.now();
  const client = new MongoClient(uri!);
  await client.connect();
  const db = client.db(dbName);
  const now = new Date();
  const passwordHash = await bcrypt.hash("Test-password-12345", 10);
  await db.collection("tenants").insertOne({ id: "quota-company", name: "Quota Company", status: "active", createdAt: now });
  await db.collection("users").insertMany([
    { id: "quota-owner", email: "owner@quota.test", passwordHash, roles: ["admin"], enabled: true, allowedClients: ["dashboard"], tenantId: "quota-company", createdAt: now, updatedAt: now },
    { id: "quota-member", email: "member@quota.test", passwordHash, roles: ["user"], enabled: true, allowedClients: ["dashboard"], createdAt: now, updatedAt: now }
  ]);
  await seedPluginCommerce(db);
  await db.collection("plugin_plans").updateOne({ id: "starter" }, { $set: { maxUsers: 2 } });

  const app = Fastify();
  const logger: BeeLogger = { info(){}, warn(){}, error(){} };
  const ctx: BeeContext = {
    appName: "Bee user quota test",
    version: "test",
    events: new BeeEventBus(),
    logger,
    server: app,
    mongoClient: client,
    config: { jwtSecret: "01234567890123456789012345678901", mongoUri: uri!, mongoDbName: dbName, authAdminEmail: "", authAdminPassword: "" }
  };

  try {
    await authPlugin.initialize?.(ctx);
    await organizationsPlugin.initialize?.(ctx);
    await app.ready();
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "owner@quota.test", password: "Test-password-12345", client: "dashboard" } });
    assert.equal(login.statusCode, 200);
    const token = login.json().accessToken as string;
    const headers = { authorization: "Bearer " + token };

    const firstInvite = await app.inject({
      method: "POST", url: "/companies/quota-company/invitations", headers,
      payload: { email: "first-invite@quota.test", role: "member" }
    });
    assert.equal(firstInvite.statusCode, 201);

    const secondInvite = await app.inject({
      method: "POST", url: "/companies/quota-company/invitations", headers,
      payload: { email: "second-invite@quota.test", role: "member" }
    });
    assert.equal(secondInvite.statusCode, 409);
    assert.match(secondInvite.json().error, /user limit/i);

    const directAdd = await app.inject({
      method: "POST", url: "/companies/quota-company/memberships", headers,
      payload: { email: "member@quota.test", role: "member" }
    });
    assert.equal(directAdd.statusCode, 409);
    assert.match(directAdd.json().error, /user limit/i);
  } finally {
    await app.close();
    await organizationsPlugin.stop?.(ctx);
    await db.dropDatabase();
    await client.close();
  }
});
