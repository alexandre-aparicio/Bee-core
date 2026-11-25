import type { Db, Document } from "mongodb";

export type PlatformPluginPackageStatus = "available" | "installed" | "failed" | "deprecated";
export type PlatformPluginPackageSource = "bundled" | "zip";

export type PlatformPluginPackage = Document & {
  pluginId: string;
  name: string;
  version: string;
  description: string;
  category: string;
  dependencies: string[];
  status: PlatformPluginPackageStatus;
  source: PlatformPluginPackageSource;
  installedAt: Date | null;
  installedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  activationPolicy?: "automatic" | "manual";
  runtimeState?: "stored_pending_runtime" | "loaded" | "failed";
  publisher?: string;
  digest?: string;
  packageDirectory?: string;
  backendEntrypoint?: string;
  frontendRoutes?: Array<{ path: string; component: string }>;
};

/**
 * Platform package state is deliberately separate from tenant_plugin_installations.
 * A platform package is installed once; tenant rows only represent entitlement,
 * tenant migrations and enabled/disabled state.
 */
export async function ensurePlatformPluginRegistry(db: Db): Promise<void> {
  const packages = db.collection<PlatformPluginPackage>("platform_plugin_packages");
  await Promise.all([
    db.collection("platform_plugin_package_versions").createIndex({ pluginId: 1, version: 1 }, { unique: true, name: "platform_plugin_package_version_unique" }),
    packages.createIndex({ pluginId: 1 }, { unique: true, name: "platform_plugin_package_id_unique" }),
    packages.createIndex({ status: 1, updatedAt: -1 }, { name: "platform_plugin_package_status_updated" }),
    packages.createIndex({ source: 1, pluginId: 1 }, { name: "platform_plugin_package_source_id" })
  ]);
}

export async function seedBundledPlatformPackages(
  db: Db,
  definitions: ReadonlyArray<{
    id: string;
    name: string;
    version: string;
    description: string;
    category: string;
    dependencies: string[];
    activationPolicy?: "automatic" | "manual";
  }>
): Promise<void> {
  const packages = db.collection<PlatformPluginPackage>("platform_plugin_packages");
  const now = new Date();
  for (const definition of definitions) {
    const existing = await packages.findOne({ pluginId: definition.id });
    if (existing?.source === "zip" || existing?.status === "deprecated") continue;
    await packages.updateOne(
      { pluginId: definition.id },
      {
        $set: {
          name: definition.name,
          version: definition.version,
          description: definition.description,
          category: definition.category,
          dependencies: definition.dependencies,
          ...(definition.activationPolicy ? { activationPolicy: definition.activationPolicy } : {}),
          updatedAt: now
        },
        $setOnInsert: {
          pluginId: definition.id,
          status: "available",
          source: "bundled",
          installedAt: null,
          installedBy: null,
          createdAt: now
        }
      },
      { upsert: true }
    );
  }
}

/** One-time compatibility bridge for platform packages installed before the registry existed. */
export async function migrateLegacyPlatformPackageInstalls(db: Db, superOrganizationId: string): Promise<number> {
  const legacy = await db.collection("tenant_plugin_installations")
    .find({ tenantId: superOrganizationId, status: "installed" })
    .project<{ pluginId: string; version?: string }>({ pluginId: 1, version: 1, _id: 0 })
    .toArray();
  const packages = db.collection<PlatformPluginPackage>("platform_plugin_packages");
  let migrated = 0;
  for (const installation of legacy) {
    if (!installation.pluginId) continue;
    const existing = await packages.findOne({ pluginId: installation.pluginId });
    if (existing?.source === "zip" || existing?.status === "deprecated") continue;
    if (existing?.status === "installed" && (!installation.version || existing.version === installation.version)) continue;
    const now = new Date();
    const result = await packages.updateOne(
      { pluginId: installation.pluginId },
      {
        $set: {
          status: "installed",
          ...(installation.version ? { version: installation.version } : {}),
          source: "bundled",
          ...(!existing?.installedAt ? { installedAt: now } : {}),
          updatedAt: now
        },
        $setOnInsert: {
          pluginId: installation.pluginId,
          name: installation.pluginId,
          description: "",
          category: "custom",
          dependencies: [],
          installedBy: null,
          createdAt: now
        }
      },
      { upsert: true }
    );
    if (result.upsertedCount || result.modifiedCount) migrated += 1;
  }
  return migrated;
}

export async function setPlatformPackageInstalled(
  db: Db,
  pluginId: string,
  version: string,
  actorId: string | null
): Promise<void> {
  const packages = db.collection<PlatformPluginPackage>("platform_plugin_packages");
  const existing = await packages.findOne({ pluginId });
  if (existing?.source === "zip") return;
  const now = new Date();
  await packages.updateOne(
    { pluginId },
    {
      $set: { status: "installed", version, source: "bundled", installedAt: now, installedBy: actorId, updatedAt: now },
      $setOnInsert: {
        pluginId,
        name: pluginId,
        description: "",
        category: "custom",
        dependencies: [],
        createdAt: now
      }
    },
    { upsert: true }
  );
}

export async function setPlatformPackageAvailable(db: Db, pluginId: string): Promise<void> {
  const packages = db.collection<PlatformPluginPackage>("platform_plugin_packages");
  const existing = await packages.findOne({ pluginId });
  if (existing?.source === "zip") return;
  await packages.updateOne(
    { pluginId },
    { $set: { status: "available", installedAt: null, installedBy: null, updatedAt: new Date() } }
  );
}

/**
 * Retire the legacy bundled Hello World record without deleting tenant history.
 * A later signed ZIP upload can replace this platform registry entry.
 */
export async function retireBundledPlatformPackage(db: Db, pluginId: string): Promise<void> {
  const packages = db.collection<PlatformPluginPackage>("platform_plugin_packages");
  const existing = await packages.findOne({ pluginId });
  // Never hide a package that has already been replaced by its signed ZIP.
  if (existing?.source === "zip") return;

  const now = new Date();
  await packages.updateOne(
    { pluginId, source: "bundled" },
    { $set: { status: "deprecated", installedAt: null, installedBy: null, updatedAt: now } }
  );
  await db.collection("plugin_catalog").updateOne(
    { id: pluginId },
    { $set: { status: "deprecated", codeAvailable: false, updatedAt: now } }
  );
}

export async function listPlatformPluginPackages(db: Db): Promise<PlatformPluginPackage[]> {
  return db.collection<PlatformPluginPackage>("platform_plugin_packages")
    .find({ status: { $ne: "deprecated" } }, { projection: { _id: 0 } })
    .sort({ name: 1, pluginId: 1 })
    .toArray();
}
