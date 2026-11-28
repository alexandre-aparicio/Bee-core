/** Package metadata and device permissions owned by Time Tracking Connected. */
export const PLUGIN_MANIFEST = {
  id: "time-tracking-connected",
  name: "Time Tracking Connected",
  version: "0.1.2",
  description: "Connected-device actions for Control Horario.",
  category: "productivity",
  dependencies: ["connected-devices", "time-tracking"],
  requiredServices: ["mongoDbName", "sessionIdSecret"],
  optionalServices: [],
  tenantDependencies: ["connected-devices", "time-tracking"],
  activationPolicy: "manual" as const,
  migrations: [],
  permissions: [
    { key: "time-tracking-connected.clock-in", module: "time-tracking-connected", resource: "clock-in", action: "create", label: "Registrar entrada", defaultGrants: { owner: true, admin: true, manager: true, member: true } },
    { key: "time-tracking-connected.clock-out", module: "time-tracking-connected", resource: "clock-out", action: "create", label: "Registrar salida", defaultGrants: { owner: true, admin: true, manager: true, member: true } },
    { key: "time-tracking-connected.records.read", module: "time-tracking-connected", resource: "records", action: "read", label: "Consultar registros", defaultGrants: { owner: true, admin: true, manager: true, member: true } }
  ]
};
