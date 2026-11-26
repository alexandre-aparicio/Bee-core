export type PluginFrontendRegistrationLike = { pluginId: string };

/** Build the host registry from feature-owned registrations without module-specific branches. */
export function createFrontendRegistrationMap<T extends PluginFrontendRegistrationLike>(
  registrations: readonly T[]
): Map<string, T> {
  const result = new Map<string, T>();
  for (const registration of registrations) {
    const pluginId = registration.pluginId;
    if (typeof pluginId !== "string" || !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(pluginId)) {
      throw new Error("Invalid plugin frontend registration ID");
    }
    if (result.has(pluginId)) throw new Error("Duplicate plugin frontend registration: " + pluginId);
    result.set(pluginId, registration);
  }
  return result;
}
