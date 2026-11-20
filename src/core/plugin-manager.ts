import type { BeeContext, BeePlugin, BeePluginInfo, BeePluginStatus } from "./types.js";

interface ManagedPlugin {
  plugin: BeePlugin;
  status: BeePluginStatus;
}

export class BeePluginManager {
  private readonly plugins = new Map<string, ManagedPlugin>();

  register(plugin: BeePlugin): void {
    const name = plugin.manifest?.name;
    if (!name || !plugin.manifest.version) throw new Error("Plugin requires manifest name and version");
    if (this.plugins.has(name)) throw new Error(`Plugin '${name}' already registered`);
    this.plugins.set(name, { plugin, status: "registered" });
  }

  async initializeAll(ctx: BeeContext): Promise<void> {
    for (const managed of this.plugins.values()) {
      try {
        for (const dependency of managed.plugin.manifest.dependencies ?? []) {
          if (!this.plugins.has(dependency)) throw new Error(`Missing plugin dependency: ${dependency}`);
          const depStatus = this.plugins.get(dependency)?.status;
          if (depStatus !== "initialized" && depStatus !== "started") {
            throw new Error(`Dependency '${dependency}' must initialize first`);
          }
        }
        await managed.plugin.initialize?.(ctx);
        managed.status = "initialized";
      } catch (error) {
        managed.status = "failed";
        throw error;
      }
    }
  }

  async startAll(ctx: BeeContext): Promise<void> {
    for (const managed of this.plugins.values()) {
      if (managed.status !== "initialized") continue;
      try {
        await managed.plugin.start?.(ctx);
        managed.status = "started";
      } catch (error) {
        managed.status = "failed";
        throw error;
      }
    }
  }

  async stopAll(ctx: BeeContext): Promise<void> {
    for (const managed of [...this.plugins.values()].reverse()) {
      if (managed.status !== "started") continue;
      await managed.plugin.stop?.(ctx);
      managed.status = "stopped";
    }
  }

  list(): BeePluginInfo[] {
    return [...this.plugins.values()].map(({ plugin, status }) => ({ ...plugin.manifest, status }));
  }
}
