import type { Db, Document } from "mongodb";
import { randomUUID } from "node:crypto";
import { TenantCollection } from "./tenant-collection.js";
import type { TenantPluginMigration } from "./plugin-migrations.js";
import { hasTenantPermission, type TenantContext } from "./tenant-context.js";

export type PluginPlan = Document & {
  id: string;
  name: string;
  includedPluginIds: string[];
  visiblePluginIds: string[];
  maxUsers: number | null;
  storageMb: number;
};

export type PluginPackageDefinition = Document & {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  visibleInPlans: string[];
  includedInPlans: string[];
  purchasable: boolean;
  system: boolean;
  dependencies: string[];
  migrations?: TenantPluginMigration[];
  codeAvailable: true;
  status: "published" | "draft" | "deprecated";
  installTenant?: (db: Db, tenantId: string) => Promise<void>;
  updateTenant?: (db: Db, tenantId: string, previousVersion: string) => Promise<void>;
  uninstallTenant?: (db: Db, tenantId: string) => Promise<void>;
};

export type TenantSubscription = Document & {
  id: string;
  tenantId: string;
  planId: string;
  status: "trial" | "active" | "past_due" | "cancelled";
  startedAt: Date;
  currentPeriodEnd: Date | null;
  updatedAt: Date;
};

export type TenantPluginInstallation = Document & {
  id: string;
  tenantId: string;
  pluginId: string;
  version: string;
  status: "installing" | "installed" | "updating" | "uninstalling" | "failed" | "uninstalled";
  installedAt: Date | null;
  updatedAt: Date;
  error?: string;
  enabled?: boolean;
  enabledUpdatedAt?: Date;
  enabledUpdatedBy?: string;
};

type TenantPluginPurchase = Document & {
  id: string;
  tenantId: string;
  pluginId: string;
  providerReference: string;
  status: "active" | "revoked" | "expired";
  purchasedAt: Date;
  expiresAt: Date | null;
};

export const BUILT_IN_PLANS: PluginPlan[] = [
  { id: "starter", name: "Starter", includedPluginIds: ["files", "documents", "hello-world", "connected-devices"], visiblePluginIds: ["files", "documents", "notes", "hello-world", "connected-devices"], maxUsers: 5, storageMb: 100 },
  { id: "pro", name: "Pro", includedPluginIds: ["files", "documents", "notes", "hello-world", "connected-devices", "time-tracking"], visiblePluginIds: ["files", "documents", "notes", "hello-world", "connected-devices", "time-tracking"], maxUsers: 25, storageMb: 1024 },
  { id: "enterprise", name: "Enterprise", includedPluginIds: ["files", "documents", "notes", "hello-world", "connected-devices"], visiblePluginIds: ["files", "documents", "notes", "hello-world", "connected-devices"], maxUsers: null, storageMb: 10240 }
];

