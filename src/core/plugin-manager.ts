import type { BeeContext, BeePlugin, BeePluginInfo, BeePluginStatus } from "./types.js";

interface ManagedPlugin {
  plugin: BeePlugin;
  status: BeePluginStatus;
  context?: BeeContext;
  error?: unknown;
}

export class BeePluginManager {
  private readonly plugins = new Map<string, ManagedPlugin>();

  register(plugin: BeePlugin): void {
    const name = plugin.manifest?.name;
    if (!name || !plugin.manifest.version) throw new Error("Plugin requires manifest name and version");
    if (this.plugins.has(name) || [...this.plugins.keys()].some(existing => existing.toLowerCase() === name.toLowerCase())) {
      throw new Error(`Plugin '${name}' already registered (names are case-insensitive)`);
    }
    this.plugins.set(name, { plugin, status: "registered" });
  }

  private createPluginContext(pluginName: string, ctx: BeeContext): BeeContext {
    const prefix = `[${pluginName}]`;
    return Object.freeze({
      ...ctx,
      pluginName,
      config: Object.freeze({ ...ctx.config }),
      logger: Object.freeze({
        info: (message: string, context?: unknown) => ctx.logger.info(`${prefix} ${message}`, context),
        warn: (message: string, context?: unknown) => ctx.logger.warn(`${prefix} ${message}`, context),
        error: (message: string, context?: unknown) => ctx.logger.error(`${prefix} ${message}`, context)
      })
    });
  }

  private dependenciesReady(managed: ManagedPlugin): void {
    for (const dependency of managed.plugin.manifest.dependencies ?? []) {
      const dep = this.plugins.get(dependency);
      if (!dep) throw new Error(`Missing plugin dependency: ${dependency}`);
      if (dep.status !== "initialized" && dep.status !== "started") {
        throw new Error(`Dependency '${dependency}' is not initialized (status: ${dep.status})`);
      }
    }
  }

  /**
   * Register every plugin in a distinct Fastify encapsulation scope.
   * initialize/start run inside that scope so routes, hooks and decorators
   * owned by a plugin cannot leak into sibling plugins.
   */
  async mountAll(ctx: BeeContext): Promise<void> {
    for (const managed of this.plugins.values()) {
      if (managed.status !== "registered") continue;
      const pluginName = managed.plugin.manifest.name;
      ctx.server.register(async scopedServer => {
        const pluginContext = this.createPluginContext(pluginName, { ...ctx, server: scopedServer });
        managed.context = pluginContext;
        try {
          this.dependenciesReady(managed);
          await managed.plugin.initialize?.(pluginContext);
          managed.status = "initialized";
          managed.error = undefined;
          await managed.plugin.start?.(pluginContext);
          managed.status = "started";
          managed.error = undefined;
        } catch (error) {
          managed.status = "failed";
          managed.error = error;
          ctx.logger.error(`Plugin '${pluginName}' failed in its isolated scope; other plugins will continue`, error);
          try {
            await managed.plugin.stop?.(pluginContext);
          } catch (cleanupError) {
            ctx.logger.warn(`Plugin '${pluginName}' cleanup after failure also failed`, cleanupError);
          }
        }
      });
    }
    // Fastify runs the encapsulated registration callbacks and awaits their lifecycle work.
    await ctx.server.ready();
  }

  async stopAll(ctx: BeeContext): Promise<void> {
    for (const managed of [...this.plugins.values()].reverse()) {
      if (managed.status !== "started") continue;
      const pluginContext = managed.context ?? this.createPluginContext(managed.plugin.manifest.name, ctx);
      try {
        await managed.plugin.stop?.(pluginContext);
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
    return [...this.plugins.values()].map(({ plugin, status, error }) => ({
      ...plugin.manifest,
      status,
      ...(error ? { error: error instanceof Error ? error.message : String(error) } : {})
    }));
  }
}
