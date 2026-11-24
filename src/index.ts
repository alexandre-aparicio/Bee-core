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
import { teamsPlugin } from "./plugins/teams/teams.plugin.js";
import { filesPlugin } from "./plugins/files/files.plugin.js";
import { documentsPlugin } from "./plugins/documents/documents.plugin.js";
import { connectedDevicesPlugin } from "./plugins/connected-devices/connected-devices.plugin.js";
import { timeTrackingPlugin } from "./plugins/time-tracking/time-tracking.plugin.js";
import { marketplacePlugin } from "./plugins/marketplace/marketplace.plugin.js";
import { notesPlugin } from "./plugins/notes/notes.plugin.js";
import { deliveriesPlugin } from "./plugins/deliveries/deliveries.plugin.js";
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
    billingWebhookSecret: process.env.BEE_BILLING_WEBHOOK_SECRET ?? "",
    publicBaseDomain: process.env.PUBLIC_BASE_DOMAIN ?? "beecore.beeprojects.net"
  })
};

plugins.register(helloPlugin);
plugins.register(authPlugin);
plugins.register(organizationsPlugin);
plugins.register(teamsPlugin);
plugins.register(filesPlugin);
plugins.register(documentsPlugin);
plugins.register(connectedDevicesPlugin);
plugins.register(timeTrackingPlugin);
plugins.register(marketplacePlugin);
plugins.register(notesPlugin);
plugins.register(deliveriesPlugin);
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
