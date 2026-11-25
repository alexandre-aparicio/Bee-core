import type { BeeContext, BeePlugin, BeePluginInfo, BeePluginStatus } from "./types.js";
import { createHmac } from "node:crypto";
import { CORE_PLUGIN_SERVICE_CONFIG } from "./plugin-services.js";

interface ManagedPlugin {
  plugin: BeePlugin;
  status: BeePluginStatus;
  context?: BeeContext;
  error?: unknown;
}

export class BeePluginManager {
  private readonly plugins = new Map<string, ManagedPlugin>();
  private readonly startupOrder: ManagedPlugin[] = [];

  register(plugin: BeePlugin): void {
    const name = plugin.manifest?.name;
    if (!name || !plugin.manifest.version) throw new Error("Plugin requires manifest name and version");
    if (this.plugins.has(name) || [...this.plugins.keys()].some(existing => existing.toLowerCase() === name.toLowerCase())) {
      throw new Error(`Plugin '${name}' already registered (names are case-insensitive)`);
    }
    this.plugins.set(name, { plugin, status: "registered" });
  }


  private createPluginContext(plugin: BeePlugin, ctx: BeeContext): BeeContext {
    const pluginName = plugin.manifest.name;
    const prefix = `[${pluginName}]`;
    const requiredServices = plugin.manifest.requiredServices ?? ["mongo"];
    const unknownService = requiredServices.find(service => !Object.prototype.hasOwnProperty.call(CORE_PLUGIN_SERVICE_CONFIG, service));
    if (unknownService) throw new Error(`Plugin '${pluginName}' requires unsupported host service '${unknownService}'.`);
    const allowedConfig = [...new Set(requiredServices.flatMap(service => CORE_PLUGIN_SERVICE_CONFIG[service] ?? []))];
    const scopedConfig = Object.fromEntries(allowedConfig.filter(key => Object.prototype.hasOwnProperty.call(ctx.config, key)).map(key => [key, ctx.config[key]]));
    // Resource references use a dedicated key derived from JWT_SECRET. Plugins
    // that serialize IDs never receive the JWT signing secret itself.
    if (requiredServices.includes("session-resource-ids")) {
      const jwtSecret = String(ctx.config.jwtSecret ?? "");
      if (jwtSecret.length >= 32) scopedConfig.sessionIdSecret = createHmac("sha256", jwtSecret).update("bee-core:session-resource-id:v1").digest("hex");
    }
    return Object.freeze({
      ...ctx,
      pluginName,
      config: Object.freeze(scopedConfig),
      logger: Object.freeze({
        info: (message: string, context?: unknown) => ctx.logger.info(`${prefix} ${message}`, context),
        warn: (message: string, context?: unknown) => ctx.logger.warn(`${prefix} ${message}`, context),
        error: (message: string, context?: unknown) => ctx.logger.error(`${prefix} ${message}`, context)
      })
    });
  }

  private getDependency(name: string): ManagedPlugin | undefined {
    return this.plugins.get(name) ?? [...this.plugins.entries()].find(([registered]) => registered.toLowerCase() === name.toLowerCase())?.[1];
  }

