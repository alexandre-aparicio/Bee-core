import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
import { authPlugin } from "../src/plugins/auth/auth.plugin.js";
import { organizationsPlugin } from "../src/plugins/organizations/organizations.plugin.js";
import { marketplacePlugin } from "../src/plugins/marketplace/marketplace.plugin.js";
import { BeeEventBus } from "../src/core/event-bus.js";
import type { BeeContext, BeeLogger } from "../src/core/types.js";

const uri = process.env.MONGODB_TEST_URI;

test("marketplace only exposes plugins entitled to the active company", { skip: !uri }, async () => {
  const dbName = "bee_marketplace_test_" + Date.now();
  const client = new MongoClient(uri!);
  await client.connect();
  const db = client.db(dbName);
  const passwordHash = await bcrypt.hash("Test-password-12345", 10);
  const now = new Date();
  await db.collection("tenants").insertMany([
    { id: "market-alpha", name: "Market Alpha", status: "active", createdAt: now },
    { id: "market-beta", name: "Market Beta", status: "active", createdAt: now }
  ]);
  await db.collection("users").insertMany([
    { id: "market-owner", email: "owner@market-alpha.test", passwordHash, roles: ["admin"], enabled: true, allowedClients: ["dashboard"], tenantId: "market-alpha", createdAt: now, updatedAt: now },
    { id: "market-member", email: "member@market-beta.test", passwordHash, roles: ["user"], enabled: true, allowedClients: ["dashboard"], tenantId: "market-beta", createdAt: now, updatedAt: now }
  ]);
  await db.collection("plugin_catalog").insertMany([
    { id: "crm.contacts", name: "CRM Contacts", description: "Manage contacts", category: "crm", publisher: "Bee", visibility: "public", status: "published", latestVersion: "1.2.0", createdAt: now, updatedAt: now },
    { id: "inventory.stock", name: "Inventory", description: "Manage stock", category: "operations", publisher: "Bee", visibility: "private", status: "published", latestVersion: "2.0.0", createdAt: now, updatedAt: now },
    { id: "draft.analytics", name: "Analytics Preview", description: "Not published", category: "analytics", publisher: "Bee", visibility: "public", status: "draft", latestVersion: "0.1.0", createdAt: now, updatedAt: now }
  ]);
  await db.collection("plugin_versions").insertMany([
    { pluginId: "crm.contacts", version: "1.2.0", status: "published", compatibility: { minRuntimeVersion: "0.3.0" }, dependencies: [], packageStorageKey: "central/packages/crm-contacts-1.2.0.tgz", publishedAt: now },
    { pluginId: "crm.contacts", version: "1.1.0", status: "published", compatibility: { minRuntimeVersion: "0.3.0" }, dependencies: [], packageStorageKey: "central/packages/crm-contacts-1.1.0.tgz", publishedAt: new Date(now.getTime() - 1000) },
    { pluginId: "draft.analytics", version: "0.1.0", status: "draft", publishedAt: now }
  ]);
  await db.collection("tenant_entitlements").insertMany([
    { tenantId: "market-alpha", pluginId: "crm.contacts", source: "plan", status: "active", validFrom: new Date(now.getTime() - 1000), validUntil: null },
    { tenantId: "market-alpha", pluginId: "old.reporting", source: "purchase", status: "active", validFrom: new Date(now.getTime() - 10_000), validUntil: new Date(now.getTime() - 1000) },
    { tenantId: "market-beta", pluginId: "inventory.stock", source: "purchase", status: "active", validFrom: new Date(now.getTime() - 1000), validUntil: null }
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
    await app.ready();

    const login = async (email: string) => {
      const response = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password: "Test-password-12345", client: "dashboard" } });
      assert.equal(response.statusCode, 200);
      return response.json().accessToken as string;
    };
    const alphaToken = await login("owner@market-alpha.test");
    const betaToken = await login("member@market-beta.test");

    const alphaCatalog = await app.inject({ method: "GET", url: "/marketplace/plugins", headers: { authorization: "Bearer " + alphaToken } });
    assert.equal(alphaCatalog.statusCode, 200);
    assert.deepEqual(alphaCatalog.json().plugins.map((plugin: { id: string }) => plugin.id), ["crm.contacts"]);

    const betaCatalog = await app.inject({ method: "GET", url: "/marketplace/plugins", headers: { authorization: "Bearer " + betaToken } });
    assert.equal(betaCatalog.statusCode, 200);
    assert.deepEqual(betaCatalog.json().plugins.map((plugin: { id: string }) => plugin.id), ["inventory.stock"]);

    const betaCannotReadCrm = await app.inject({ method: "GET", url: "/marketplace/plugins/crm.contacts", headers: { authorization: "Bearer " + betaToken } });
    assert.equal(betaCannotReadCrm.statusCode, 404);
    const alphaCannotReadInventory = await app.inject({ method: "GET", url: "/marketplace/plugins/inventory.stock", headers: { authorization: "Bearer " + alphaToken } });
    assert.equal(alphaCannotReadInventory.statusCode, 404);
    const unpublished = await app.inject({ method: "GET", url: "/marketplace/plugins/draft.analytics", headers: { authorization: "Bearer " + alphaToken } });
    assert.equal(unpublished.statusCode, 404);

    const alphaVersions = await app.inject({ method: "GET", url: "/marketplace/plugins/crm.contacts/versions", headers: { authorization: "Bearer " + alphaToken } });
    assert.equal(alphaVersions.statusCode, 200);
    assert.deepEqual(alphaVersions.json().versions.map((version: { version: string }) => version.version), ["1.2.0", "1.1.0"]);
    assert.equal(JSON.stringify(alphaVersions.json()).includes("packageStorageKey"), false);

    const alphaEntitlements = await app.inject({ method: "GET", url: "/marketplace/entitlements", headers: { authorization: "Bearer " + alphaToken } });
    assert.equal(alphaEntitlements.statusCode, 200);
    assert.deepEqual(alphaEntitlements.json().entitlements.map((item: { pluginId: string }) => item.pluginId), ["crm.contacts"]);
  } finally {
    await app.close();
    await marketplacePlugin.stop?.(ctx);
    await organizationsPlugin.stop?.(ctx);
    await db.dropDatabase();
    await client.close();
  }
});
