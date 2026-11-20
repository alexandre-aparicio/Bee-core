import type { BeePlugin } from "../../core/types.js";
import { MongoClient, type Collection } from "mongodb";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { TenantCollection } from "../../core/tenant-collection.js";
import { runTenantPluginMigrations } from "../../core/plugin-migrations.js";
import { resolveTenantContext, hasTenantPermission } from "../../core/tenant-context.js";
import {
  getBuiltInPlan,
  getTenantPluginCatalog,
  getTenantSubscription,
  getTrustedPluginPackage,
  hasPluginEntitlement,
  isPluginInstalled,
  seedPluginCommerce
} from "../../core/plugin-entitlements.js";

let mongoClient: MongoClient | undefined;

export const marketplacePlugin: BeePlugin = {
  manifest: {
    name: "marketplace",
    version: "0.2.0",
    description: "Central business plugin catalog with company plans and purchase entitlements",
    dependencies: ["auth", "organizations"]
  },
  async initialize(ctx) {
    mongoClient = new MongoClient(String(ctx.config.mongoUri ?? ""), { maxPoolSize: 10, serverSelectionTimeoutMS: 10000 });
    await mongoClient.connect();
    const db = mongoClient.db(String(ctx.config.mongoDbName ?? "bee_core"));
    const auditEvents:Collection<TenantAuditEvent>=db.collection("tenant_audit_events");
    await ensureTenantAuditIndexes(auditEvents);
    const auditMarketplaceEvent=async(event:AuditEventDraft)=>{try{await appendTenantAuditEvent(auditEvents,{...event,id:randomUUID(),occurredAt:new Date()});}catch(error){ctx.logger.error("Marketplace audit event write failed",{action:event.action,tenantId:event.tenantId,error});}};
    await seedPluginCommerce(db);
    // Recover interrupted synchronous installs after a process restart; never leave the tenant stuck in installing.
    await db.collection("tenant_plugin_installations").updateMany({status:"installing"},{$set:{status:"failed",error:"Installation interrupted by platform restart; retry installation",updatedAt:new Date()}});
    const billingWebhookSecret = String(ctx.config.billingWebhookSecret ?? "");
    ctx.server.post<{ Body: {
      event?: "plugin.purchase" | "plugin.revoke" | "subscription.updated";
      tenantId?: string;
      pluginId?: string;
      providerReference?: string;
      expiresAt?: string | null;
      planId?: string;
      status?: "trial" | "active" | "past_due" | "cancelled";
    } }>("/billing/webhooks/entitlement", async (request, reply) => {
      if (!billingWebhookSecret) return reply.code(503).send({ error: "Billing webhook is not configured" });
      const authorization = String(request.headers.authorization ?? "");
      const supplied = Buffer.from(authorization.startsWith("Bearer ") ? authorization.slice(7) : "");
      const expected = Buffer.from(billingWebhookSecret);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
        return reply.code(401).send({ error: "Invalid billing webhook credentials" });
      }

      const body = request.body ?? {};
      const tenantId = String(body.tenantId ?? "");
      if (!tenantId || !await db.collection("tenants").findOne({ id: tenantId })) {
        return reply.code(400).send({ error: "A valid tenantId is required" });
      }

      if (body.event === "subscription.updated") {
        const plan = body.planId ? getBuiltInPlan(body.planId) : undefined;
        const status = body.status;
        if (!plan || !status || !["trial", "active", "past_due", "cancelled"].includes(status)) {
          return reply.code(400).send({ error: "Valid planId and subscription status are required" });
        }
        const subscriptions = new TenantCollection<import("../../core/plugin-entitlements.js").TenantSubscription>(
          db.collection("tenant_subscriptions"),
          tenantId
        );
        const current = await getTenantSubscription(db, tenantId);
        const periodEnd = body.expiresAt ? new Date(body.expiresAt) : null;
        if (periodEnd && Number.isNaN(periodEnd.getTime())) return reply.code(400).send({ error: "Invalid subscription expiry date" });
        await subscriptions.updateOne(
          { id: current.id },
          { $set: { planId: plan.id, status, currentPeriodEnd: periodEnd, updatedAt: new Date() } }
        );
        await ctx.events.emit("subscription.updated", { tenantId, planId: plan.id, status });
        return { success: true, event: body.event };
      }

      if (body.event === "plugin.purchase" || body.event === "plugin.revoke") {
        const pluginId = String(body.pluginId ?? "");
        const providerReference = String(body.providerReference ?? "");
        const definition = getTrustedPluginPackage(pluginId);
        if (!definition || !definition.purchasable || !providerReference) {
          return reply.code(400).send({ error: "A purchasable plugin and providerReference are required" });
        }
        type Purchase = import("mongodb").Document & {
          id: string; tenantId: string; pluginId: string; providerReference: string;
          status: "active" | "revoked"; purchasedAt: Date; expiresAt: Date | null;
        };
        const purchases = new TenantCollection<Purchase>(db.collection<Purchase>("plugin_purchases"), tenantId);
        const current = await purchases.findOne({ providerReference });
        if (body.event === "plugin.purchase") {
          const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
          if (expiresAt && Number.isNaN(expiresAt.getTime())) return reply.code(400).send({ error: "Invalid purchase expiry date" });
          if (current) {
            await purchases.updateOne({ providerReference }, { $set: { pluginId, status: "active", expiresAt } });
          } else {
            await purchases.insertOne({
              id: randomUUID(), pluginId, providerReference, status: "active",
              purchasedAt: new Date(), expiresAt
            });
          }
        } else {
          if (!current) return reply.code(404).send({ error: "Purchase reference not found" });
          await purchases.updateOne({ providerReference }, { $set: { status: "revoked" } });
        }
        await ctx.events.emit("plugin.entitlement.updated", { tenantId, pluginId, event: body.event });
        return { success: true, event: body.event };
      }

      return reply.code(400).send({ error: "Unsupported entitlement event" });
    });


    const authenticate = async (request: any, reply: any) => {
      try {
        await request.jwtVerify();
        const tenant = await resolveTenantContext(db, request.user);
        if (!tenant) {
          reply.code(401).send({ error: "Unauthorized or active company session required" });
          return null;
        }
        if (!hasTenantPermission(tenant, "plugins.read")) {
          reply.code(403).send({ error: "Plugin catalog permission required" });
          return null;
        }
        return tenant;
      } catch {
        reply.code(401).send({ error: "Unauthorized" });
        return null;
      }
    };

    ctx.server.get("/marketplace/entitlements", async (request: any, reply: any) => {
      const tenant = await authenticate(request, reply);
      if (!tenant) return;
      const [subscription, catalog] = await Promise.all([
        getTenantSubscription(db, tenant.tenantId),
        getTenantPluginCatalog(db, tenant.tenantId)
      ]);
      return {
        tenantId: tenant.tenantId,
        subscription: {
          planId: subscription.planId,
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd
        },
        entitlements: catalog.filter(plugin => plugin.entitled).map(plugin => ({
          pluginId: plugin.id,
          source: plugin.accessSource,
          installed: plugin.installed
        }))
      };
    });

    ctx.server.get("/marketplace/plugins", async (request: any, reply: any) => {
      const tenant = await authenticate(request, reply);
      if (!tenant) return;
      return { tenantId: tenant.tenantId, plugins: await getTenantPluginCatalog(db, tenant.tenantId) };
    });

    ctx.server.get<{ Params: { pluginId: string } }>("/marketplace/plugins/:pluginId", async (request: any, reply: any) => {
      const tenant = await authenticate(request, reply);
      if (!tenant) return;
      const plugin = (await getTenantPluginCatalog(db, tenant.tenantId)).find(item => item.id === request.params.pluginId);
      if (!plugin) return reply.code(404).send({ error: "Plugin not visible to this company" });
      return { plugin };
    });

    ctx.server.get<{ Params: { pluginId: string } }>("/marketplace/plugins/:pluginId/versions", async (request: any, reply: any) => {
      const tenant = await authenticate(request, reply);
      if (!tenant) return;
      const plugin = (await getTenantPluginCatalog(db, tenant.tenantId)).find(item => item.id === request.params.pluginId);
      if (!plugin || !plugin.entitled) return reply.code(404).send({ error: "Plugin version information is unavailable" });
      const publishedVersions = await db.collection("plugin_versions")
        .find({ pluginId: plugin.id, status: "published" })
        .sort({ publishedAt: -1 })
        .toArray();
      return {
        pluginId: plugin.id,
        versions: publishedVersions.map(item => ({
          version: item.version,
          compatibility: item.compatibility ?? null,
          dependencies: item.dependencies ?? [],
          publishedAt: item.publishedAt ?? null
        }))
      };
    });

    ctx.server.post<{ Params: { pluginId: string } }>("/marketplace/plugins/:pluginId/install", async (request: any, reply: any) => {
      const tenant = await authenticate(request, reply);
      if (!tenant) return;
      if (!hasTenantPermission(tenant, "plugins.install")) return reply.code(403).send({ error: "Plugin installation permission required" });
      const pluginId = String(request.params.pluginId ?? "");
      const catalog = await getTenantPluginCatalog(db, tenant.tenantId);
      const plugin = catalog.find(item => item.id === pluginId);
      if (!plugin) return reply.code(404).send({ error: "Plugin not visible to this company" });
      if (!plugin.entitled) return reply.code(402).send({ error: "An active plan entitlement or plugin purchase is required" });
      const trusted = getTrustedPluginPackage(pluginId);
      if (!trusted) return reply.code(404).send({ error: "Trusted plugin package is unavailable" });
      for (const dependency of trusted.dependencies) {
        if (!await hasPluginEntitlement(db, tenant.tenantId, dependency) || !await isPluginInstalled(db, tenant.tenantId, dependency)) {
          return reply.code(409).send({ error: "Required plugin dependency is not installed: " + dependency });
        }
      }
      if (await isPluginInstalled(db, tenant.tenantId, pluginId)) return { pluginId, status: "installed", alreadyInstalled: true };
      const installations = db.collection("tenant_plugin_installations");
      const now = new Date();
      try {
        await installations.updateOne(
          { tenantId: tenant.tenantId, pluginId, status: { $ne: "installing" } },
          { $set: { status: "installing", version: trusted.version, updatedAt: now, error: null }, $setOnInsert: { id: randomUUID(), tenantId: tenant.tenantId, pluginId, installedAt: null } },
          { upsert: true }
        );
      } catch (error) {
        if ((error as { code?: number }).code === 11000) {
          return reply.code(409).send({ error: "Plugin installation is already in progress" });
        }
        throw error;
      }
      try {
        await runTenantPluginMigrations(db, tenant.tenantId, pluginId, trusted.migrations ?? []);
        await trusted.installTenant?.(db, tenant.tenantId);
        await installations.updateOne({ tenantId: tenant.tenantId, pluginId }, { $set: { status: "installed", version: trusted.version, installedAt: new Date(), updatedAt: new Date() }, $unset: { error: "" } });
        await auditMarketplaceEvent({tenantId:tenant.tenantId,actorId:tenant.userId,action:"plugin.installed",outcome:"success",resourceType:"plugin",resourceId:pluginId,metadata:{version:trusted.version}});
        return reply.code(201).send({ pluginId, status: "installed", version: trusted.version });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Plugin installation failed";
        await installations.updateOne({ tenantId: tenant.tenantId, pluginId }, { $set: { status: "failed", error: message, updatedAt: new Date() } });
        ctx.logger.error("Tenant plugin installation failed", { tenantId: tenant.tenantId, pluginId, error: message });
        return reply.code(500).send({ error: "Plugin installation failed", pluginId });
      }
    });

    ctx.server.delete<{ Params: { pluginId: string } }>("/marketplace/plugins/:pluginId/install", async (request: any, reply: any) => {
      const tenant = await authenticate(request, reply);
      if (!tenant) return;
      if (!hasTenantPermission(tenant, "plugins.manage")) return reply.code(403).send({ error: "Plugin management permission required" });
      const pluginId = String(request.params.pluginId ?? "");
      const trusted = getTrustedPluginPackage(pluginId);
      if (!trusted) return reply.code(404).send({ error: "Plugin package not found" });
      if (trusted.system) return reply.code(409).send({ error: "System plugins cannot be uninstalled" });
      if (!await isPluginInstalled(db, tenant.tenantId, pluginId)) return reply.code(404).send({ error: "Plugin is not installed" });
      const otherInstalled = await db.collection("tenant_plugin_installations")
        .find({ tenantId: tenant.tenantId, status: "installed", pluginId: { $ne: pluginId } })
        .toArray();
      for (const installed of otherInstalled) {
        const dependent = getTrustedPluginPackage(String(installed.pluginId));
        if (dependent?.dependencies.includes(pluginId)) {
          return reply.code(409).send({ error: "Plugin is required by installed plugin: " + installed.pluginId });
        }
      }
      await trusted.uninstallTenant?.(db, tenant.tenantId);
      await db.collection("tenant_plugin_installations").updateOne(
        { tenantId: tenant.tenantId, pluginId },
        { $set: { status: "uninstalled", updatedAt: new Date() } }
      );
      await auditMarketplaceEvent({tenantId:tenant.tenantId,actorId:tenant.userId,action:"plugin.uninstalled",outcome:"success",resourceType:"plugin",resourceId:pluginId});
      return { pluginId, status: "uninstalled", dataPreserved: true };
    });

    ctx.logger.info("Marketplace plugin initialized: company catalog is filtered by plan and purchase entitlements.");
  },
  async stop() {
    await mongoClient?.close();
    mongoClient = undefined;
  }
};
