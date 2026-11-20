import type { BeePlugin } from "../../core/types.js";
import { MongoClient } from "mongodb";
import { randomUUID } from "node:crypto";
import { resolveTenantContext, hasTenantPermission } from "../../core/tenant-context.js";
import {
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
    await seedPluginCommerce(db);

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
      const trusted = getTrustedPluginPackage(plugin.id);
      if (!trusted) return reply.code(404).send({ error: "Plugin package not found" });
      return { pluginId: plugin.id, versions: [{ version: trusted.version, dependencies: trusted.dependencies, published: true }] };
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
      await installations.updateOne(
        { tenantId: tenant.tenantId, pluginId },
        { $set: { status: "installing", updatedAt: now, error: null }, $setOnInsert: { id: randomUUID(), tenantId: tenant.tenantId, pluginId, version: trusted.version, installedAt: null } },
        { upsert: true }
      );
      try {
        await trusted.installTenant?.(db, tenant.tenantId);
        await installations.updateOne({ tenantId: tenant.tenantId, pluginId }, { $set: { status: "installed", version: trusted.version, installedAt: new Date(), updatedAt: new Date() }, $unset: { error: "" } });
        return { pluginId, status: "installed", version: trusted.version };
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
      await trusted.uninstallTenant?.(db, tenant.tenantId);
      await db.collection("tenant_plugin_installations").updateOne(
        { tenantId: tenant.tenantId, pluginId },
        { $set: { status: "uninstalled", updatedAt: new Date() } }
      );
      return { pluginId, status: "uninstalled", dataPreserved: true };
    });

    ctx.logger.info("Marketplace plugin initialized: company catalog is filtered by plan and purchase entitlements.");
  },
  async stop() {
    await mongoClient?.close();
    mongoClient = undefined;
  }
};
