import type { PluginPackageDefinition, PluginPlan } from "../core/plugin-entitlements.js";

/** First-party package metadata is the single source for plan visibility and entitlement grants. */
export const TRUSTED_PLUGIN_PACKAGES: PluginPackageDefinition[] = [
  {
    id: "files", name: "Private Files", version: "0.1.0",
    description: "Private company file and image storage", category: "platform",
    visibleInPlans: ["starter", "pro", "enterprise"], includedInPlans: ["starter", "pro", "enterprise"],
    purchasable: false, system: true, dependencies: [], codeAvailable: true, status: "published"
  },
  {
    id: "documents", name: "Documents", version: "0.1.0",
    description: "Shared document library with folder-level team access and controlled public delivery",
    category: "platform", visibleInPlans: ["starter", "pro", "enterprise"], includedInPlans: ["starter", "pro", "enterprise"],
    purchasable: false, system: true, dependencies: ["files"], activationPolicy: "automatic", codeAvailable: true, status: "published"
  },
  {
    id: "connected-devices", name: "Connected Devices", version: "0.1.0",
    description: "Secure tenant-scoped device pairing, capability grants and revocation",
    category: "platform", visibleInPlans: ["starter", "pro", "enterprise"], includedInPlans: ["starter", "pro", "enterprise"],
    purchasable: false, system: false, dependencies: [], activationPolicy: "manual", codeAvailable: true, status: "published",
    permissions: [
      { key: "connected-devices.read", module: "connected-devices", resource: "devices", action: "read", label: "View connected devices", description: "View devices paired with this company.", defaultGrants: { owner: true, admin: true, manager: true, member: false } },
      { key: "connected-devices.manage", module: "connected-devices", resource: "devices", action: "manage", label: "Manage connected devices", description: "Pair, unlink and manage company devices.", defaultGrants: { owner: true, admin: true, manager: false, member: false }, customRoleAssignable: false }
    ]
  }
];

const BUILT_IN_PLAN_TIERS = [
  { id: "starter", name: "Starter", maxUsers: 5, storageMb: 100 },
  { id: "pro", name: "Pro", maxUsers: 25, storageMb: 1024 },
  { id: "enterprise", name: "Enterprise", maxUsers: null, storageMb: 10240 }
] as const;

export const BUILT_IN_PLANS: PluginPlan[] = BUILT_IN_PLAN_TIERS.map(plan => ({
  ...plan,
  includedPluginIds: TRUSTED_PLUGIN_PACKAGES.filter(plugin => plugin.includedInPlans.includes(plan.id)).map(plugin => plugin.id),
  visiblePluginIds: TRUSTED_PLUGIN_PACKAGES.filter(plugin => plugin.visibleInPlans.includes(plan.id)).map(plugin => plugin.id)
}));

/** Explicit legacy package migration and retirement policy, separate from tenant data. */
export const MIGRATABLE_BUILTIN_PLUGIN_IDS = new Set(["connected-devices", "documents", "hello-world", "time-tracking"]);
export const RETIRED_BUNDLED_PLUGIN_PACKAGES = [
  { id: "hello-world", retireSignedZip: false },
  { id: "time-tracking", retireSignedZip: false },
  { id: "notes", retireSignedZip: true }
] as const;
