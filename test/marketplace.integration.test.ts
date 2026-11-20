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

test("company plans and purchases control plugin visibility, installation and access", { skip: !uri }, async () => {
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
    { id: "market-owner-alpha", email: "owner@market-alpha.test", passwordHash, roles: ["admin"], enabled: true, allowedClients: ["dashboard"], tenantId: "market-alpha", createdAt: now, updatedAt: now },
    { id: "market-owner-beta", email: "owner@market-beta.test", passwordHash, roles: ["admin"], enabled: true, allowedClients: ["dashboard"], tenantId: "market-beta", createdAt: now, updatedAt: now }
  ]);

  const app = Fastify();
  const logger: BeeLogger = { info(){}, warn(){}, error(){} };
  const ctx: BeeContext = {
    appName: "Bee marketplace test",
    version: "test",
    events: new BeeEventBus(),
    logger,
    server: app,
    config: {
      jwtSecret: "01234567890123456789012345678901",
      mongoUri: uri!,
      mongoDbName: dbName,
      authAdminEmail: "",
      authAdminPassword: "",
      billingWebhookSecret: "test-billing-secret"
    }
  };

  try {
    await authPlugin.initialize?.(ctx);
    await organizationsPlugin.initialize?.(ctx);
    await marketplacePlugin.initialize?.(ctx);
    await notesPlugin.initialize?.(ctx);
    await app.ready();

    const login = async (email: string) => {
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email, password: "Test-password-12345", client: "dashboard" }
      });
      assert.equal(response.statusCode, 200);
      return response.json().accessToken as string;
    };
    const alphaToken = await login("owner@market-alpha.test");
    const betaToken = await login("owner@market-beta.test");
    const webhook = (payload: unknown, secret = "test-billing-secret") => app.inject({
      method: "POST",
      url: "/billing/webhooks/entitlement",
      headers: { authorization: "Bearer " + secret },
      payload
    });

    const betaUpgrade = await webhook({
      event: "subscription.updated",
      tenantId: "market-beta",
      planId: "pro",
      status: "active",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });
    assert.equal(betaUpgrade.statusCode, 200);

    const alphaCatalog = await app.inject({ method: "GET", url: "/marketplace/plugins", headers: { authorization: "Bearer " + alphaToken } });
    assert.equal(alphaCatalog.statusCode, 200);
    assert.deepEqual(alphaCatalog.json().plugins.map((plugin: { id: string }) => plugin.id), ["files", "notes"]);
    const alphaNotesOffer = alphaCatalog.json().plugins.find((plugin: { id: string }) => plugin.id === "notes");
    assert.equal(alphaNotesOffer.entitled, false);
    assert.equal(alphaNotesOffer.purchasable, true);
    const alphaCannotInstallNotes = await app.inject({ method: "POST", url: "/marketplace/plugins/notes/install", headers: { authorization: "Bearer " + alphaToken } });
    assert.equal(alphaCannotInstallNotes.statusCode, 402);

    const betaCatalog = await app.inject({ method: "GET", url: "/marketplace/plugins", headers: { authorization: "Bearer " + betaToken } });
    assert.equal(betaCatalog.statusCode, 200);
    assert.deepEqual(betaCatalog.json().plugins.map((plugin: { id: string }) => plugin.id), ["files", "notes"]);
    const betaNotesInstall = await app.inject({ method: "POST", url: "/marketplace/plugins/notes/install", headers: { authorization: "Bearer " + betaToken } });
    assert.equal(betaNotesInstall.statusCode, 201);
    const betaNotesList = await app.inject({ method: "GET", url: "/notes", headers: { authorization: "Bearer " + betaToken } });
    assert.equal(betaNotesList.statusCode, 200);
    assert.deepEqual(betaNotesList.json().notes, []);
    const betaNoteCreate = await app.inject({
      method: "POST",
      url: "/notes",
      headers: { authorization: "Bearer " + betaToken },
      payload: { title: "Beta confidential", content: "Only Market Beta should read this" }
    });
    assert.equal(betaNoteCreate.statusCode, 201);
    const betaNoteId = betaNoteCreate.json().note.id as string;

    const alphaCannotUseNotes = await app.inject({ method: "GET", url: "/notes", headers: { authorization: "Bearer " + alphaToken } });
    assert.equal(alphaCannotUseNotes.statusCode, 403);

    const invalidWebhook = await webhook({
      event: "plugin.purchase", tenantId: "market-alpha", pluginId: "notes", providerReference: "alpha-notes-001"
    }, "wrong-secret");
    assert.equal(invalidWebhook.statusCode, 401);

    const alphaPurchase = await webhook({
      event: "plugin.purchase",
      tenantId: "market-alpha",
      pluginId: "notes",
      providerReference: "alpha-notes-001"
    });
    assert.equal(alphaPurchase.statusCode, 200);
    const alphaPurchasedCatalog = await app.inject({ method: "GET", url: "/marketplace/plugins", headers: { authorization: "Bearer " + alphaToken } });
    assert.ok(alphaPurchasedCatalog.json().plugins.some((plugin: { id: string; entitled: boolean; accessSource: string }) => plugin.id === "notes" && plugin.entitled && plugin.accessSource === "purchase"));
    const alphaNotesInstall = await app.inject({ method: "POST", url: "/marketplace/plugins/notes/install", headers: { authorization: "Bearer " + alphaToken } });
    assert.equal(alphaNotesInstall.statusCode, 201);
    const alphaNoteCreate = await app.inject({
      method: "POST",
      url: "/notes",
      headers: { authorization: "Bearer " + alphaToken },
      payload: { title: "Alpha private", content: "This belongs to Alpha" }
    });
    assert.equal(alphaNoteCreate.statusCode, 201);
    const alphaNoteId = alphaNoteCreate.json().note.id as string;

    const crossTenantRead = await app.inject({ method: "GET", url: "/notes/" + alphaNoteId, headers: { authorization: "Bearer " + betaToken } });
    assert.equal(crossTenantRead.statusCode, 404);
    const crossTenantReadOtherDirection = await app.inject({ method: "GET", url: "/notes/" + betaNoteId, headers: { authorization: "Bearer " + alphaToken } });
    assert.equal(crossTenantReadOtherDirection.statusCode, 404);

    const revokePurchase = await webhook({
      event: "plugin.revoke",
      tenantId: "market-alpha",
      pluginId: "notes",
      providerReference: "alpha-notes-001"
    });
    assert.equal(revokePurchase.statusCode, 200);
    const alphaAfterRevoke = await app.inject({ method: "GET", url: "/notes", headers: { authorization: "Bearer " + alphaToken } });
    assert.equal(alphaAfterRevoke.statusCode, 403);
    assert.equal(await db.collection("tenant_notes").countDocuments({ tenantId: "market-alpha" }), 1);
  } finally {
    await app.close();
    await notesPlugin.stop?.(ctx);
    await marketplacePlugin.stop?.(ctx);
    await organizationsPlugin.stop?.(ctx);
    await db.dropDatabase();
    await client.close();
  }
});