export const TRUSTED_PLUGIN_PACKAGES: PluginPackageDefinition[] = [
  {
    id: "files",
    name: "Private Files",
    version: "0.1.0",
    description: "Private company file and image storage",
    category: "platform",
    visibleInPlans: ["starter", "pro", "enterprise"],
    includedInPlans: ["starter", "pro", "enterprise"],
    purchasable: false,
    system: true,
    dependencies: [],
    codeAvailable: true,
    status: "published"
  },
  {
    id: "documents", name: "Documents", version: "0.1.0",
    description: "Shared document library with folder-level team access and controlled public delivery",
    category: "platform", visibleInPlans: ["starter", "pro", "enterprise"], includedInPlans: ["starter", "pro", "enterprise"],
    purchasable: false, system: true, dependencies: ["files"], codeAvailable: true, status: "published"
  },
  {
    id: "connected-devices", name: "Connected Devices", version: "0.1.0",
    description: "Secure tenant-scoped device pairing, capability grants and revocation",
    category: "platform", visibleInPlans: ["starter", "pro", "enterprise"],
    includedInPlans: ["starter", "pro", "enterprise"], purchasable: false, system: false,
    dependencies: [], codeAvailable: true, status: "published"
  },
  {
    id: "notes",
    name: "Team Notes",
    version: "0.1.0",
    description: "Company-scoped notes with role-based access",
    category: "productivity",
    visibleInPlans: ["pro", "enterprise"],
    includedInPlans: ["pro", "enterprise"],
    purchasable: true,
    system: false,
    dependencies: [],
    codeAvailable: true,
    status: "published",
    migrations: [{
      id: "001_create_tenant_notes_indexes",
      checksum: "59292026541b47ed1e52ec773fed06e3f1e5324621b8237da85f6da59de083e2",
      up: async db => {
        await db.collection("tenant_notes").createIndex({ tenantId: 1, id: 1 }, { unique: true, name: "tenant_notes_company_id_unique" });
        await db.collection("tenant_notes").createIndex({ tenantId: 1, updatedAt: -1 }, { name: "tenant_notes_company_updated" });
      },
      down: async db => {
        for (const name of ["tenant_notes_company_id_unique", "tenant_notes_company_updated"]) {
          try { await db.collection("tenant_notes").dropIndex(name); }
          catch (error) { if (![26, 27].includes((error as { code?: number }).code ?? 0)) throw error; }
        }
      }
    }]
  },
  {
    id: "time-tracking",
    name: "Control Horario",
    version: "0.1.0",
    description: "Tenant-scoped employee time clock, breaks and work-session history",
    category: "productivity",
    visibleInPlans: ["pro", "enterprise"],
    includedInPlans: ["pro", "enterprise"],
    purchasable: true,
    system: false,
    dependencies: [],
    codeAvailable: true,
    status: "published",
    migrations: [{
      id: "001_create_time_tracking_indexes",
      checksum: "bee-time-tracking-phase-1-001",
      up: async db => {
        await db.collection("tenant_time_tracking_sessions").createIndex({ tenantId: 1, id: 1 }, { unique: true, name: "time_tracking_tenant_session_unique" });
        await db.collection("tenant_time_tracking_sessions").createIndex({ tenantId: 1, userId: 1, startedAt: -1 }, { name: "time_tracking_user_history" });
        await db.collection("tenant_time_tracking_sessions").createIndex({ tenantId: 1, userId: 1 }, { unique: true, partialFilterExpression: { active: true }, name: "time_tracking_one_active_session" });
      },
      down: async db => {
        for (const name of ["time_tracking_tenant_session_unique", "time_tracking_user_history", "time_tracking_one_active_session"]) {
          try { await db.collection("tenant_time_tracking_sessions").dropIndex(name); }
          catch (error) { if (![26, 27].includes((error as { code?: number }).code ?? 0)) throw error; }
        }
      }
    }]
  },
  {
    id: "hello-world",
    name: "Hola Mundo",
    version: "0.1.0",
    description: "Añade una página pública Hola Mundo al sitio del tenant",
    category: "website",
    visibleInPlans: ["starter", "pro", "enterprise"],
    includedInPlans: ["starter", "pro", "enterprise"],
    purchasable: false,
    system: false,
    dependencies: [],
    codeAvailable: true,
    status: "published"
  }
];


/**
 * Resolve a plugin and all of its transitive dependencies in dependency-first
 * order. Missing packages and cycles fail closed before a lifecycle operation.
 */
