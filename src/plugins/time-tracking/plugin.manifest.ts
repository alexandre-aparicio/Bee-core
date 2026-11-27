/** Package metadata and permissions owned by Control Horario. */
export const PLUGIN_MANIFEST = {
  id: "time-tracking",
  name: "Control Horario",
  version: "0.2.4",
  description: "Employee time clock, breaks and work-session history.",
  category: "productivity",
  dependencies: ["auth", "organizations"],
  requiredServices: ["mongoDbName", "sessionIdSecret"],
  optionalServices: [],
  tenantDependencies: [],
  activationPolicy: "automatic" as const,
  migrations: [
    { id: "001_create_time_tracking_indexes", checksum: "cab33997679133194d812b3f7ef827097ca45a925dcfcc55083a58bc90321b37", phase: "install" }
  ],
  permissions: [
    { key: "time-tracking.read", module: "time-tracking", resource: "records", action: "read", label: "View time records", defaultGrants: { owner: true, admin: true, manager: true, member: true } },
    { key: "time-tracking.clock", module: "time-tracking", resource: "clock", action: "create", label: "Register working time", defaultGrants: { owner: true, admin: true, manager: true, member: true } },
    { key: "time-tracking.manage", module: "time-tracking", resource: "records", action: "manage", label: "Manage time records", defaultGrants: { owner: true, admin: true, manager: true, member: false } }
  ]
};
