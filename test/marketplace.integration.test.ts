import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
import { authPlugin } from "../src/plugins/auth/auth.plugin.js";
import { organizationsPlugin } from "../src/plugins/organizations/organizations.plugin.js";
import { marketplacePlugin } from "../src/plugins/marketplace/marketplace.plugin.js";
import { notesPlugin } from "../src/plugins/notes/notes.plugin.js";
import { unmaskResourceId } from "../src/core/session-id.js";
import { BeeEventBus } from "../src/core/event-bus.js";
import type { BeeContext, BeeLogger } from "../src/core/types.js";

const uri = process.env.MONGODB_TEST_URI;

test("company plans and purchases control plugin visibility, installation and access", { skip: !uri }, async () => {
  const dbName = "bee_marketplace_test_" + Date.now();
  const client = new MongoClient(uri!);
  await client.connect();
  const db = client.db(dbName);

  const resolveJobId = async (token:string, reference:string) => {
    const claims=JSON.parse(Buffer.from(token.split(".")[1],"base64url").toString("utf8")) as {sid:string};
    const session=await db.collection("refresh_sessions").findOne({id:claims.sid});
    assert.ok(session);
    return unmaskResourceId(reference,"job",{sessionId:session.id,expiresAt:session.expiresAt}, "01234567890123456789012345678901");
  };
  const waitForInstallJob = async (jobId: string) => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const job = await db.collection("plugin_install_jobs").findOne({ id: jobId });
      if (job?.status === "succeeded") return job;
      if (job?.status === "failed") throw new Error("Plugin install job failed: " + String(job.error));
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error("Timed out waiting for plugin install job " + jobId);
  };
  const passwordHash = await bcrypt.hash("Test-password-12345", 10);
  const now = new Date();
  await db.collection("tenants").insertMany([
    { id: "market-alpha", name: "Market Alpha", status: "active", createdAt: now },
    { id: "market-beta", name: "Market Beta", status: "active", createdAt: now }
  ]);
  await db.collection("users").insertMany([
    { id: "market-owner-alpha", email: "owner@market-alpha.test", passwordHash, roles: ["admin"], enabled: true, allowedClients: ["dashboard","public"], tenantId: "market-alpha", createdAt: now, updatedAt: now },
    { id: "market-owner-beta", email: "owner@market-beta.test", passwordHash, roles: ["admin"], enabled: true, allowedClients: ["dashboard"], tenantId: "market-beta", createdAt: now, updatedAt: now }
  ]);

  await db.collection("memberships").insertMany([
    { id: "market-membership-alpha", userId: "market-owner-alpha", tenantId: "market-alpha", role: "owner", status: "active", createdAt: now, updatedAt: now },
    { id: "market-membership-beta", userId: "market-owner-beta", tenantId: "market-beta", role: "owner", status: "active", createdAt: now, updatedAt: now }
  ]);

  const app = Fastify();
  app.register(jwt, { secret: "01234567890123456789012345678901" });
  const logger: BeeLogger = { info(){}, warn(){}, error(){} };
  const ctx: BeeContext = {
    appName: "Bee marketplace test",
    version: "test",
    events: new BeeEventBus(),
    logger,
    server: app,
    mongoClient: client,
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
    const publicLogin=await app.inject({method:"POST",url:"/auth/login",payload:{email:"owner@market-alpha.test",password:"Test-password-12345",client:"public"}});
    assert.equal(publicLogin.statusCode,200);
    const publicMarketplace=await app.inject({method:"GET",url:"/marketplace/plugins",headers:{authorization:"Bearer "+publicLogin.json().accessToken}});
    assert.equal(publicMarketplace.statusCode,403,"public-client tokens must not access the private plugin marketplace");
    const betaToken = await login("owner@market-beta.test");
    const webhook = (payload: unknown, secret = "test-billing-secret") => app.inject({
      method: "POST",
      url: "/billing/webhooks/entitlement",
      headers: { authorization: "Bearer " + secret },
      payload
    });

    const betaPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const betaUpgradePayload = {
      event: "subscription.updated" as const,
      tenantId: "market-beta",
      planId: "pro",
      status: "active" as const,
      expiresAt: betaPeriodEnd
    };
    const betaUpgrade = await webhook(betaUpgradePayload);
    assert.equal(betaUpgrade.statusCode, 200);
    assert.equal(betaUpgrade.json().changed, true);
    assert.equal(await db.collection("tenant_audit_events").countDocuments({
      tenantId: "market-beta", actorId: "billing-webhook", action: "subscription.updated", resourceId: "market-beta"
    }), 1, "subscription changes must be tenant-audited");
    const duplicateBetaUpgrade = await webhook(betaUpgradePayload);
    assert.equal(duplicateBetaUpgrade.statusCode, 200);
    assert.equal(duplicateBetaUpgrade.json().changed, false);
    assert.equal(await db.collection("tenant_audit_events").countDocuments({
      tenantId: "market-beta", actorId: "billing-webhook", action: "subscription.updated", resourceId: "market-beta"
    }), 1, "duplicate subscription webhooks must not duplicate audit events");
    const betaConcurrentPeriodEnd = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString();
    const betaConcurrentPayload = { ...betaUpgradePayload, expiresAt: betaConcurrentPeriodEnd };
    const concurrentSubscriptionDeliveries = await Promise.all([
      webhook(betaConcurrentPayload),
      webhook(betaConcurrentPayload)
    ]);
    assert.ok(concurrentSubscriptionDeliveries.every(response => response.statusCode === 200));
    assert.equal(concurrentSubscriptionDeliveries.filter(response => response.json().changed === true).length, 1, "only one concurrent duplicate subscription delivery may apply a state transition");
    assert.equal(concurrentSubscriptionDeliveries.filter(response => response.json().changed === false).length, 1, "the losing concurrent delivery must become a no-op");
    assert.equal(await db.collection("tenant_audit_events").countDocuments({
      tenantId: "market-beta", actorId: "billing-webhook", action: "subscription.updated", resourceId: "market-beta"
    }), 2, "concurrent duplicate subscription webhooks must append one audit event for the transition");

    const alphaCatalog = await app.inject({ method: "GET", url: "/marketplace/plugins", headers: { authorization: "Bearer " + alphaToken } });
    assert.equal(alphaCatalog.statusCode, 200);
    const alphaPlugins=alphaCatalog.json().plugins as Array<{pluginKey:string;id:string;entitled:boolean;purchasable:boolean}>;
    assert.ok(alphaPlugins.some(plugin=>plugin.pluginKey==="files"),"Files must remain visible in the tenant marketplace");
    assert.ok(alphaPlugins.some(plugin=>plugin.pluginKey==="notes"),"Notes must remain visible in the tenant marketplace");
    const alphaNotesOffer = alphaPlugins.find(plugin => plugin.pluginKey === "notes");
    const alphaNotesPluginRef = alphaNotesOffer.id as string;
    assert.equal(alphaNotesOffer.pluginKey, "notes", "frontend registry key must remain stable while the resource reference stays opaque");
    assert.equal(alphaNotesOffer.entitled, false);
    assert.equal(alphaNotesOffer.purchasable, true);
    const alphaCannotInstallNotes = await app.inject({ method: "POST", url: "/marketplace/plugins/" + encodeURIComponent(alphaNotesPluginRef) + "/install", headers: { authorization: "Bearer " + alphaToken } });
    assert.equal(alphaCannotInstallNotes.statusCode, 402);

    const betaCatalog = await app.inject({ method: "GET", url: "/marketplace/plugins", headers: { authorization: "Bearer " + betaToken } });
    assert.equal(betaCatalog.statusCode, 200);
    const betaPlugins=betaCatalog.json().plugins as Array<{pluginKey:string;id:string}>;
    assert.ok(betaPlugins.some(plugin=>plugin.pluginKey==="files"),"Files must remain visible in the second tenant marketplace");
    assert.ok(betaPlugins.some(plugin=>plugin.pluginKey==="notes"),"Notes must remain visible in the second tenant marketplace");
    const betaNotesPluginRef = betaPlugins.find(plugin => plugin.pluginKey === "notes")!.id as string;
    const betaNotesInstallAttempts = await Promise.all([
      app.inject({ method: "POST", url: "/marketplace/plugins/" + encodeURIComponent(betaNotesPluginRef) + "/install", headers: { authorization: "Bearer " + betaToken } }),
      app.inject({ method: "POST", url: "/marketplace/plugins/" + encodeURIComponent(betaNotesPluginRef) + "/install", headers: { authorization: "Bearer " + betaToken } })
    ]);
    assert.ok(betaNotesInstallAttempts.every(response => [200, 202].includes(response.statusCode)));
    const acceptedBetaInstall = betaNotesInstallAttempts.find(response => response.statusCode === 202);
    assert.ok(acceptedBetaInstall, "one request must enqueue the installation");
    const betaInstallJobRef = acceptedBetaInstall.json().jobId as string;
    assert.ok(!/^[0-9a-f-]{36}$/i.test(betaInstallJobRef));
    const betaInstallJobId = await resolveJobId(betaToken,betaInstallJobRef);
    for (const response of betaNotesInstallAttempts.filter(item => item.statusCode === 202)) {
      assert.equal(await resolveJobId(betaToken,response.json().jobId as string), betaInstallJobId, "concurrent install references must resolve to the same durable job");
    }
    const foreignJobRead = await app.inject({ method: "GET", url: "/marketplace/install-jobs/" + betaInstallJobRef, headers: { authorization: "Bearer " + alphaToken } });
    assert.equal(foreignJobRead.statusCode, 404, "install jobs must be tenant-scoped");
    const betaInstallJob = await waitForInstallJob(betaInstallJobId);
    assert.equal(betaInstallJob.attempts, 1);
    assert.equal(await db.collection("tenant_audit_events").countDocuments({tenantId:"market-beta",action:"plugin.installed",resourceType:"plugin",resourceId:"notes"}),1,"successful concurrent plugin installation should be audited once");
    const betaCompanyRefs=await app.inject({method:"GET",url:"/companies",headers:{authorization:"Bearer "+betaToken}});
    const betaCompanyRef=betaCompanyRefs.json().companies[0].id as string;
    const pluginAudit=await app.inject({method:"GET",url:"/companies/"+encodeURIComponent(betaCompanyRef)+"/audit-events?action=plugin.installed&limit=100",headers:{authorization:"Bearer "+betaToken}});
    assert.equal(pluginAudit.statusCode,200);
    const pluginAuditEvent=pluginAudit.json().events.find((event:{action:string})=>event.action==="plugin.installed");
    assert.ok(pluginAuditEvent);
    assert.notEqual(pluginAuditEvent.metadata.jobId,betaInstallJobId,"audit metadata must not leak internal lifecycle job IDs");
    assert.ok(!/^[0-9a-f-]{36}$/i.test(pluginAuditEvent.metadata.jobId));
    assert.equal(await db.collection("tenant_plugin_installations").countDocuments({ tenantId: "market-beta", pluginId: "notes", status: "installed" }), 1);
    const betaNotesList = await app.inject({ method: "GET", url: "/notes", headers: { authorization: "Bearer " + betaToken } });
    assert.equal(betaNotesList.statusCode, 200);
    assert.deepEqual(betaNotesList.json().notes, []);
    await db.collection("tenant_plugin_installations").updateOne({ tenantId: "market-beta", pluginId: "notes" }, { $set: { enabled: false } });
    const betaDisabledCatalog = await app.inject({ method: "GET", url: "/marketplace/plugins", headers: { authorization: "Bearer " + betaToken } });
    assert.equal(betaDisabledCatalog.json().plugins.find((plugin: { pluginKey: string }) => plugin.pluginKey === "notes").enabled, false);
    const betaDisabledNotes = await app.inject({ method: "GET", url: "/notes", headers: { authorization: "Bearer " + betaToken } });
    assert.equal(betaDisabledNotes.statusCode, 403, "installed but disabled plugins must reject API access");
    await db.collection("tenant_plugin_installations").updateOne({ tenantId: "market-beta", pluginId: "notes" }, { $set: { enabled: true } });
    const betaNoteCreate = await app.inject({
      method: "POST",
      url: "/notes",
      headers: { authorization: "Bearer " + betaToken },
      payload: { title: "Beta confidential", content: "Only Market Beta should read this" }
    });
    assert.equal(betaNoteCreate.statusCode, 201);
    const betaNoteId = betaNoteCreate.json().note.id as string;
    assert.ok(!/^[0-9a-f-]{36}$/i.test(betaNoteId),"note IDs must be opaque references");
    assert.notEqual(betaNoteCreate.json().note.createdBy,"market-owner-beta","note creator IDs must not expose internal user IDs");

    const betaUninstallAttempts = await Promise.all([
      app.inject({ method: "DELETE", url: "/marketplace/plugins/" + encodeURIComponent(betaNotesPluginRef) + "/install", headers: { authorization: "Bearer " + betaToken } }),
      app.inject({ method: "DELETE", url: "/marketplace/plugins/" + encodeURIComponent(betaNotesPluginRef) + "/install", headers: { authorization: "Bearer " + betaToken } })
    ]);
    assert.ok(betaUninstallAttempts.every(response => response.statusCode === 202));
    const betaUninstallJobRef = betaUninstallAttempts[0].json().jobId as string;
    const betaUninstallJobId = await resolveJobId(betaToken,betaUninstallJobRef);
    assert.equal(await resolveJobId(betaToken,betaUninstallAttempts[1].json().jobId as string), betaUninstallJobId, "concurrent uninstall references must resolve to the same durable job");
    assert.equal(betaUninstallAttempts[0].json().action, "uninstall");
    const conflictingInstall = await app.inject({ method: "POST", url: "/marketplace/plugins/" + encodeURIComponent(betaNotesPluginRef) + "/install", headers: { authorization: "Bearer " + betaToken } });
    assert.equal(conflictingInstall.statusCode, 409, "install must not race an active uninstall for the same company/plugin");
    const foreignUninstallJobRead = await app.inject({ method: "GET", url: "/marketplace/install-jobs/" + betaUninstallJobRef, headers: { authorization: "Bearer " + alphaToken } });
    assert.equal(foreignUninstallJobRead.statusCode, 404, "uninstall jobs must be tenant-scoped");
    const betaUninstallJob = await waitForInstallJob(betaUninstallJobId);
    assert.equal(betaUninstallJob.action, "uninstall");
    assert.equal(await db.collection("tenant_audit_events").countDocuments({tenantId:"market-beta",action:"plugin.uninstalled",resourceType:"plugin",resourceId:"notes"}),1,"successful plugin uninstall should be tenant-audited once");
    const betaAfterUninstall = await app.inject({ method: "GET", url: "/notes", headers: { authorization: "Bearer " + betaToken } });
    assert.equal(betaAfterUninstall.statusCode, 403);
    assert.equal(await db.collection("tenant_notes").countDocuments({ tenantId: "market-beta" }), 1);
    const betaReinstall = await app.inject({ method: "POST", url: "/marketplace/plugins/" + encodeURIComponent(betaNotesPluginRef) + "/install", headers: { authorization: "Bearer " + betaToken } });
    assert.equal(betaReinstall.statusCode, 202);
    await waitForInstallJob(await resolveJobId(betaToken,betaReinstall.json().jobId as string));
    assert.equal(await db.collection("tenant_audit_events").countDocuments({tenantId:"market-beta",action:"plugin.installed",resourceType:"plugin",resourceId:"notes"}),2,"plugin reinstall should produce a second install event");
    const betaAfterReinstall = await app.inject({ method: "GET", url: "/notes", headers: { authorization: "Bearer " + betaToken } });
    assert.equal(betaAfterReinstall.statusCode, 200);
    assert.equal(betaAfterReinstall.json().notes.length, 1);

    await db.collection("tenant_plugin_installations").updateOne(
      { tenantId: "market-beta", pluginId: "notes" },
      { $set: { version: "0.0.9" } }
    );
    const betaUpdate = await app.inject({
      method: "POST",
      url: "/marketplace/plugins/" + encodeURIComponent(betaNotesPluginRef) + "/update",
      headers: { authorization: "Bearer " + betaToken }
    });
    assert.equal(betaUpdate.statusCode, 202);
    assert.equal(betaUpdate.json().action, "update");
    const betaUpdateJob = await waitForInstallJob(await resolveJobId(betaToken,betaUpdate.json().jobId as string));
    assert.equal(betaUpdateJob.status, "succeeded");
    const betaUpdatedInstallation = await db.collection("tenant_plugin_installations").findOne({ tenantId: "market-beta", pluginId: "notes" });
    assert.equal(betaUpdatedInstallation?.version, "0.1.0");
    assert.equal(betaUpdatedInstallation?.status, "installed");
    assert.equal(await db.collection("tenant_audit_events").countDocuments({
      tenantId: "market-beta", action: "plugin.updated", resourceType: "plugin", resourceId: "notes"
    }), 1, "successful plugin updates must be audited once");

    const alphaCannotUseNotes = await app.inject({ method: "GET", url: "/notes", headers: { authorization: "Bearer " + alphaToken } });
    assert.equal(alphaCannotUseNotes.statusCode, 403);

    const invalidWebhook = await webhook({
      event: "plugin.purchase", tenantId: "market-alpha", pluginId: "notes", providerReference: "alpha-notes-001"
    }, "wrong-secret");
    assert.equal(invalidWebhook.statusCode, 401);
    const invalidPlanWebhook = await webhook({
      event: "subscription.updated", tenantId: "market-alpha", planId: "unknown-plan", status: "active"
    });
    assert.equal(invalidPlanWebhook.statusCode, 400);
    const invalidExpiryPurchase = await webhook({
      event: "plugin.purchase", tenantId: "market-alpha", pluginId: "notes",
      providerReference: "alpha-invalid-date", expiresAt: "not-a-date"
    });
    assert.equal(invalidExpiryPurchase.statusCode, 400);
    const oversizedProviderReference = await webhook({
      event: "plugin.purchase", tenantId: "market-alpha", pluginId: "notes",
      providerReference: "x".repeat(201)
    });
    assert.equal(oversizedProviderReference.statusCode, 400);
    const unknownTenantWebhook = await webhook({
      event: "plugin.purchase", tenantId: "no-such-company", pluginId: "notes",
      providerReference: "unknown-tenant-purchase"
    });
    assert.equal(unknownTenantWebhook.statusCode, 400);

    // A provider reference is permanently bound to the plugin recorded by the first event.
    await db.collection("plugin_purchases").insertOne({
      id: "alpha-legacy-purchase",
      tenantId: "market-alpha",
      pluginId: "legacy-plugin",
      providerReference: "alpha-bound-to-legacy",
      status: "active",
      purchasedAt: now,
      expiresAt: null
    });
    const rebindPurchase = await webhook({
      event: "plugin.purchase",
      tenantId: "market-alpha",
      pluginId: "notes",
      providerReference: "alpha-bound-to-legacy"
    });
    assert.equal(rebindPurchase.statusCode, 409);
    const rebindState = await db.collection("plugin_purchases").findOne({ tenantId: "market-alpha", providerReference: "alpha-bound-to-legacy" });
    assert.equal(rebindState?.pluginId, "legacy-plugin");
    assert.equal(rebindState?.status, "active");
    const mismatchedRevoke = await webhook({
      event: "plugin.revoke",
      tenantId: "market-alpha",
      pluginId: "notes",
      providerReference: "alpha-bound-to-legacy"
    });
    assert.equal(mismatchedRevoke.statusCode, 409);
    const mismatchedRevokeState = await db.collection("plugin_purchases").findOne({ tenantId: "market-alpha", providerReference: "alpha-bound-to-legacy" });
    assert.equal(mismatchedRevokeState?.status, "active", "a mismatched plugin event must not revoke another plugin's purchase");

    const alphaPurchase = await webhook({
      event: "plugin.purchase",
      tenantId: "market-alpha",
      pluginId: "notes",
      providerReference: "alpha-notes-001"
    });
    assert.equal(alphaPurchase.statusCode, 200);
    assert.equal(alphaPurchase.json().changed, true);
    assert.equal(await db.collection("tenant_audit_events").countDocuments({
      tenantId: "market-alpha", actorId: "billing-webhook", action: "plugin.entitlement_granted", resourceId: "alpha-notes-001"
    }), 1, "plugin entitlement grants must be tenant-audited");
    const duplicateAlphaPurchase = await webhook({
      event: "plugin.purchase",
      tenantId: "market-alpha",
      pluginId: "notes",
      providerReference: "alpha-notes-001"
    });
    assert.equal(duplicateAlphaPurchase.statusCode, 200);
    assert.equal(duplicateAlphaPurchase.json().changed, false);
    assert.equal(await db.collection("tenant_audit_events").countDocuments({
      tenantId: "market-alpha", actorId: "billing-webhook", action: "plugin.entitlement_granted", resourceId: "alpha-notes-001"
    }), 1, "duplicate purchase webhooks must not duplicate audit events");
    const concurrentPurchasePayload = {
      event: "plugin.purchase" as const,
      tenantId: "market-alpha",
      pluginId: "notes",
      providerReference: "alpha-concurrent-purchase-001"
    };
    const concurrentPurchaseDeliveries = await Promise.all([
      webhook(concurrentPurchasePayload),
      webhook(concurrentPurchasePayload)
    ]);
    assert.ok(concurrentPurchaseDeliveries.every(response => response.statusCode === 200));
    assert.equal(concurrentPurchaseDeliveries.filter(response => response.json().changed === true).length, 1, "a concurrent first purchase must create exactly one entitlement transition");
    assert.equal(concurrentPurchaseDeliveries.filter(response => response.json().changed === false).length, 1);
    assert.equal(await db.collection("plugin_purchases").countDocuments({ tenantId: "market-alpha", providerReference: "alpha-concurrent-purchase-001" }), 1, "provider-reference uniqueness must prevent duplicate purchase rows");
    assert.equal(await db.collection("tenant_audit_events").countDocuments({
      tenantId: "market-alpha", actorId: "billing-webhook", action: "plugin.entitlement_granted", resourceId: "alpha-concurrent-purchase-001"
    }), 1, "concurrent duplicate purchase webhooks must append one grant event");
    const cleanupConcurrentPurchase = await webhook({
      event: "plugin.revoke",
      tenantId: "market-alpha",
      pluginId: "notes",
      providerReference: "alpha-concurrent-purchase-001"
    });
    assert.equal(cleanupConcurrentPurchase.statusCode, 200);
    assert.equal(cleanupConcurrentPurchase.json().changed, true);
    const alphaPurchasedCatalog = await app.inject({ method: "GET", url: "/marketplace/plugins", headers: { authorization: "Bearer " + alphaToken } });
    assert.ok(alphaPurchasedCatalog.json().plugins.some((plugin: { id: string; name: string; entitled: boolean; accessSource: string }) => plugin.name.toLowerCase() === "notes" && plugin.entitled && plugin.accessSource === "purchase"));
    const alphaNotesInstall = await app.inject({ method: "POST", url: "/marketplace/plugins/" + encodeURIComponent(alphaNotesPluginRef) + "/install", headers: { authorization: "Bearer " + alphaToken } });
    assert.equal(alphaNotesInstall.statusCode, 202);
    const alphaInstallJob = await waitForInstallJob(await resolveJobId(alphaToken,alphaNotesInstall.json().jobId as string));
    assert.equal(alphaInstallJob.status, "succeeded");
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

    // IDOR regression coverage: foreign IDs must not update or delete another company's notes.
    const alphaCannotUpdateBeta = await app.inject({
      method: "PUT",
      url: "/notes/" + betaNoteId,
      headers: { authorization: "Bearer " + alphaToken },
      payload: { title: "Cross-tenant tampering", content: "Must not modify Beta data" }
    });
    assert.equal(alphaCannotUpdateBeta.statusCode, 404);
    const alphaCannotDeleteBeta = await app.inject({
      method: "DELETE",
      url: "/notes/" + betaNoteId,
      headers: { authorization: "Bearer " + alphaToken }
    });
    assert.equal(alphaCannotDeleteBeta.statusCode, 404);
    const betaNoteAfterForeignMutations = await app.inject({
      method: "GET",
      url: "/notes/" + betaNoteId,
      headers: { authorization: "Bearer " + betaToken }
    });
    assert.equal(betaNoteAfterForeignMutations.statusCode, 200);
    assert.equal(betaNoteAfterForeignMutations.json().note.title, "Beta confidential");
    assert.equal(betaNoteAfterForeignMutations.json().note.content, "Only Market Beta should read this");

    const betaCannotUpdateAlpha = await app.inject({
      method: "PUT",
      url: "/notes/" + alphaNoteId,
      headers: { authorization: "Bearer " + betaToken },
      payload: { title: "Cross-tenant tampering", content: "Must not modify Alpha data" }
    });
    assert.equal(betaCannotUpdateAlpha.statusCode, 404);
    const betaCannotDeleteAlpha = await app.inject({
      method: "DELETE",
      url: "/notes/" + alphaNoteId,
      headers: { authorization: "Bearer " + betaToken }
    });
    assert.equal(betaCannotDeleteAlpha.statusCode, 404);
    const alphaNoteAfterForeignMutations = await app.inject({
      method: "GET",
      url: "/notes/" + alphaNoteId,
      headers: { authorization: "Bearer " + alphaToken }
    });
    assert.equal(alphaNoteAfterForeignMutations.statusCode, 200);
    assert.equal(alphaNoteAfterForeignMutations.json().note.title, "Alpha private");
    assert.equal(alphaNoteAfterForeignMutations.json().note.content, "This belongs to Alpha");

    const revokePayload = {
      event: "plugin.revoke" as const,
      tenantId: "market-alpha",
      pluginId: "notes",
      providerReference: "alpha-notes-001"
    };
    const concurrentRevocations = await Promise.all([webhook(revokePayload), webhook(revokePayload)]);
    assert.ok(concurrentRevocations.every(response => response.statusCode === 200));
    assert.equal(concurrentRevocations.filter(response => response.json().changed === true).length, 1, "only one concurrent duplicate revocation may apply a state transition");
    assert.equal(concurrentRevocations.filter(response => response.json().changed === false).length, 1, "the losing concurrent revocation must become a no-op");
    assert.equal(await db.collection("tenant_audit_events").countDocuments({
      tenantId: "market-alpha", actorId: "billing-webhook", action: "plugin.entitlement_revoked", resourceId: "alpha-notes-001"
    }), 1, "concurrent revocation deliveries must append one tenant audit event");
    const duplicateRevoke = await webhook(revokePayload);
    assert.equal(duplicateRevoke.statusCode, 200);
    assert.equal(duplicateRevoke.json().changed, false);
    assert.equal(await db.collection("tenant_audit_events").countDocuments({
      tenantId: "market-alpha", actorId: "billing-webhook", action: "plugin.entitlement_revoked", resourceId: "alpha-notes-001"
    }), 1, "duplicate revocation webhooks must not duplicate audit events");
    const alphaAfterRevoke = await app.inject({ method: "GET", url: "/notes", headers: { authorization: "Bearer " + alphaToken } });
    assert.equal(alphaAfterRevoke.statusCode, 403);
    assert.equal(await db.collection("tenant_notes").countDocuments({ tenantId: "market-alpha" }), 1);

    const expireBetaSubscription = await webhook({
      event: "subscription.updated",
      tenantId: "market-beta",
      planId: "pro",
      status: "active",
      expiresAt: new Date(Date.now() - 60_000).toISOString()
    });
    assert.equal(expireBetaSubscription.statusCode, 200);
    const betaAfterExpiry = await app.inject({ method: "GET", url: "/notes", headers: { authorization: "Bearer " + betaToken } });
    assert.equal(betaAfterExpiry.statusCode, 403);
    assert.equal(await db.collection("tenant_notes").countDocuments({ tenantId: "market-beta" }), 1);
  } finally {
    await app.close();
    await notesPlugin.stop?.(ctx);
    await marketplacePlugin.stop?.(ctx);
    await organizationsPlugin.stop?.(ctx);
    await db.dropDatabase();
    await client.close();
  }
});
