import Fastify from "fastify";
import websocket from "@fastify/websocket";
import jwt from "@fastify/jwt";
import { MongoClient } from "mongodb";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { BeeEventBus } from "./core/event-bus.js";
import { BeePluginManager } from "./core/plugin-manager.js";
import { validateEnvironment } from "./core/environment.js";
import type { BeeContext, BeeLogger, BeePlugin } from "./core/types.js";
import { verifyStoredPluginDirectory } from "./core/plugin-zip-installer.js";
import { registerRuntimePlugin } from "./core/runtime-plugin-registry.js";
import { syncAutomaticPluginProvisioning, syncPluginPackageVersionUpdates } from "./core/plugin-entitlements.js";
import { CORE_RUNTIME_PLUGIN_IDS, satisfiesPluginVersion } from "./core/plugin-package.js";
import { helloPlugin } from "./plugins/hello.plugin.js";
import { authPlugin } from "./plugins/auth/auth.plugin.js";
import { organizationsPlugin } from "./plugins/organizations/organizations.plugin.js";
import { teamsPlugin } from "./plugins/teams/teams.plugin.js";
import { filesPlugin } from "./plugins/files/files.plugin.js";
import { documentsPlugin } from "./plugins/documents/documents.plugin.js";
import { helloWorldPlugin } from "./plugins/hello-world/hello-world.plugin.js";
import { connectedDevicesPlugin } from "./plugins/connected-devices/connected-devices.plugin.js";
import { timeTrackingPlugin } from "./plugins/time-tracking/time-tracking.plugin.js";
import { marketplacePlugin } from "./plugins/marketplace/marketplace.plugin.js";
import { notesPlugin } from "./plugins/notes/notes.plugin.js";
import { notificationsPlugin } from "./plugins/notifications/notifications.plugin.js";
import { mailPlugin } from "./plugins/mail/mail.plugin.js";
import { platformAdminPlugin } from "./plugins/platform-admin/platform-admin.plugin.js";
import { localizationPlugin } from "./plugins/localization/localization.plugin.js";

const logger: BeeLogger = {
  info: (message, context) => console.log("[INFO]", message, context ?? ""),
  warn: (message, context) => console.warn("[WARN]", message, context ?? ""),
  error: (message, context) => console.error("[ERROR]", message, context ?? "")
};
const environment = validateEnvironment(process.env);
const trustProxyRaw = String(process.env.TRUST_PROXY ?? "").trim();
const trustProxy = trustProxyRaw.toLowerCase() === "true"
  ? true
  : trustProxyRaw.toLowerCase() === "false" || !trustProxyRaw
    ? false
    : trustProxyRaw.split(",").map(value => value.trim()).filter(Boolean);
const events = new BeeEventBus(undefined, new Set(["bee.started", "auth.login", "notification.request"]));
const plugins = new BeePluginManager();
const app = Fastify({ logger: false, trustProxy });

// Capacitor serves the bundled app from https://localhost on Android.
// Keep the allowlist explicit; deployments can add trusted web origins through
// BEE_CORS_ORIGINS (comma-separated exact origins, without paths).
const corsAllowedOrigins = new Set(
  String(process.env.BEE_CORS_ORIGINS ?? "https://localhost,capacitor://localhost")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean)
);
const corsAllowedMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const corsAllowedHeaders = new Set([
  "authorization",
  "content-type",
  "x-device-pairing-secret"
]);

app.addHook("onSend", async (request, reply, payload) => {
  const origin = request.headers.origin;
  if (origin && corsAllowedOrigins.has(origin)) {
    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Vary", "Origin");
    reply.header("Access-Control-Allow-Methods", [...corsAllowedMethods].join(", "));
    reply.header("Access-Control-Allow-Headers", [...corsAllowedHeaders].join(", "));
    reply.header("Access-Control-Max-Age", "600");
  }
  return payload;
});

app.options("/*", async (request, reply) => {
  const origin = request.headers.origin;
  const requestedMethod = String(request.headers["access-control-request-method"] ?? "").toUpperCase();
  const requestedHeaders = String(request.headers["access-control-request-headers"] ?? "")
    .split(",")
    .map(header => header.trim().toLowerCase())
    .filter(Boolean);

  if (!origin || !corsAllowedOrigins.has(origin)) {
    return reply.code(403).send({ error: "Origin is not allowed." });
  }
  if (!corsAllowedMethods.has(requestedMethod)) {
    return reply.code(403).send({ error: "Requested CORS method is not allowed." });
  }
  if (requestedHeaders.some(header => !corsAllowedHeaders.has(header))) {
    return reply.code(403).send({ error: "Requested CORS header is not allowed." });
  }

  return reply.code(204).send();
});
const mongoClient = new MongoClient(environment.mongoUri, {
  maxPoolSize: 20,
  minPoolSize: 1,
  serverSelectionTimeoutMS: 10000
});
app.addHook("onClose", async () => { await mongoClient.close(); });

