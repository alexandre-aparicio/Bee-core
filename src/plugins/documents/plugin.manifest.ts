/** Package metadata and permissions owned by the Documents module. */
export const PLUGIN_MANIFEST = {
  id: "documents",
  name: "Documents",
  version: "0.1.0",
  description: "Shared document library with folder-level team access and controlled public delivery",
  category: "platform",
  dependencies: ["auth", "organizations", "files"],
  requiredServices: ["mongoDbName", "sessionIdSecret"],
  optionalServices: ["fileStoragePath"],
  tenantDependencies: ["files"],
  activationPolicy: "automatic" as const,
  permissions: [
    { key: "documents.read", module: "documents", resource: "documents", action: "read", label: "View documents", defaultGrants: { owner: true, admin: true, manager: true, member: true } },
    { key: "documents.write", module: "documents", resource: "documents", action: "write", label: "Manage documents", defaultGrants: { owner: true, admin: true, manager: true, member: false } }
  ]
};
