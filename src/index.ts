import Fastify from "fastify";
import websocket from "@fastify/websocket";
import jwt from "@fastify/jwt";
import { MongoClient } from "mongodb";
import { BeeEventBus } from "./core/event-bus.js";
import { BeePluginManager } from "./core/plugin-manager.js";
import { validateEnvironment } from "./core/environment.js";
import type { BeeContext, BeeLogger } from "./core/types.js";
import { helloPlugin } from "./plugins/hello.plugin.js";
import { authPlugin } from "./plugins/auth/auth.plugin.js";
import { organizationsPlugin } from "./plugins/organizations/organizations.plugin.js";
import { filesPlugin } from "./plugins/files/files.plugin.js";
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
    billingWebhookSecret: process.env.BEE_BILLING_WEBHOOK_SECRET ?? "",
    publicBaseDomain: process.env.PUBLIC_BASE_DOMAIN ?? "beecore.beeprojects.net"
  })
};

plugins.register(helloPlugin);
plugins.register(authPlugin);
plugins.register(organizationsPlugin);
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
app.get("/", async () => ({
  name: "Bee-Core",
  slogan: "All Is a Plugin",
  version: ctx.version,
  status: "running",
  endpoints: ["/health", "/plugins", "/auth/login", "/auth/refresh", "/auth/me", "/auth/logout"]
}));

async function bootstrap(): Promise<void> {
  await mongoClient.connect();
  await plugins.mountAll(ctx);
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
