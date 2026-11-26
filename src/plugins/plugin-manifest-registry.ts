import type { PluginPlan, PluginPackageDefinition } from "../core/plugin-entitlements.js";
import { PLUGIN_MANIFEST as TIME_TRACKING_MANIFEST } from "./time-tracking/plugin.manifest.js";

/** Per-plugin manifests are owned by their plugin folders and composed here for platform consumers. */
export const PLUGIN_MANIFESTS = {
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
];

/** Single source for legacy package migration and permanent retirement policy. */
export const RETIRED_PACKAGE_POLICIES = [
  { id: "hello-world", retireSignedZip: false },
  { id: "time-tracking", retireSignedZip: false },
  { id: "notes", retireSignedZip: true },
] as const;
