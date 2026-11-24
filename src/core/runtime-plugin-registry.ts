import type { BeePlugin } from "./types.js";

const runtimePlugins = new Map<string, BeePlugin>();

export function registerRuntimePlugin(plugin: BeePlugin): void {
  const id = plugin.manifest?.name;
  if (!id) throw new Error("Runtime plugin requires a stable manifest name");
  if (runtimePlugins.has(id)) throw new Error("Runtime plugin is already registered: " + id);
  runtimePlugins.set(id, plugin);
}

export function getRuntimePlugin(pluginId: string): BeePlugin | undefined {
  return runtimePlugins.get(pluginId);
}
