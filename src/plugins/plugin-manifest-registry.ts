import type { PluginPlan, PluginPackageDefinition } from "../core/plugin-entitlements.js";
import type { Db } from "mongodb";
import { migrateLegacyConnectedDevicesPlanAssignments, recordLegacyConnectedDevicesPlanRemovals } from "./connected-devices/connected-devices-plan-migration.js";
import { PLUGIN_MANIFEST as CONNECTED_DEVICES_MANIFEST } from "./connected-devices/plugin.manifest.js";
import { PLUGIN_MANIFEST as DOCUMENTS_MANIFEST } from "./documents/plugin.manifest.js";
import { PLUGIN_MANIFEST as TIME_TRACKING_MANIFEST } from "./time-tracking/plugin.manifest.js";

/** Per-plugin manifests are owned by their plugin folders and composed here for platform consumers. */
export const PLUGIN_MANIFESTS = {
  "connected-devices": CONNECTED_DEVICES_MANIFEST,
  documents: DOCUMENTS_MANIFEST,
  "time-tracking": TIME_TRACKING_MANIFEST
};

export const BUILT_IN_PLANS: PluginPlan[] = [
  { id: "starter", name: "Starter", includedPluginIds: ["files"], visiblePluginIds: ["files"], maxUsers: 5, storageMb: 100 },
  { id: "pro", name: "Pro", includedPluginIds: ["files"], visiblePluginIds: ["files"], maxUsers: 25, storageMb: 1024 },
  { id: "enterprise", name: "Enterprise", includedPluginIds: ["files"], visiblePluginIds: ["files"], maxUsers: null, storageMb: 10240 }
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
    ...PLUGIN_MANIFESTS.documents,
    visibleInPlans: ["starter", "pro", "enterprise"],
    includedInPlans: ["starter", "pro", "enterprise"],
    purchasable: false,
    system: true,
    codeAvailable: true,
    status: "published"
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
export const LEGACY_PLUGIN_PLAN_ASSIGNMENT_MIGRATIONS: ReadonlyArray<{
  pluginId: string;
  run: (db: Db) => Promise<void>;
}> = [
  { pluginId: "connected-devices", run: migrateLegacyConnectedDevicesPlanAssignments }
];

/** Route explicit Platform Admin plan removals to the owning legacy package migration. */
export async function recordLegacyPluginPlanAssignmentRemovals(
  db: Db,
  pluginId: string,
  planIds: readonly string[],
  actorId: string
): Promise<void> {
  if (pluginId === "connected-devices") {
    await recordLegacyConnectedDevicesPlanRemovals(db, planIds, actorId);
  }
}
