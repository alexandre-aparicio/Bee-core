/** Package metadata and permissions owned by the Documents module. */
export const PLUGIN_MANIFEST = {
  id: "documents",
  name: "Documents",
  version: "0.1.5",
  description: "Tenant document library, folder ACLs and controlled public delivery.",
  category: "platform",
  dependencies: ["auth", "organizations", "files"],
  requiredServices: ["mongoDbName", "sessionIdSecret"],
  tenantDependencies: [],
  activationPolicy: "manual" as const,
  permissions: [
    { key: "documents.read", module: "documents", resource: "documents", action: "read", label: "View documents", defaultGrants: { owner: true, admin: true, manager: true, member: true } },
    { key: "documents.write", module: "documents", resource: "documents", action: "write", label: "Manage documents", defaultGrants: { owner: true, admin: true, manager: true, member: false } }
  ]
};