  private orderedPlugins(): ManagedPlugin[] {
    const registered = [...this.plugins.values()].filter(item => item.status === "registered");
    const byName = new Map([...this.plugins.entries()].map(([name, item]) => [name.toLowerCase(), item]));

    for (const managed of registered) {
      for (const dependencyName of managed.plugin.manifest.dependencies ?? []) {
        if (!byName.has(dependencyName.toLowerCase())) {
          managed.status = "failed";
          managed.error = new Error(`Missing plugin dependency '${dependencyName}' required by '${managed.plugin.manifest.name}'.`);
          break;
        }
      }
    }
    const propagateDependencyFailures = (): void => {
      let changed = true;
      while (changed) {
        changed = false;
        for (const managed of registered) {
          if (managed.status !== "registered") continue;
          for (const dependencyName of managed.plugin.manifest.dependencies ?? []) {
            const dependency = byName.get(dependencyName.toLowerCase());
            if (!dependency || dependency.status === "failed") {
              managed.status = "failed";
              managed.error = new Error(`Dependency '${dependencyName}' required by '${managed.plugin.manifest.name}' is unavailable.`);
              changed = true;
              break;
            }
          }
        }
      }
    };
    propagateDependencyFailures();

    // Kahn's algorithm gives a stable topological order.
    const candidates = registered.filter(item => item.status === "registered");
    const candidateSet = new Set(candidates);
    const indegree = new Map<ManagedPlugin, number>();
    const dependents = new Map<ManagedPlugin, ManagedPlugin[]>();
    for (const item of candidates) {
      const dependencies = (item.plugin.manifest.dependencies ?? [])
        .map(name => byName.get(name.toLowerCase()))
        .filter((dependency): dependency is ManagedPlugin => Boolean(dependency && candidateSet.has(dependency)));
      indegree.set(item, dependencies.length);
      for (const dependency of dependencies) {
        const list = dependents.get(dependency) ?? [];
        list.push(item);
        dependents.set(dependency, list);
      }
    }
    const queue = candidates.filter(item => indegree.get(item) === 0);
    const ordered: ManagedPlugin[] = [];
    while (queue.length) {
      const current = queue.shift()!;
      ordered.push(current);
      for (const dependent of dependents.get(current) ?? []) {
        const next = (indegree.get(dependent) ?? 1) - 1;
        indegree.set(dependent, next);
        if (next === 0) queue.push(dependent);
      }
    }

    const remaining = new Set(candidates.filter(item => !ordered.includes(item)));
    const visitState = new Map<ManagedPlugin, 0 | 1 | 2>();
    const stack: ManagedPlugin[] = [];
    const markCycle = (item: ManagedPlugin): boolean => {
      visitState.set(item, 1);
      stack.push(item);
      for (const name of item.plugin.manifest.dependencies ?? []) {
        const dependency = byName.get(name.toLowerCase());
        if (!dependency || !remaining.has(dependency)) continue;
        const state = visitState.get(dependency) ?? 0;
        if (state === 0 && markCycle(dependency)) return true;
        if (state === 1) {
          const cycle = [...stack.slice(stack.indexOf(dependency)), dependency];
          const description = cycle.map(entry => entry.plugin.manifest.name).join(" -> ");
          for (const member of cycle.slice(0, -1)) {
            member.status = "failed";
            member.error = new Error(`Circular plugin dependency detected: ${description}`);
          }
          return true;
        }
      }
      stack.pop();
      visitState.set(item, 2);
      return false;
    };
    for (const item of remaining) {
      if ((visitState.get(item) ?? 0) === 0) markCycle(item);
    }

    for (const item of remaining) {
      if (item.status !== "registered") continue;
      const failedDependency = (item.plugin.manifest.dependencies ?? [])
        .map(name => ({ name, dependency: byName.get(name.toLowerCase()) }))
        .find(entry => !entry.dependency || entry.dependency.status === "failed");
      item.status = "failed";
      item.error = new Error(failedDependency
        ? `Dependency '${failedDependency.name}' required by '${item.plugin.manifest.name}' is unavailable because of a dependency failure.`
        : `Plugin '${item.plugin.manifest.name}' could not be ordered; check its dependency graph for a cycle.`);
    }
    propagateDependencyFailures();
    return ordered;
  }

  private dependenciesReady(managed: ManagedPlugin): void {
    for (const dependencyName of managed.plugin.manifest.dependencies ?? []) {
      const dep = this.getDependency(dependencyName);
      if (!dep) throw new Error(`Missing plugin dependency: ${dependencyName}`);
      if (dep.status !== "initialized" && dep.status !== "started") {
        throw new Error(`Dependency '${dependencyName}' is not initialized (status: ${dep.status})`);
      }
    }
  }

  /**
   * Register every plugin in a distinct Fastify encapsulation scope.
   * initialize/start run inside that scope so routes, hooks and decorators
   * owned by a plugin cannot leak into sibling plugins.
   */
  async mountAll(ctx: BeeContext): Promise<void> {
    for (const managed of this.orderedPlugins()) {
      if (managed.status !== "registered") continue;
      const pluginName = managed.plugin.manifest.name;
      ctx.server.register(async scopedServer => {
        const pluginContext = this.createPluginContext(managed.plugin, {
          ...ctx,
          server: scopedServer,
          events: ctx.events.forPlugin(pluginName)
        });
        managed.context = pluginContext;
        try {
          this.dependenciesReady(managed);
          await managed.plugin.initialize?.(pluginContext);
          managed.status = "initialized";
          managed.error = undefined;
          await managed.plugin.start?.(pluginContext);
          managed.status = "started";
          managed.error = undefined;
          this.startupOrder.push(managed);
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
    for (const managed of [...this.startupOrder].reverse()) {
      if (managed.status !== "started") continue;
      const pluginContext = managed.context ?? this.createPluginContext(managed.plugin, ctx);
      try {
        await managed.plugin.stop?.(pluginContext);
        managed.status = "stopped";
        managed.error = undefined;
        const startedIndex = this.startupOrder.indexOf(managed);
        if (startedIndex >= 0) this.startupOrder.splice(startedIndex, 1);
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