app.register(jwt, {
  secret: environment.jwtSecret,
  sign: { algorithm: "HS256", expiresIn: "20m", iss: "bee-core", aud: "bee-core" },
  verify: { algorithms: ["HS256"], allowedAud: "bee-core", allowedIss: "bee-core", requiredClaims: ["exp", "aud", "iss"] }
});
app.register(websocket);


const ctx: BeeContext = {
  appName: "Bee-Core",
  version: "0.3.1",
  events,
  logger,
  server: app,
  mongoClient,
  config: Object.freeze({
    environment: environment.environment,
    jwtSecret: environment.jwtSecret,
    mongoDbName: environment.mongoDbName,
    authAdminEmail: process.env.AUTH_ADMIN_EMAIL ?? "",
    authAdminPassword: process.env.AUTH_ADMIN_PASSWORD ?? "",
    authMfaEncryptionKey: environment.authMfaEncryptionKey,
    fileStoragePath: process.env.BEE_FILES_DIR ?? "/data/bee-files",
    pluginPackagePath: process.env.BEE_PLUGIN_PACKAGES_DIR ?? "/data/bee-plugins",
    pluginPublisherPublicKey: process.env.BEE_PLUGIN_PUBLISHER_PUBLIC_KEY ?? "",
    billingWebhookSecret: process.env.BEE_BILLING_WEBHOOK_SECRET ?? "",
    publicBaseDomain: process.env.PUBLIC_BASE_DOMAIN ?? "beecore.beeprojects.net"
  })
};

// Host services stay in Core. The four installable modules use a temporary
// compatibility fallback only until their signed ZIP has been uploaded.
plugins.register(helloPlugin);
plugins.register(authPlugin);
plugins.register(organizationsPlugin);
plugins.register(teamsPlugin);
plugins.register(filesPlugin);
plugins.register(marketplacePlugin);
plugins.register(notesPlugin);
plugins.register(platformAdminPlugin);
plugins.register(notificationsPlugin);
plugins.register(mailPlugin);
plugins.register(localizationPlugin);

app.get("/health", async () => ({
  status: "ok",
  name: ctx.appName,
  version: ctx.version,
  uptime: process.uptime(),
  database: "connected"
}));
app.get("/plugins", async () => ({ plugins: plugins.list() }));
app.get<{Params:{pluginId:string;version:string;"*":string}}>("/plugin-packages/:pluginId/:version/assets/*",async(request,reply)=>{
  const {pluginId,version}=request.params;
  const assetPath=String(request.params["*"]??"");
  if(!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(pluginId)||!/^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)||!assetPath.startsWith("frontend/")||assetPath.includes("..")||assetPath.includes("\\\\")||assetPath.includes("\\0")){
    return reply.code(404).send({error:"Plugin asset not found"});
  }
  const db=mongoClient.db(environment.mongoDbName);
  const packageRecord=await db.collection("platform_plugin_packages").findOne({pluginId,version,status:"installed",source:"zip",runtimeState:"loaded"});
  if(!packageRecord||typeof packageRecord.packageDirectory!=="string")return reply.code(404).send({error:"Plugin asset not found"});
  const versionRecord=await db.collection("platform_plugin_package_versions").findOne({pluginId,version});
  const manifest=versionRecord?.manifest as {frontend?:{entrypoint?:string;assets?:string[]}}|undefined;
  const allowed=new Set([...(manifest?.frontend?.assets??[]),...(manifest?.frontend?.entrypoint?[manifest.frontend.entrypoint]:[])]);
  if(!allowed.has(assetPath))return reply.code(404).send({error:"Plugin asset not found"});
  const packageDirectory=resolve(packageRecord.packageDirectory);
  const assetFile=resolve(packageDirectory,assetPath);
  const relativeAsset=relative(packageDirectory,assetFile);
  if(!relativeAsset||relativeAsset.startsWith(".."+sep)||isAbsolute(relativeAsset))return reply.code(404).send({error:"Plugin asset not found"});
  let data:Buffer;
  try{data=await readFile(assetFile);}catch{return reply.code(404).send({error:"Plugin asset not found"});}
  const contentTypes:Record<string,string>={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".woff2":"font/woff2"};
  reply.header("Content-Type",contentTypes[extname(assetPath).toLowerCase()]??"application/octet-stream");
  reply.header("X-Content-Type-Options","nosniff");
  reply.header("Cache-Control","public, max-age=300");
  reply.header("Content-Security-Policy","default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'");
  return reply.send(data);
});
app.get("/", async () => ({
  name: "Bee-Core",
  slogan: "All Is a Plugin",
  version: ctx.version,
  status: "running",
  endpoints: ["/health", "/plugins", "/auth/login", "/auth/refresh", "/auth/me", "/auth/logout"]
}));

