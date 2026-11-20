import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
import { authPlugin } from "../src/plugins/auth/auth.plugin.js";
import { organizationsPlugin } from "../src/plugins/organizations/organizations.plugin.js";
import { marketplacePlugin } from "../src/plugins/marketplace/marketplace.plugin.js";
import { notesPlugin } from "../src/plugins/notes/notes.plugin.js";
import { BeeEventBus } from "../src/core/event-bus.js";
import type { BeeContext, BeeLogger } from "../src/core/types.js";

const uri = process.env.MONGODB_TEST_URI;

test("marketplace filters plugins by company plan and individual purchases", { skip: !uri }, async () => {
  const dbName = "bee_marketplace_test_" + Date.now();
  const client = new MongoClient(uri!);
  await client.connect();
  const db = client.db(dbName);
  const passwordHash = await bcrypt.hash("Test-password-12345", 10);
  const now = new Date();
  await db.collection("tenants").insertMany([
    { id: "market-alpha", name: "Market Alpha", status: "active", createdAt: now },
    { id: "market-beta", name: "Market Beta", status: "active", createdAt: now },
    { id: "market-gamma", name: "Market Gamma", status: "active", createdAt: now }
  ]);
  await db.collection("users").insertMany([
    { id: "market-owner-alpha", email: "owner@market-alpha.test", passwordHash, roles: ["admin"], enabled: true, allowedClients: ["dashboard"], tenantId: "market-alpha", createdAt: now, updatedAt: now },
    { id: "market-owner-beta", email: "owner@market-beta.test", passwordHash, roles: ["user"], enabled: true, allowedClients: ["dashboard"], tenantId: "market-beta", createdAt: now, updatedAt: now },
    { id: "market-member-gamma", email: "member@market-gamma.test", passwordHash, roles: ["user"], enabled: true, allowedClients: ["dashboard"], tenantId: "market-gamma", createdAt: now, updatedAt: now }
  ]);
  await db.collection("memberships").insertMany([
    { id: "market-alpha-owner", userId: "market-owner-alpha", tenantId: "market-alpha", role: "owner", status: "active", createdAt: now, updatedAt: now },
    { id: "market-beta-owner", userId: "market-owner-beta", tenantId: "market-beta", role: "owner", status: "active", createdAt: now, updatedAt: now },
    { id: "market-gamma-member", userId: "market-member-gamma", tenantId: "market-gamma", role: "member", status: "active", createdAt: now, updatedAt: now }
  ]);
  await db.collection("tenant_subscriptions").insertMany([
    { id: "subscription-alpha", tenantId: "market-alpha", planId: "pro", status: "active", startedAt: now, currentPeriodEnd: new Date(now.getTime() + 30 * 86400000), updatedAt: now },
    { id: "subscription-beta", tenantId: "market-beta", planId: "starter", status: "active", startedAt: now, currentPeriodEnd: new Date(now.getTime() + 30 * 86400000), updatedAt: now },
    { id: "subscription-gamma", tenantId: "market-gamma", planId: "starter", status: "active", startedAt: now, currentPeriodEnd: new Date(now.getTime() + 30 * 86400000), updatedAt: now }
  ]);

  const app = Fastify();
  const logger: BeeLogger = { info(){}, warn(){}, error(){} };
  const ctx: BeeContext = {
    appName: "Bee marketplace test",
    version: "test",
    events: new BeeEventBus(),
    logger,
    server: app,
    config: { jwtSecret: "01234567890123456789012345678901", mongoUri: uri!, mongoDbName: dbName, authAdminEmail: "", authAdminPassword: "" }
  };

  try {
    await authPlugin.initialize?.(ctx);
    await organizationsPlugin.initialize?.(ctx);
    await marketplacePlugin.initialize?.(ctx);
    await notesPlugin.initialize?.(ctx);
    await app.ready();

    const login = async (email: string) => {
      const response = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password: "Test-password-12345", client: "dashboard" } });
      assert.equal(response.statusCode, 200);
      return response.json().accessToken as string;
    };
    const alphaToken = await login("owner@market-alpha.test");
    const betaToken = await login("owner@market-beta.test");
    const gammaToken = await login("member@market-gamma.test");

    const alphaCatalog = await app.inject({ method: "GET", url: "/marketplace/plugins", headers: { authorization: "Bearer " + alphaToken } });
    assert.equal(alphaCatalog.statusCode, 200);
    const alphaPlugins = alphaCatalog.json().plugins as Array<{ id: string; entitled: boolean }>;
    assert.deepEqual(alphaPlugins.map(plugin => plugin.id), ["files", "notes"]);
    assert.ok(alphaPlugins.every(plugin => plugin.entitled));

    const betaCatalog = await app.inject({ method: "GET", url: "/marketplace/plugins", headers: { authorization: "Bearer " + betaToken } });
    assert.equal(betaCatalog.statusCode, 200);
    const betaPlugins = betaCatalog.json().plugins as Array<{ id: string; entitled: boolean; installed: boolean }>;
    assert.deepEqual(betaPlugins.map(plugin => plugin.id), ["files", "notes"]);
    assert.equal(betaPlugins.find(plugin => plugin.id === "notes")?.entitled, false);
    assert.equal(betaPlugins.find(plugin => plugin.id === "files")?.installed, true);

    const gammaCatalog = await app.inject({ method: "GET", url: "/marketplace/plugins", headers: { authorization: "Bearer " + gammaToken } });
    assert.equal(gammaCatalog.statusCode, 200);
    assert.equal(gammaCatalog.json().plugins.find((plugin: { id: string }) => plugin.id === "notes").entitled, false);

    const unentitledInstall = await app.inject({ method: "POST", url: "/marketplace/plugins/notes/install", headers: { authorization: "Bearer " + betaToken } });
    assert.equal(unentitledInstall.statusCode, 402);

    await db.collection("plugin_purchases").insertOne({
      id: "purchase-beta-notes",
      tenantId: "market-beta",
      pluginId: "notes",
      providerReference: "test-provider-purchase-001",
      status: "active",
      purchasedAt: now,
      expiresAt: null
    });
    const betaAfterPurchase = await app.inject({ method: "GET", url: "/marketplace/plugins", headers: { authorization: "Bearer " + betaToken } });
    assert.equal(betaAfterPurchase.json().plugins.find((plugin: { id: string }) => plugin.id === "notes").entitled, true);

    const alphaBeforeInstall = await app.inject({ method: "GET", url: "/notes", headers: { authorization: "Bearer " + alphaToken } });
    assert.equal(alphaBeforeInstall.statusCode, 403);
    const alphaInstall = await app.inject({ method: "POST", url: "/marketplace/plugins/notes/install", headers: { authorization: "Bearer " + alphaToken } });
    assert.equal(alphaInstall.statusCode, 200);
    const alphaCreateNote = await app.inject({ method: "POST", url: "/notes", headers: { authorization: "Bearer " + alphaToken }, payload: { title: "Alpha confidential", content: "Only Alpha can read this." } });
    assert.equal(alphaCreateNote.statusCode, 201);
    const alphaNoteId = alphaCreateNote.json().note.id as string;
    const betaInstall = await app.inject({ method: "POST", url: "/marketplace/plugins/notes/install", headers: { authorization: "Bearer " + betaToken } });
    assert.equal(betaInstall.statusCode, 200);
    assert.equal(betaInstall.json().status, "installed");
    const betaCreateNote = await app.inject({ method: "POST", url: "/notes", headers: { authorization: "Bearer " + betaToken }, payload: { title: "Beta private", content: "Only Beta can read this." } });
    assert.equal(betaCreateNote.statusCode, 201);
    const betaCannotReadAlphaNote = await app.inject({ method: "GET", url: "/notes/" + alphaNoteId, headers: { authorization: "Bearer " + betaToken } });
    assert.equal(betaCannotReadAlphaNote.statusCode, 404);
    const gammaCannotUseNotes = await app.inject({ method: "GET", url: "/notes", headers: { authorization: "Bearer " + gammaToken } });
    assert.equal(gammaCannotUseNotes.statusCode, 403);

    assert.equal(await db.collection("tenant_notes").indexExists("tenant_notes_company_id_unique"), true);

    const alphaVersions = await app.inject({ method: "GET", url: "/marketplace/plugins/notes/versions", headers: { authorization: "Bearer " + alphaToken } });
    assert.equal(alphaVersions.statusCode, 200);
    assert.equal(alphaVersions.json().versions[0].version, "0.1.0");

    const unknownPlugin = await app.inject({ method: "GET", url: "/marketplace/plugins/secret.hr", headers: { authorization: "Bearer " + alphaToken } });
    assert.equal(unknownPlugin.statusCode, 404);
    const gammaCannotInstall = await app.inject({ method: "POST", url: "/marketplace/plugins/notes/install", headers: { authorization: "Bearer " + gammaToken } });
    assert.equal(gammaCannotInstall.statusCode, 403);

    const uninstall = await app.inject({ method: "DELETE", url: "/marketplace/plugins/notes/install", headers: { authorization: "Bearer " + betaToken } });
    assert.equal(uninstall.statusCode, 200);
    assert.equal(uninstall.json().dataPreserved, true);
    const betaAfterUninstall = await app.inject({ method: "GET", url: "/notes", headers: { authorization: "Bearer " + betaToken } });
    assert.equal(betaAfterUninstall.statusCode, 403);
  } finally {
    await app.close();
    await notesPlugin.stop?.(ctx);
    await marketplacePlugin.stop?.(ctx);
    await organizationsPlugin.stop?.(ctx);
    await db.dropDatabase();
    await client.close();
  }
});
