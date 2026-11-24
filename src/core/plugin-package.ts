export type BeePluginDependency = {
  pluginId: string;
  versionRange: string;
  optional?: boolean;
};

export type BeePluginPermission = {
  key: string;
  description: string;
};

export type BeePluginMigration = {
  id: string;
  checksum: string;
  phase: "install" | "upgrade" | "uninstall";
};

export interface BeeBusinessPluginManifest {
  id: string;
  name: string;
  version: string;
  publisher: string;
  description: string;
  category: string;
  /** Default tenant activation behavior when a subscription grants this package. */
  activationPolicy?: "automatic" | "manual";
  compatibility: {
    minRuntimeVersion: string;
    maxRuntimeVersion?: string;
  };
  dependencies: BeePluginDependency[];
  permissions: BeePluginPermission[];
  backend: { entrypoint: string };
  frontend: { routes: Array<{ path: string; component: string }> };
  collections: string[];
  migrations: BeePluginMigration[];
  settingsSchema: Record<string, unknown>;
  package: {
    sha256: string;
    signature: string;
    storageKey: string;
  };
}

const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const pluginId = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const permissionKey = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*)+$/;
const collectionName = /^[a-z][a-z0-9_]*$/;
const sha256 = /^[a-f0-9]{64}$/i;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate a package manifest before it enters the central plugin registry. */
export function validatePluginManifest(value: unknown): asserts value is BeeBusinessPluginManifest {
  if (!record(value)) throw new Error("Plugin manifest must be an object");
  const item = value as Record<string, any>;
  if (typeof item.id !== "string" || !pluginId.test(item.id)) throw new Error("Invalid plugin id");
  if (typeof item.name !== "string" || !item.name.trim()) throw new Error("Plugin name is required");
  if (typeof item.version !== "string" || !semver.test(item.version)) throw new Error("Plugin version must be semantic versioning");
  if (typeof item.publisher !== "string" || !item.publisher.trim()) throw new Error("Plugin publisher is required");
  if (typeof item.description !== "string" || !item.description.trim()) throw new Error("Plugin description is required");
  if (typeof item.category !== "string" || !item.category.trim()) throw new Error("Plugin category is required");
  if (item.activationPolicy !== undefined && !["automatic", "manual"].includes(item.activationPolicy)) throw new Error("Invalid plugin activation policy");
  if (!record(item.compatibility) || typeof item.compatibility.minRuntimeVersion !== "string" || !semver.test(item.compatibility.minRuntimeVersion)) throw new Error("Invalid runtime compatibility");
  if (item.compatibility.maxRuntimeVersion !== undefined && (typeof item.compatibility.maxRuntimeVersion !== "string" || !semver.test(item.compatibility.maxRuntimeVersion))) throw new Error("Invalid maximum runtime version");
  const versionRange = /^(?:\*|(?:\^|~|>=|<=|>|<)?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(?:\s+\|\|\s+(?:\^|~|>=|<=|>|<)?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)*$/;
  if (!Array.isArray(item.dependencies) || item.dependencies.some((dependency: any) => !record(dependency) || typeof dependency.pluginId !== "string" || !pluginId.test(dependency.pluginId) || typeof dependency.versionRange !== "string" || !versionRange.test(dependency.versionRange.trim()))) throw new Error("Invalid plugin dependencies");
  if (new Set(item.dependencies.map((dependency: any) => dependency.pluginId)).size !== item.dependencies.length) throw new Error("Plugin dependencies must be unique");
  if (!Array.isArray(item.permissions) || item.permissions.some((permission: any) => !record(permission) || typeof permission.key !== "string" || !permissionKey.test(permission.key) || typeof permission.description !== "string" || !permission.description.trim())) throw new Error("Invalid plugin permissions");
  if (new Set(item.permissions.map((permission: any) => permission.key)).size !== item.permissions.length) throw new Error("Plugin permissions must be unique");
  if (!record(item.backend) || typeof item.backend.entrypoint !== "string" || !item.backend.entrypoint.startsWith("dist/") || item.backend.entrypoint.includes("..") || item.backend.entrypoint.includes("\\") || item.backend.entrypoint.startsWith("/")) throw new Error("Backend entrypoint must be a safe path under dist/");
  if (!item.backend.entrypoint.endsWith(".mjs")) throw new Error("Backend entrypoint must be an ES module (.mjs)");
  if (!record(item.frontend) || !Array.isArray(item.frontend.routes) || item.frontend.routes.some((route: any) => !record(route) || typeof route.path !== "string" || !route.path.startsWith("/") || route.path.startsWith("//") || route.path.includes("..") || route.path.includes("?") || route.path.includes("#") || typeof route.component !== "string" || !pluginId.test(route.component))) throw new Error("Invalid frontend route registrations");
  if (new Set(item.frontend.routes.map((route: any) => route.path)).size !== item.frontend.routes.length) throw new Error("Frontend route paths must be unique");
  if (!Array.isArray(item.collections) || item.collections.some((name: unknown) => typeof name !== "string" || !collectionName.test(name))) throw new Error("Invalid tenant collection names");
  if (new Set(item.collections).size !== item.collections.length) throw new Error("Plugin collection names must be unique");
  if (!Array.isArray(item.migrations) || item.migrations.some((migration: any) => !record(migration) || typeof migration.id !== "string" || !migration.id.trim() || typeof migration.checksum !== "string" || !sha256.test(migration.checksum) || typeof migration.phase !== "string" || !["install", "upgrade", "uninstall"].includes(migration.phase))) throw new Error("Invalid plugin migrations");
  if (new Set(item.migrations.map((migration: any) => migration.id)).size !== item.migrations.length) throw new Error("Plugin migration IDs must be unique");
  if (!record(item.settingsSchema)) throw new Error("Plugin settings schema must be an object");
  if (!record(item.package) || typeof item.package.sha256 !== "string" || !sha256.test(item.package.sha256) || typeof item.package.signature !== "string" || !item.package.signature.trim() || typeof item.package.storageKey !== "string" || !item.package.storageKey.trim() || item.package.storageKey.startsWith("/") || item.package.storageKey.includes("..")) throw new Error("Invalid package digest, signature or storage key");
}