async function loadSignedZipPlugins(): Promise<Map<string,string>> {
  const failures = new Map<string,string>();
  const db = mongoClient.db(environment.mongoDbName);
  const registry = db.collection("platform_plugin_packages");
  const packages = await registry.find({ source: "zip", status: "installed" }).sort({ pluginId: 1 }).toArray();
  const storageRoot = resolve(String(ctx.config.pluginPackagePath ?? "/data/bee-plugins"));
  const publicKey = String(ctx.config.pluginPublisherPublicKey ?? "");
  for (const item of packages) {
    try {
      if (typeof item.pluginId !== "string" || typeof item.version !== "string" || typeof item.packageDirectory !== "string") {
        throw new Error("Platform package registry record is incomplete");
      }
      const expectedDirectory = resolve(storageRoot, item.pluginId, item.version);
      if (resolve(item.packageDirectory) !== expectedDirectory) throw new Error("Stored package path does not match its registered identity");
      const manifest = await verifyStoredPluginDirectory({
        packageDirectory: expectedDirectory,
        publisherPublicKey: publicKey,
        runtimeVersion: ctx.version
      });
      if (manifest.id !== item.pluginId || manifest.version !== item.version) throw new Error("Stored package manifest does not match its registry record");
      for (const dependency of manifest.dependencies.filter(item => !item.optional)) {
        if (CORE_RUNTIME_PLUGIN_IDS.has(dependency.pluginId)) {
          const hostDependency = plugins.list().find(plugin => plugin.name === dependency.pluginId);
          if (!hostDependency || hostDependency.status === "failed" || !satisfiesPluginVersion(hostDependency.version, dependency.versionRange)) {
            throw new Error("Required Core runtime dependency is missing or incompatible: " + dependency.pluginId + " " + dependency.versionRange);
          }
          continue;
        }
        const installedDependency = await registry.findOne({ pluginId: dependency.pluginId, status: "installed" });
        if (!installedDependency || !satisfiesPluginVersion(String(installedDependency.version ?? "0.0.0"), dependency.versionRange)) {
          throw new Error("Required runtime dependency is missing or incompatible: " + dependency.pluginId + " " + dependency.versionRange);
        }
      }
      const entrypoint = resolve(expectedDirectory, manifest.backend.entrypoint);
      const relativeEntrypoint = relative(expectedDirectory, entrypoint);
      if (!relativeEntrypoint || relativeEntrypoint.startsWith(".." + sep) || isAbsolute(relativeEntrypoint)) {
        throw new Error("Backend entrypoint escaped the package directory");
      }
      const moduleUrl = pathToFileURL(entrypoint).href + "?bee-package-version=" + encodeURIComponent(manifest.version);
      const loadedModule = await import(moduleUrl) as { default?: BeePlugin; plugin?: BeePlugin };
      const plugin = loadedModule.default ?? loadedModule.plugin;
      if (!plugin || !plugin.manifest || plugin.manifest.name !== manifest.id || plugin.manifest.version !== manifest.version) {
        throw new Error("Backend module must export a default BeePlugin whose manifest ID and version match bee-plugin.json");
      }
      const requiredDependencies = manifest.dependencies.filter(dependency => !dependency.optional).map(dependency => dependency.pluginId).sort();
      const runtimeDependencies = [...(plugin.manifest.dependencies ?? [])].sort();
      if (JSON.stringify(requiredDependencies) !== JSON.stringify(runtimeDependencies)) {
        throw new Error("Backend runtime dependencies do not match the signed package manifest");
      }
      const expectedMigrations = manifest.migrations.filter(migration => migration.phase !== "uninstall").map(migration => ({ id: migration.id, checksum: migration.checksum, phase: migration.phase })).sort((a,b) => a.id.localeCompare(b.id));
      const runtimeMigrations = [...(plugin.tenantMigrations ?? [])].map(migration => ({ id: migration.id, checksum: migration.checksum, phase: migration.phase ?? "install" })).sort((a,b) => a.id.localeCompare(b.id));
      if (JSON.stringify(expectedMigrations) !== JSON.stringify(runtimeMigrations)) {
        throw new Error("Backend tenant migrations do not match the signed package manifest");
      }
      plugins.register(plugin);
      registerRuntimePlugin(plugin);
      ctx.logger.info("Signed external plugin registered for startup", { pluginId: manifest.id, version: manifest.version });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.set(String(item.pluginId), message);
      await registry.updateOne({ pluginId: item.pluginId }, { $set: { runtimeState: "failed", runtimeError: message.slice(0, 500), updatedAt: new Date() } });
      ctx.logger.error("External plugin failed signature validation or registration", { pluginId: item.pluginId, error: message });
    }
  }
  return failures;
}

