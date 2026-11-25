import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import jwt from "@fastify/jwt";
import { createHmac } from "node:crypto";
import type { BeeContext, BeePlugin, BeePluginInfo } from "./types.js";
import { replaceRuntimePlugin, unregisterRuntimePlugin } from "./runtime-plugin-registry.js";

interface MountedRuntimePlugin { plugin: BeePlugin; server: FastifyInstance; context: BeeContext; apiPrefixes: string[]; }
const prefixMatches = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + "/");

export class BeeDynamicPluginRuntime {
  private readonly mounted = new Map<string, MountedRuntimePlugin>();
  constructor(private readonly getContext: () => BeeContext, private readonly jwtSecret: string, private readonly getHostPlugins: () => BeePluginInfo[]) {}

  list() { return [...this.mounted.entries()].map(([pluginId, entry]) => ({ pluginId, version: entry.plugin.manifest.version, apiPrefixes: [...entry.apiPrefixes] })); }
  has(pluginId: string): boolean { return this.mounted.has(pluginId); }

  async mount(plugin: BeePlugin): Promise<void> {
    const pluginId = plugin.manifest?.name;
    if (!pluginId || !plugin.manifest.version) throw new Error("External plugin requires a stable ID and version");
    const previous = this.mounted.get(pluginId);
    const apiPrefixes = [...new Set(plugin.manifest.apiPrefixes ?? [])].sort();
    for (const prefix of apiPrefixes) {
      if (!prefix.startsWith("/") || prefix === "/" || prefix.includes("?") || prefix.includes("#") || prefix.includes("..")) throw new Error("Plugin declares an invalid API prefix: " + prefix);
    }
    for (const dependencyName of plugin.manifest.dependencies ?? []) {
      const host = this.getHostPlugins().find(item => item.name.toLowerCase() === dependencyName.toLowerCase() && item.status === "started");
      const external = [...this.mounted.keys()].some(id => id.toLowerCase() === dependencyName.toLowerCase());
      if (!host && !external) throw new Error("Required runtime dependency is not started: " + dependencyName);
    }
    for (const [otherId, other] of this.mounted) {
      if (otherId === pluginId) continue;
      for (const incoming of apiPrefixes) {
        if (other.apiPrefixes.some(existing => incoming === existing || incoming.startsWith(existing + "/") || existing.startsWith(incoming + "/"))) throw new Error("Plugin API prefix conflicts with " + otherId + ": " + incoming);
      }
    }

    const base = this.getContext();
    const pluginBase: BeeContext = { ...base, pluginRuntime: undefined };
    const server = Fastify({ logger: false, bodyLimit: 10 * 1024 * 1024 });
    server.register(jwt, {
      secret: this.jwtSecret,
      sign: { algorithm: "HS256", expiresIn: "20m", iss: "bee-core", aud: "bee-core" },
      verify: { algorithms: ["HS256"], allowedAud: "bee-core", allowedIss: "bee-core", requiredClaims: ["exp", "aud", "iss"] }
    });
    const scopedConfig: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(base.config, "mongoDbName")) scopedConfig.mongoDbName = base.config.mongoDbName;
    // Files-backed plugins must resolve the exact same storage root as the host Files service.
    if ((plugin.manifest.dependencies ?? []).some(name => name.toLowerCase() === "files") && Object.prototype.hasOwnProperty.call(base.config, "fileStoragePath")) {
      scopedConfig.fileStoragePath = base.config.fileStoragePath;
    }
    scopedConfig.sessionIdSecret = typeof base.config.sessionIdSecret === "string"
      ? base.config.sessionIdSecret
      : createHmac("sha256", this.jwtSecret).update("bee-core:session-resource-id:v1").digest("hex");