export function resolvePluginDependencyOrder(
  pluginId: string,
  definitions: readonly Pick<PluginPackageDefinition, "id" | "dependencies">[] = TRUSTED_PLUGIN_PACKAGES
): string[] {
  const byId = new Map(definitions.map(item => [item.id, item]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: string[] = [];

  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error("Plugin dependency cycle detected at: " + id);
    if (visited.has(id)) return;
    const definition = byId.get(id);
    if (!definition) throw new Error("Missing trusted plugin dependency: " + id);
    visiting.add(id);
    for (const dependency of definition.dependencies) visit(dependency);
    visiting.delete(id);
    visited.add(id);
    if (id !== pluginId) ordered.push(id);
  };

  visit(pluginId);
  return ordered;
}

const packagesById = new Map(TRUSTED_PLUGIN_PACKAGES.map(item => [item.id, item]));
const plansById = new Map(BUILT_IN_PLANS.map(item => [item.id, item]));

export async function seedPluginCommerce(db: Db): Promise<void> {
  const plans = db.collection<PluginPlan>("plugin_plans");
  const catalog = db.collection<PluginPackageDefinition>("plugin_catalog");
  const versions = db.collection<Document & { pluginId: string; version: string; status: string }>("plugin_versions");
  await Promise.all([
    catalog.createIndex({ id: 1 }, { unique: true, name: "plugin_catalog_id_unique" }),
    versions.createIndex({ pluginId: 1, version: 1 }, { unique: true, name: "plugin_versions_id_version_unique" }),
    db.collection("tenant_subscriptions").createIndex({ tenantId: 1 }, { unique: true, name: "tenant_subscription_unique" }),
    db.collection("tenant_plugin_installations").createIndex({ tenantId: 1, pluginId: 1 }, { unique: true, name: "tenant_plugin_installation_unique" }),
    db.collection("plugin_purchases").createIndex({ tenantId: 1, providerReference: 1 }, { unique: true, name: "tenant_plugin_purchase_reference_unique" })
  ]);
  for (const plan of BUILT_IN_PLANS) {
    await plans.updateOne({ id: plan.id }, { $set: plan }, { upsert: true });
  }
  for (const plugin of TRUSTED_PLUGIN_PACKAGES) {
    const { installTenant: _installTenant, uninstallTenant: _uninstallTenant, migrations: _migrations, ...metadata } = plugin;
    const now = new Date();
    await catalog.updateOne(
      { id: plugin.id },
      { $set: metadata, $setOnInsert: { createdAt: now } },
      { upsert: true }
    );
    await versions.updateOne(
      { pluginId: plugin.id, version: plugin.version },
      { $setOnInsert: { pluginId: plugin.id, version: plugin.version, status: "published", compatibility: { minRuntimeVersion: "0.3.0" }, dependencies: plugin.dependencies, publishedAt: now } },
      { upsert: true }
    );
  }
}

export async function getTenantSubscription(db: Db, tenantId: string): Promise<TenantSubscription> {
  const subscriptions = new TenantCollection<TenantSubscription>(db.collection<TenantSubscription>("tenant_subscriptions"), tenantId);
  let subscription = await subscriptions.findOne({});
  if (!subscription) {
    const now = new Date();
    try {
      await subscriptions.insertOne({
        id: randomUUID(),
        planId: "starter",
        status: "trial",
        startedAt: now,
        currentPeriodEnd: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
        updatedAt: now
      });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
    subscription = await subscriptions.findOne({});
  }
  if (!subscription) throw new Error("Could not initialize tenant subscription");

  const installations = new TenantCollection<TenantPluginInstallation>(
    db.collection<TenantPluginInstallation>("tenant_plugin_installations"),
    tenantId
  );
  const filesInstalled = await installations.findOne({ pluginId: "files", status: "installed" });
  if (!filesInstalled) {
    const now = new Date();
    try {
      await installations.insertOne({
        id: randomUUID(),
        pluginId: "files",
        version: packagesById.get("files")!.version,
        status: "installed",
        installedAt: now,
        updatedAt: now
      });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
  }
  const documentsInstalled = await installations.findOne({ pluginId: "documents", status: "installed" });
  if (!documentsInstalled) {
    const now = new Date();
    try { await installations.insertOne({ id: randomUUID(), pluginId: "documents", version: packagesById.get("documents")!.version, status: "installed", installedAt: now, updatedAt: now }); }
    catch (error) { if ((error as { code?: number }).code !== 11000) throw error; }
  }
  return subscription;
}

export async function getEffectiveTenantPlan(db: Db, tenantId: string): Promise<PluginPlan> {
  const subscription = await getTenantSubscription(db, tenantId);
  const active = (subscription.status === "active" || subscription.status === "trial") &&
    (!subscription.currentPeriodEnd || subscription.currentPeriodEnd > new Date());
  if (active) {
    const plan = await db.collection<PluginPlan>("plugin_plans").findOne({ id: subscription.planId });
    if (plan) return plan;
  }
  return BUILT_IN_PLANS[0]!;
}

export async function getTenantStorageLimitBytes(db: Db, tenantId: string): Promise<number> {
  const plan = await getEffectiveTenantPlan(db, tenantId);
  return plan.storageMb * 1024 * 1024;
}

export async function getTenantUserLimit(db: Db, tenantId: string): Promise<number | null> {
  const plan = await getEffectiveTenantPlan(db, tenantId);
  return plan.maxUsers;
}

export async function getTenantPluginCatalog(db: Db, tenantId: string) {
  const effectivePlan = await getEffectiveTenantPlan(db, tenantId);
  const purchases = new TenantCollection<TenantPluginPurchase>(db.collection<TenantPluginPurchase>("plugin_purchases"), tenantId);
  const activePurchases = await purchases.find({
    status: "active",
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }]
  }).toArray();
  const purchasedIds = new Set(activePurchases.map(purchase => purchase.pluginId));
  const installations = new TenantCollection<TenantPluginInstallation>(
    db.collection<TenantPluginInstallation>("tenant_plugin_installations"),
    tenantId
  );
  const installed = await installations.find({ status: { $in: ["installed", "updating", "uninstalling"] } }).toArray();
  const installedIds = new Set(installed.map(item => item.pluginId));
  const installedVersions = new Map(installed.map(item => [item.pluginId, item.version]));
  const enabledByPlugin = new Map(installed.map(item => [item.pluginId, item.enabled !== false]));

  const visibleIds = [...new Set([...effectivePlan.visiblePluginIds, ...purchasedIds])];
  const catalog = await db.collection<PluginPackageDefinition>("plugin_catalog")
    .find({ id: { $in: visibleIds }, status: "published" })
    .sort({ name: 1 })
    .toArray();
  return catalog
    .filter(plugin => packagesById.has(plugin.id))
    .map(plugin => ({
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      category: plugin.category,
      purchasable: plugin.purchasable,
      system: plugin.system,
      entitled: effectivePlan.includedPluginIds.includes(plugin.id) || purchasedIds.has(plugin.id),
      accessSource: effectivePlan.includedPluginIds.includes(plugin.id) ? "plan" : purchasedIds.has(plugin.id) ? "purchase" : null,
      installed: installedIds.has(plugin.id),
      enabled: installedIds.has(plugin.id) && (enabledByPlugin.get(plugin.id) ?? true),
      installedVersion: installedVersions.get(plugin.id) ?? null
    }));
}

export async function hasPluginEntitlement(db: Db, tenantId: string, pluginId: string): Promise<boolean> {
  const catalog = await getTenantPluginCatalog(db, tenantId);
  return catalog.some(plugin => plugin.id === pluginId && plugin.entitled);
}

export async function isPluginInstalled(db: Db, tenantId: string, pluginId: string): Promise<boolean> {
  const installations = new TenantCollection<TenantPluginInstallation>(
    db.collection<TenantPluginInstallation>("tenant_plugin_installations"),
    tenantId
  );
  const installation = await installations.findOne({ pluginId, status: "installed" });
  return Boolean(installation);
}

export async function isPluginEnabled(db: Db, tenantId: string, pluginId: string): Promise<boolean> {
  const installations = new TenantCollection<TenantPluginInstallation>(db.collection<TenantPluginInstallation>("tenant_plugin_installations"), tenantId);
  const installation = await installations.findOne({ pluginId, status: "installed" });
  return Boolean(installation && installation.enabled !== false);
}

export function requireInstalledPlugin(db: Db, pluginId: string) {
  return async (request: any, reply: any) => {
    const context = request.tenantContext as TenantContext | undefined;
    if (!context || !hasTenantPermission(context, pluginId + ".read")) {
      return reply.code(403).send({ error: "Plugin permission required" });
    }
    if (!await hasPluginEntitlement(db, context.tenantId, pluginId) || !await isPluginInstalled(db, context.tenantId, pluginId) || !await isPluginEnabled(db, context.tenantId, pluginId)) {
      return reply.code(403).send({ error: "Plugin is not entitled, installed or enabled for this company" });
    }
  };
}

export function getTrustedPluginPackage(pluginId: string): PluginPackageDefinition | undefined {
  return packagesById.get(pluginId);
}

export function getBuiltInPlan(planId: string): PluginPlan | undefined {
  return plansById.get(planId);
}