async function persistZipPluginRuntimeState(failures: Map<string,string>): Promise<void> {
  const db = mongoClient.db(environment.mongoDbName);
  const registry = db.collection("platform_plugin_packages");
  const versions = db.collection("platform_plugin_package_versions");
  const packageRows = await registry.find({ source: "zip", status: "installed" }).toArray();
  const runtimePlugins = new Map(plugins.list().map(plugin => [plugin.name, plugin]));
  for (const item of packageRows) {
    const pluginId = String(item.pluginId);
    const runtimePlugin = runtimePlugins.get(pluginId);
    const failure = failures.get(pluginId) ?? (runtimePlugin?.status === "started" ? "" : runtimePlugin?.error ?? "Plugin did not reach started state");
    const runtimeState = !failure && runtimePlugin?.status === "started" ? "loaded" : "failed";
    await registry.updateOne({ pluginId }, { $set: { runtimeState, runtimeError: failure || null, updatedAt: new Date() } });
    await versions.updateOne({ pluginId, version: item.version }, { $set: { runtimeState, runtimeError: failure || null, runtimeCheckedAt: new Date() } });
    await db.collection("plugin_catalog").updateOne({ id: pluginId }, { $set: { codeAvailable: runtimeState === "loaded", updatedAt: new Date() } });
    if (runtimeState === "loaded") {
      await syncAutomaticPluginProvisioning(db, pluginId);
      await syncPluginPackageVersionUpdates(db, pluginId);
    }
  }
}

async function bootstrap(): Promise<void> {
  await mongoClient.connect();
  const platformPackages = mongoClient.db(environment.mongoDbName).collection("platform_plugin_packages");
  const uploadedPackages = await platformPackages.find({ source: "zip", status: "installed" }).project<{pluginId:string}>({ pluginId: 1, _id: 0 }).toArray();
  const uploadedIds = new Set(uploadedPackages.map(item => item.pluginId));
  if (!uploadedIds.has("documents")) plugins.register(documentsPlugin);
  if (!uploadedIds.has("connected-devices")) plugins.register(connectedDevicesPlugin);
  if (!uploadedIds.has("time-tracking")) plugins.register(timeTrackingPlugin);
  if (!uploadedIds.has("hello-world")) plugins.register(helloWorldPlugin);

  const zipPluginFailures = await loadSignedZipPlugins();
  await plugins.mountAll(ctx);
  await persistZipPluginRuntimeState(zipPluginFailures);
  const db = mongoClient.db(environment.mongoDbName);
  const automaticPackages = await db.collection("plugin_catalog").find({ activationPolicy: "automatic", codeAvailable: true, status: "published" }).project<{id:string}>({ id: 1, _id: 0 }).toArray();
  for (const item of automaticPackages) await syncAutomaticPluginProvisioning(db, item.id);
  await events.emit("bee.started", { at: new Date().toISOString() });
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";
  await app.listen({ port, host });
  logger.info(`Bee-Core listening at http://${host}:${port}`);
}

let shuttingDown = false;
const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal}, shutting down`);
  try {
    await plugins.stopAll(ctx);
  } finally {
    await app.close();
  }
};
process.on("SIGTERM", () => { void shutdown("SIGTERM").catch(error => { logger.error("Shutdown failed", error); process.exitCode = 1; }); });
process.on("SIGINT", () => { void shutdown("SIGINT").catch(error => { logger.error("Shutdown failed", error); process.exitCode = 1; }); });

bootstrap().catch(async error => {
  logger.error("Bootstrap failed", error);
  try { await app.close(); } catch (closeError) { logger.error("Cleanup after bootstrap failure failed", closeError); }
  process.exitCode = 1;
});