    let pluginContext: BeeContext | undefined;
    let initializationAttempted = false;
    try {
      server.register(async scopedServer => {
        pluginContext = Object.freeze({
          ...pluginBase, pluginName: pluginId, server: scopedServer, events: base.events.forPlugin(pluginId),
          config: Object.freeze(scopedConfig),
          logger: Object.freeze({
            info: (message: string, details?: unknown) => base.logger.info("[" + pluginId + "] " + message, details),
            warn: (message: string, details?: unknown) => base.logger.warn("[" + pluginId + "] " + message, details),
            error: (message: string, details?: unknown) => base.logger.error("[" + pluginId + "] " + message, details)
          })
        });
        initializationAttempted = true;
        await plugin.initialize?.(pluginContext);
        await plugin.start?.(pluginContext);
      });
      await server.ready();
    } catch (error) {
      if (initializationAttempted && pluginContext) {
        try { await plugin.stop?.(pluginContext); } catch (stopError) { base.logger.warn("External plugin cleanup after failed mount also failed", { pluginId, error: stopError }); }
      }
      try { await server.close(); } catch { /* preserve original mount error */ }
      throw error;
    }

    const mounted: MountedRuntimePlugin = { plugin, server, context: pluginContext!, apiPrefixes };
    if (previous) {
      try { await previous.plugin.stop?.(previous.context); await previous.server.close(); }
      catch (error) {
        try { await plugin.stop?.(pluginContext!); } catch { /* best-effort rollback */ }
        try { await server.close(); } catch { /* best-effort rollback */ }
        throw new Error("Could not safely replace the active plugin runtime: " + (error instanceof Error ? error.message : String(error)));
      }
    }
    this.mounted.set(pluginId, mounted);
    replaceRuntimePlugin(plugin);
    base.logger.info(previous ? "External plugin runtime replaced without restarting Bee Core" : "External plugin runtime mounted without restarting Bee Core", { pluginId, version: plugin.manifest.version });
  }

  async unmount(pluginId: string): Promise<void> {
    const current = this.mounted.get(pluginId);
    if (!current) return;
    const dependent = [...this.mounted.entries()].find(([id, entry]) => id !== pluginId && (entry.plugin.manifest.dependencies ?? []).some(name => name.toLowerCase() === pluginId.toLowerCase()));
    if (dependent) throw new Error("Cannot unload plugin while another runtime plugin depends on it: " + dependent[0]);
    await current.plugin.stop?.(current.context);
    await current.server.close();
    this.mounted.delete(pluginId);
    unregisterRuntimePlugin(pluginId);
    this.getContext().logger.info("External plugin runtime unloaded without restarting Bee Core", { pluginId });
  }

  async stopAll(): Promise<void> {
    for (const pluginId of [...this.mounted.keys()].reverse()) {
      try { await this.unmount(pluginId); }
      catch (error) { this.getContext().logger.error("External plugin runtime shutdown failed", { pluginId, error }); }
    }
  }

  async dispatch(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const pathname = request.url.split("?", 1)[0] ?? request.url;
    const entry = [...this.mounted.values()].find(item => item.apiPrefixes.some(prefix => prefixMatches(pathname, prefix)));
    if (!entry) { reply.code(404).send({ error: "Route not found" }); return; }
    const headers: Record<string, string | string[]> = {};
    for (const [name, value] of Object.entries(request.headers)) {
      if (value === undefined || ["host", "content-length", "connection", "transfer-encoding"].includes(name.toLowerCase())) continue;
      if (typeof value === "string" || Array.isArray(value)) headers[name] = value as string | string[];
    }
    const payload = request.body === undefined ? undefined : Buffer.isBuffer(request.body) ? request.body : typeof request.body === "string" ? request.body : JSON.stringify(request.body);
    const response = await entry.server.inject({ method: request.method as any, url: request.url, headers, ...(payload === undefined ? {} : { payload }) });
    for (const [name, value] of Object.entries(response.headers)) {
      if (value === undefined || ["content-length", "transfer-encoding", "connection", "keep-alive", "date", "server"].includes(name.toLowerCase())) continue;
      reply.header(name, value as string | string[]);
    }
    reply.code(response.statusCode).send(response.rawPayload);
  }
}
