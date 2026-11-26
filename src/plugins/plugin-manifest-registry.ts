import type { PluginPlan, PluginPackageDefinition } from "../core/plugin-entitlements.js";
import type { Db } from "mongodb";
import { migrateLegacyConnectedDevicesPlanAssignments } from "./connected-devices/connected-devices-plan-migration.js";

export const BUILT_IN_PLANS: PluginPlan[] = [
  { id: "starter", name: "Starter", includedPluginIds: ["files", "documents"], visiblePluginIds: ["files", "documents"], maxUsers: 5, storageMb: 100 },
  { id: "pro", name: "Pro", includedPluginIds: ["files", "documents"], visiblePluginIds: ["files", "documents"], maxUsers: 25, storageMb: 1024 },
  { id: "enterprise", name: "Enterprise", includedPluginIds: ["files", "documents"], visiblePluginIds: ["files", "documents"], maxUsers: null, storageMb: 10240 }
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
    purchasable: false, system: true, dependencies: ["files"], activationPolicy: "automatic", permissions: [
      { key: "documents.read", module: "documents", resource: "documents", action: "read", label: "View documents", defaultGrants: { owner: true, admin: true, manager: true, member: true } },
      { key: "documents.write", module: "documents", resource: "documents", action: "write", label: "Manage documents", defaultGrants: { owner: true, admin: true, manager: true, member: false } }
    ], codeAvailable: true, status: "published"
  },

];

/** Single source for legacy package migration and permanent retirement policy. */
export const MIGRATABLE_BUILT_IN_PACKAGE_IDS = new Set(["connected-devices", "time-tracking", "documents", "hello-world"]);
export const RETIRED_PACKAGE_POLICIES = [
  { id: "hello-world", retireSignedZip: false },
  { id: "time-tracking", retireSignedZip: false },
  { id: "notes", retireSignedZip: true },
  { id: "connected-devices", retireSignedZip: false }
] as const;

/** One-time package migrations that restore legacy plan-package assignments. */
export const LEGACY_PLUGIN_PLAN_ASSIGNMENT_MIGRATIONS: readonly Array<{
  pluginId: string;
  run: (db: Db) => Promise<void>;
}> = [
  { pluginId: "connected-devices", run: migrateLegacyConnectedDevicesPlanAssignments }
];
