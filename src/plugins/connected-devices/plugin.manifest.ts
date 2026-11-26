/** Package metadata and permissions owned by Connected Devices. */
export const PLUGIN_MANIFEST = {
  id: "connected-devices",
  name: "Connected Devices",
  version: "0.1.3",
  description: "Tenant device pairing, identity and capability grants.",
  category: "platform",
  dependencies: ["auth", "organizations", "marketplace"],
  requiredServices: ["mongoDbName", "sessionIdSecret"],
  optionalServices: [],
  tenantDependencies: [],
  activationPolicy: "manual" as const,
  permissions: [
    { key: "connected-devices.read", module: "connected-devices", resource: "devices", action: "read", label: "View connected devices", defaultGrants: { owner: true, admin: true, manager: true, member: true } },
    { key: "connected-devices.manage", module: "connected-devices", resource: "devices", action: "manage", label: "Manage connected devices", defaultGrants: { owner: true, admin: true, manager: false, member: false } }
  ]
};
