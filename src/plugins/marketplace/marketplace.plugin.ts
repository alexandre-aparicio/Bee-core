import type { BeePlugin } from "../../core/types.js";
import { MongoClient, type Collection } from "mongodb";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { TenantCollection } from "../../core/tenant-collection.js";
import { runTenantPluginMigrations } from "../../core/plugin-migrations.js";
import { claimPluginInstallJob, completePluginInstallJob, enqueuePluginInstallJob, enqueuePluginUninstallJob, ensurePluginInstallJobIndexes, failPluginInstallJob, type PluginInstallJob } from "../../core/plugin-install-jobs.js";
import { resolveTenantContext, hasTenantPermission } from "../../core/tenant-context.js";
import { appendTenantAuditEvent, ensureTenantAuditIndexes, type TenantAuditEvent } from "../../core/audit-log.js";
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
let installWorkerTimer: ReturnType<typeof setInterval> | undefined;
let installWorkerTask: Promise<void> | undefined;

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
    const installJobs:Collection<PluginInstallJob>=db.collection<PluginInstallJob>("plugin_install_jobs");
    await ensurePluginInstallJobIndexes(installJobs);
    await ensureTenantAuditIndexes(auditEvents);
    const auditMarketplaceEvent=async(event:{tenantId:string;actorId:string;action:TenantAuditEvent["action"];outcome:TenantAuditEvent["outcome"];resourceType?:string;resourceId?:string;metadata?:TenantAuditEvent["metadata"]})=>{try{const record:import("../../core/audit-log.js").AuditEventInput={id:randomUUID(),occurredAt:new Date(),tenantId:event.tenantId,actorId:event.actorId,action:event.action,outcome:event.outcome,resourceType:event.resourceType,resourceId:event.resourceId,metadata:event.metadata};await appendTenantAuditEvent(auditEvents,record);}catch(error){ctx.logger.error("Marketplace audit event write failed",{action:event.action,tenantId:event.tenantId,error});}};
    await seedPluginCommerce(db);
    // The durable job lease is the source of truth for crash recovery; do not rewrite live installation state at startup.
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
          await auditMarketplaceEvent({tenantId:tenant.tenantId,actorId:tenant.userId,action:"permission.denied",outcome:"denied",resourceType:"permission",metadata:{permission:"plugins.read"}});
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
      if (!hasTenantPermission(tenant, "plugins.install")) {
        await auditMarketplaceEvent({tenantId:tenant.tenantId,actorId:tenant.userId,action:"permission.denied",outcome:"denied",resourceType:"permission",resourceId:request.params.pluginId,metadata:{permission:"plugins.install"}});
        return reply.code(403).send({ error: "Plugin installation permission required" });
      }
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
      if (await isPluginInstalled(db, tenant.tenantId, pluginId)) {
        return { pluginId, status: "installed", alreadyInstalled: true };
      }
      const queued = await enqueuePluginInstallJob(installJobs, { tenantId: tenant.tenantId, pluginId, actorId: tenant.userId });
      return reply.code(202).send({
        jobId: queued.job.id,
        pluginId,
        status: queued.job.status,
        accepted: true,
        duplicate: !queued.created,
        statusUrl: "/marketplace/install-jobs/" + queued.job.id
      });
    });

    ctx.server.get<{ Params: { jobId: string } }>("/marketplace/install-jobs/:jobId", async (request: any, reply: any) => {
      const tenant = await authenticate(request, reply);
      if (!tenant) return;
      const job = await installJobs.findOne(
        { id: String(request.params.jobId), tenantId: tenant.tenantId },
        { projection: { _id: 0, id: 1, pluginId: 1, action: 1, status: 1, attempts: 1, maxAttempts: 1, createdAt: 1, updatedAt: 1, startedAt: 1, finishedAt: 1, result: 1,  } }
      );
      if (!job) return reply.code(404).send({ error: "Installation job not found" });
      return { job: { ...job, ...(job.status === "failed" ? { error: "Plugin installation failed. Contact an administrator." } : {}) } };
    });

    ctx.server.delete<{ Params: { pluginId: string } }>("/marketplace/plugins/:pluginId/install", async (request: any, reply: any) => {
      const tenant = await authenticate(request, reply);
      if (!tenant) return;
      if (!hasTenantPermission(tenant, "plugins.manage")) {
        await auditMarketplaceEvent({ tenantId: tenant.tenantId, actorId: tenant.userId, action: "permission.denied", outcome: "denied", resourceType: "permission", resourceId: request.params.pluginId, metadata: { permission: "plugins.manage" } });
        return reply.code(403).send({ error: "Plugin management permission required" });
      }
      const pluginId = String(request.params.pluginId ?? "");
      const trusted = getTrustedPluginPackage(pluginId);
      if (!trusted) return reply.code(404).send({ error: "Plugin package not found" });
      if (trusted.system) return reply.code(409).send({ error: "System plugins cannot be uninstalled" });
      const activeKey = tenant.tenantId + ":" + pluginId;
      const activeJob = await installJobs.findOne({ activeKey });
      if (activeJob) {
        if (activeJob.action !== "uninstall") return reply.code(409).send({ error: "A plugin lifecycle operation is already in progress" });
        return reply.code(202).send({ jobId: activeJob.id, pluginId, action: "uninstall", status: activeJob.status, accepted: true, duplicate: true, statusUrl: "/marketplace/install-jobs/" + activeJob.id });
      }
      if (!await isPluginInstalled(db, tenant.tenantId, pluginId)) return reply.code(404).send({ error: "Plugin is not installed" });
      const otherInstalled = await db.collection("tenant_plugin_installations")
        .find({ tenantId: tenant.tenantId, status: "installed", pluginId: { $ne: pluginId } })
        .toArray();
      for (const installed of otherInstalled) {
        const dependent = getTrustedPluginPackage(String(installed.pluginId));
        if (dependent?.dependencies.includes(pluginId)) return reply.code(409).send({ error: "Plugin is required by installed plugin: " + installed.pluginId });
      }
      const queued = await enqueuePluginUninstallJob(installJobs, { tenantId: tenant.tenantId, pluginId, actorId: tenant.userId });
      if (queued.job.action !== "uninstall") return reply.code(409).send({ error: "A plugin lifecycle operation is already in progress" });
      return reply.code(202).send({
        jobId: queued.job.id, pluginId, action: "uninstall", status: queued.job.status,
        accepted: true, duplicate: !queued.created, statusUrl: "/marketplace/install-jobs/" + queued.job.id
      });
    });

    let workerBusy = false;
    const workerId = randomUUID();
    const processInstallJob = async () => {
      if (workerBusy) return;
      workerBusy = true;
      try {
        const job = await claimPluginInstallJob(installJobs, workerId);
        if (!job) return;
        try {
          const tenantRecord = await db.collection("tenants").findOne({ id: job.tenantId, status: "active" });
          if (!tenantRecord) throw new Error("Company is not active");
          const trusted = getTrustedPluginPackage(job.pluginId);
          if (!trusted) throw new Error("Trusted plugin package is unavailable");

          if (job.action === "uninstall") {
            if (trusted.system) throw new Error("System plugins cannot be uninstalled");
            const installation = await db.collection("tenant_plugin_installations").findOne({ tenantId: job.tenantId, pluginId: job.pluginId });
            if (!installation || !["installed", "uninstalling"].includes(String(installation.status))) throw new Error("Plugin is not installed");
            const otherInstalled = await db.collection("tenant_plugin_installations")
              .find({ tenantId: job.tenantId, status: "installed", pluginId: { $ne: job.pluginId } })
              .toArray();
            for (const installed of otherInstalled) {
              const dependent = getTrustedPluginPackage(String(installed.pluginId));
              if (dependent?.dependencies.includes(job.pluginId)) throw new Error("Plugin is required by installed plugin: " + installed.pluginId);
            }
            await db.collection("tenant_plugin_installations").updateOne(
              { tenantId: job.tenantId, pluginId: job.pluginId, status: { $in: ["installed", "uninstalling"] } },
              { $set: { status: "uninstalling", updatedAt: new Date() } }
            );
            await trusted.uninstallTenant?.(db, job.tenantId);
            await db.collection("tenant_plugin_installations").updateOne(
              { tenantId: job.tenantId, pluginId: job.pluginId, status: "uninstalling" },
              { $set: { status: "uninstalled", updatedAt: new Date() }, $unset: { error: "" } }
            );
            const completed = await completePluginInstallJob(installJobs, job, workerId, trusted.version);
            if (completed) await auditMarketplaceEvent({ tenantId: job.tenantId, actorId: job.actorId, action: "plugin.uninstalled", outcome: "success", resourceType: "plugin", resourceId: job.pluginId, metadata: { version: trusted.version, jobId: job.id } });
          } else {
            if (!await hasPluginEntitlement(db, job.tenantId, job.pluginId)) throw new Error("Plugin entitlement is no longer active");
            for (const dependency of trusted.dependencies) {
              if (!await hasPluginEntitlement(db, job.tenantId, dependency) || !await isPluginInstalled(db, job.tenantId, dependency)) {
                throw new Error("Required plugin dependency is not installed: " + dependency);
              }
            }
            const installations = db.collection("tenant_plugin_installations");
            await installations.updateOne(
              { tenantId: job.tenantId, pluginId: job.pluginId },
              { $set: { status: "installing", version: trusted.version, updatedAt: new Date(), error: null }, $setOnInsert: { id: randomUUID(), tenantId: job.tenantId, pluginId: job.pluginId, installedAt: null } },
              { upsert: true }
            );
            await runTenantPluginMigrations(db, job.tenantId, job.pluginId, trusted.migrations ?? []);
            await trusted.installTenant?.(db, job.tenantId);
            await installations.updateOne(
              { tenantId: job.tenantId, pluginId: job.pluginId },
              { $set: { status: "installed", version: trusted.version, installedAt: new Date(), updatedAt: new Date() }, $unset: { error: "" } }
            );
            const completed = await completePluginInstallJob(installJobs, job, workerId, trusted.version);
            if (completed) await auditMarketplaceEvent({ tenantId: job.tenantId, actorId: job.actorId, action: "plugin.installed", outcome: "success", resourceType: "plugin", resourceId: job.pluginId, metadata: { version: trusted.version, jobId: job.id } });
          }
        } catch (error) {
          if (job.action === "install") {
            await db.collection("tenant_plugin_installations").updateOne(
              { tenantId: job.tenantId, pluginId: job.pluginId, status: "installing" },
              { $set: { status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : "Plugin installation failed", updatedAt: new Date() } }
            );
          } else {
            await db.collection("tenant_plugin_installations").updateOne(
              { tenantId: job.tenantId, pluginId: job.pluginId, status: "uninstalling" },
              { $set: { status: "installed", error: error instanceof Error ? error.message.slice(0, 500) : "Plugin uninstallation failed", updatedAt: new Date() } }
            );
          }
          await failPluginInstallJob(installJobs, job, workerId, error);
          ctx.logger.error("Tenant plugin installation job failed", { tenantId: job.tenantId, pluginId: job.pluginId, jobId: job.id, error });
        }
      } catch (error) {
        ctx.logger.error("Plugin install worker failed to claim a job", { error });
      } finally {
        workerBusy = false;
      }
    };
    installWorkerTask = processInstallJob();
    installWorkerTimer = setInterval(() => {
      if (!workerBusy) installWorkerTask = processInstallJob();
    }, 500);

    ctx.logger.info("Marketplace plugin initialized: company catalog is filtered by plan and purchase entitlements.");
  },
  async stop() {
    if (installWorkerTimer) clearInterval(installWorkerTimer);
    installWorkerTimer = undefined;
    await installWorkerTask;
    installWorkerTask = undefined;
    await mongoClient?.close();
    mongoClient = undefined;
  }
};
