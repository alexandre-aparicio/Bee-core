/** Package metadata and device capability contribution owned by Time Tracking Connected. */
export const PLUGIN_MANIFEST = {
  id: "time-tracking-connected",
  name: "Time Tracking Connected",
  version: "0.1.2",
  description: "Connected-device actions for Control Horario.",
  category: "productivity",
  dependencies: ["connected-devices", "time-tracking"],
  requiredServices: ["mongoDbName", "sessionIdSecret"],
  optionalServices: [],
  activationPolicy: "manual" as const,
  migrations: [],
  permissions: []
};
