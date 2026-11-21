import type { BeeContext, BeePlugin, BeePluginInfo, BeePluginStatus } from "./types.js";

interface ManagedPlugin {
  plugin: BeePlugin;
  status: BeePluginStatus;
  error?: unknown;
}

export class BeePluginManager {
  private readonly plugins = new Map<string, ManagedPlugin>();

  register(plugin: BeePlugin): void {
    const name = plugin.manifest?.name;
    if (!name || !plugin.manifest.version) throw new Error("Plugin requires manifest name and version");
    if (this.plugins.has(name)) throw new Error(`Plugin '${name}' already registered`);
    this.plugins.set(name, { plugin, status: "registered" });
  }

  private dependenciesReady(managed: ManagedPlugin): boolean {
    for (const dependency of managed.plugin.manifest.dependencies ?? []) {
      const dep = this.plugins.get(dependency);
      if (!dep) throw new Error(`Missing plugin dependency: ${dependency}`);
      if (dep.status !== "initialized" && dep.status !== "started") {
        throw new Error(`Dependency '${dependency}' is not initialized (status: ${dep.status})`);
      }
    }
    return true;
  }

  async initializeAll(ctx: BeeContext): Promise<void> {
    for (const managed of this.plugins.values()) {
      if (managed.status !== "registered") continue;
      try {
        this.dependenciesReady(managed);
        await managed.plugin.initialize?.(ctx);
        managed.status = "initialized";
        managed.error = undefined;
      } catch (error) {
        managed.status = "failed";
        managed.error = error;
        ctx.logger.error(`Plugin '${managed.plugin.manifest.name}' initialization failed; other plugins will continue`, error);
      }
    }
  }

  async startAll(ctx: BeeContext): Promise<void> {
    for (const managed of this.plugins.values()) {
      if (managed.status !== "initialized") continue;
      try {
        this.dependenciesReady(managed);
        await managed.plugin.start?.(ctx);
        managed.status = "started";
        managed.error = undefined;
      } catch (error) {
        managed.status = "failed";
        managed.error = error;
        ctx.logger.error(`Plugin '${managed.plugin.manifest.name}' start failed; other plugins will continue`, error);
      }
    }
  }

  async stopAll(ctx: BeeContext): Promise<void> {
    for (const managed of [...this.plugins.values()].reverse()) {
      if (managed.status !== "started") continue;
      try {
        await managed.plugin.stop?.(ctx);
        managed.status = "stopped";
        managed.error = undefined;
      } catch (error) {
        managed.status = "failed";
        managed.error = error;
        ctx.logger.error(`Plugin '${managed.plugin.manifest.name}' stop failed; continuing shutdown`, error);
      }
    }
  }

  list(): BeePluginInfo[] {
    return [...this.plugins.values()].map(({ plugin, status }) => ({ ...plugin.manifest, status }));
  }
}
