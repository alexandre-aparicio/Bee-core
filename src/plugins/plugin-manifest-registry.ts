import type { PluginPlan, PluginPackageDefinition } from "../core/plugin-entitlements.js";

export const BUILT_IN_PLANS: PluginPlan[] = [
  { id: "starter", name: "Starter", includedPluginIds: ["files", "documents", "connected-devices"], visiblePluginIds: ["files", "documents", "connected-devices"], maxUsers: 5, storageMb: 100 },
  { id: "pro", name: "Pro", includedPluginIds: ["files", "documents", "connected-devices"], visiblePluginIds: ["files", "documents", "connected-devices"], maxUsers: 25, storageMb: 1024 },
  { id: "enterprise", name: "Enterprise", includedPluginIds: ["files", "documents", "connected-devices"], visiblePluginIds: ["files", "documents", "connected-devices"], maxUsers: null, storageMb: 10240 }
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
  {
    id: "connected-devices", name: "Connected Devices", version: "0.1.0",
    description: "Secure tenant-scoped device pairing, capability grants and revocation",
    category: "platform", visibleInPlans: ["starter", "pro", "enterprise"],
    includedInPlans: ["starter", "pro", "enterprise"], purchasable: false, system: false,
    dependencies: [], activationPolicy: "manual", permissions: [
      { key: "connected-devices.read", module: "connected-devices", resource: "devices", action: "read", label: "View connected devices", defaultGrants: { owner: true, admin: true, manager: true, member: true } },
      { key: "connected-devices.manage", module: "connected-devices", resource: "devices", action: "manage", label: "Manage connected devices", defaultGrants: { owner: true, admin: true, manager: false, member: false } }
    ], codeAvailable: true, status: "published"
  },

];

/** Single source for legacy package migration and permanent retirement policy. */
export const MIGRATABLE_BUILT_IN_PACKAGE_IDS = new Set(["connected-devices", "time-tracking", "documents", "hello-world"]);
export const RETIRED_PACKAGE_POLICIES = [
  { id: "hello-world", retireSignedZip: false },
  { id: "time-tracking", retireSignedZip: false },
  { id: "notes", retireSignedZip: true }
] as const;
