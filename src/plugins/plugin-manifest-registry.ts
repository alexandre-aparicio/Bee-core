import type { PluginPlan, PluginPackageDefinition } from "../core/plugin-entitlements.js";
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

/** Explicit retirement exceptions for signed package IDs. */
export const RETIRED_PACKAGE_POLICIES = [
  { id: "hello-world", retireSignedZip: false },
  { id: "time-tracking", retireSignedZip: false },
  { id: "notes", retireSignedZip: true },
] as const;
