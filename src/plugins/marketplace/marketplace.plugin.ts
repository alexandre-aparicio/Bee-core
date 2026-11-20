import type { BeePlugin } from "../../core/types.js";
import { MongoClient, type Document } from "mongodb";
import { resolveTenantContext, hasTenantPermission } from "../../core/tenant-context.js";

type CatalogPlugin = Document & {
  id: string;
  name: string;
  description: string;
  category: string;
  publisher: string;
  visibility: "public" | "private";
  status: "draft" | "published" | "deprecated";
  latestVersion: string;
  createdAt: Date;
  updatedAt: Date;
};

type TenantEntitlement = Document & {
  tenantId: string;
  pluginId: string;
  source: "plan" | "subscription" | "purchase" | "trial";
  status: "active" | "suspended" | "expired" | "revoked";
  validFrom?: Date;
  validUntil?: Date | null;
};

let mongoClient: MongoClient | undefined;

export const marketplacePlugin: BeePlugin = {
  manifest: {
    name: "marketplace",
    version: "0.1.0",
    description: "Central business plugin catalog with tenant entitlement filtering",
    dependencies: ["auth", "organizations"]
  },
  async initialize(ctx) {
    mongoClient = new MongoClient(String(ctx.config.mongoUri ?? ""), { maxPoolSize: 10, serverSelectionTimeoutMS: 10000 });
    await mongoClient.connect();
    const db = mongoClient.db(String(ctx.config.mongoDbName ?? "bee_core"));
    const catalog = db.collection<CatalogPlugin>("plugin_catalog");
    const versions = db.collection<Document & { pluginId: string; version: string; status: string }>("plugin_versions");
    const entitlements = db.collection<TenantEntitlement>("tenant_entitlements");

    await Promise.all([
      catalog.createIndex({ id: 1 }, { unique: true, name: "plugin_catalog_id_unique" }),
      catalog.createIndex({ status: 1, visibility: 1, category: 1 }, { name: "plugin_catalog_discovery" }),
      versions.createIndex({ pluginId: 1, version: 1 }, { unique: true, name: "plugin_versions_id_version_unique" }),
      entitlements.createIndex({ tenantId: 1, pluginId: 1, status: 1 }, { name: "tenant_entitlements_lookup" })
    ]);

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

    const activeEntitlements = async (tenantId: string) => {
      const now = new Date();
      const records = await entitlements.find({ tenantId, status: "active" }).toArray();
      return records.filter(record =>
        (!record.validFrom || record.validFrom <= now) &&
        (!record.validUntil || record.validUntil > now)
      );
    };

    ctx.server.get("/marketplace/entitlements", async (request: any, reply: any) => {
      const tenant = await authenticate(request, reply);
      if (!tenant) return;
      const records = await activeEntitlements(tenant.tenantId);
      return {
        tenantId: tenant.tenantId,
        entitlements: records.map(record => ({
          pluginId: record.pluginId,
          source: record.source,
          validFrom: record.validFrom ?? null,
          validUntil: record.validUntil ?? null
        }))
      };
    });

    ctx.server.get("/marketplace/plugins", async (request: any, reply: any) => {
      const tenant = await authenticate(request, reply);
      if (!tenant) return;
      const records = await activeEntitlements(tenant.tenantId);
      const ids = [...new Set(records.map(record => record.pluginId))];
      if (!ids.length) return { tenantId: tenant.tenantId, plugins: [] };
      const available = await catalog.find({ id: { $in: ids }, status: "published" }).sort({ name: 1 }).toArray();
      const entitlementByPlugin = new Map<string, TenantEntitlement[]>();
      for (const record of records) {
        const current = entitlementByPlugin.get(record.pluginId) ?? [];
        current.push(record);
        entitlementByPlugin.set(record.pluginId, current);
      }
      return {
        tenantId: tenant.tenantId,
        plugins: available.map(plugin => ({
          id: plugin.id,
          name: plugin.name,
          description: plugin.description,
          category: plugin.category,
          publisher: plugin.publisher,
          latestVersion: plugin.latestVersion,
          entitlementSources: [...new Set((entitlementByPlugin.get(plugin.id) ?? []).map(record => record.source))]
        }))
      };
    });

    ctx.server.get<{ Params: { pluginId: string } }>("/marketplace/plugins/:pluginId", async (request: any, reply: any) => {
      const tenant = await authenticate(request, reply);
      if (!tenant) return;
      const pluginId = String(request.params.pluginId ?? "");
      const [entitlement, plugin] = await Promise.all([
        activeEntitlements(tenant.tenantId).then(records => records.some(record => record.pluginId === pluginId)),
        catalog.findOne({ id: pluginId, status: "published" })
      ]);
      if (!entitlement || !plugin) return reply.code(404).send({ error: "Plugin not available for this company" });
      return {
        plugin: {
          id: plugin.id,
          name: plugin.name,
          description: plugin.description,
          category: plugin.category,
          publisher: plugin.publisher,
          latestVersion: plugin.latestVersion
        }
      };
    });

    ctx.server.get<{ Params: { pluginId: string } }>("/marketplace/plugins/:pluginId/versions", async (request: any, reply: any) => {
      const tenant = await authenticate(request, reply);
      if (!tenant) return;
      const pluginId = String(request.params.pluginId ?? "");
      const records = await activeEntitlements(tenant.tenantId);
      if (!records.some(record => record.pluginId === pluginId)) return reply.code(404).send({ error: "Plugin not available for this company" });
      const plugin = await catalog.findOne({ id: pluginId, status: "published" });
      if (!plugin) return reply.code(404).send({ error: "Plugin not found" });
      const publishedVersions = await versions.find({ pluginId, status: "published" }).sort({ publishedAt: -1 }).toArray();
      return {
        pluginId,
        versions: publishedVersions.map(item => ({
          version: item.version,
          compatibility: item.compatibility,
          dependencies: item.dependencies ?? [],
          publishedAt: item.publishedAt ?? null,
          changelog: item.changelog ?? ""
        }))
      };
    });

    ctx.logger.info("Marketplace plugin initialized: catalog visibility is filtered by active company entitlements.");
  },
  async stop() {
    await mongoClient?.close();
    mongoClient = undefined;
  }
};
