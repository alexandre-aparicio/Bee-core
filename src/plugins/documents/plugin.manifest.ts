/** Package metadata and permissions owned by the Documents module. */
export const PLUGIN_MANIFEST = {
  id: "documents",
  name: "Documents",
  version: "0.4.0",
  description: "Tenant document library, folder ACLs and controlled public delivery.",
  category: "platform",
  // Files is a host runtime service dependency, not a tenant package to install.
  dependencies: ["files"],
  requiredServices: ["mongoDbName", "sessionIdSecret"],
  tenantDependencies: [],
  activationPolicy: "manual" as const,
  permissions: [
    { key: "documents.read", module: "documents", resource: "documents", action: "read", label: "View documents", defaultGrants: { owner: true, admin: true, manager: true, member: true } },
    { key: "documents.write", module: "documents", resource: "documents", action: "write", label: "Manage documents", defaultGrants: { owner: true, admin: true, manager: true, member: false } }
  ]
};
