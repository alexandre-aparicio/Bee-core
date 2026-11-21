import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { MongoClient, type Db } from "mongodb";
import { BeeEventBus } from "./core/event-bus.js";
import { BeePluginManager } from "./core/plugin-manager.js";
import type { BeeContext, BeeLogger } from "./core/types.js";
import { transformSessionResourceIds } from "./core/session-id.js";
import { helloPlugin } from "./plugins/hello.plugin.js";
import { authPlugin } from "./plugins/auth/auth.plugin.js";
import { organizationsPlugin } from "./plugins/organizations/organizations.plugin.js";
import { filesPlugin } from "./plugins/files/files.plugin.js";
import { marketplacePlugin } from "./plugins/marketplace/marketplace.plugin.js";
import { notesPlugin } from "./plugins/notes/notes.plugin.js";
import { platformAdminPlugin } from "./plugins/platform-admin/platform-admin.plugin.js";

const logger: BeeLogger = {
  info: (message, context) => console.log("[INFO]", message, context ?? ""),
  warn: (message, context) => console.warn("[WARN]", message, context ?? ""),
  error: (message, context) => console.error("[ERROR]", message, context ?? "")
};
const events = new BeeEventBus();
const plugins = new BeePluginManager();
const app = Fastify({ logger: false });
const jwtSecret = String(process.env.JWT_SECRET ?? "");
if (jwtSecret.length < 32) throw new Error("JWT_SECRET must contain at least 32 characters.");
app.register(jwt, { secret: jwtSecret, sign: { expiresIn: "20m" } });

let sessionDb: Db | undefined;
const resourceIdSecret = jwtSecret;

app.addHook("preValidation", async (request, reply) => {
  if (!request.headers.authorization) return;
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
  const claims = request.user as { sid?: string; aud?: string; client?: string };
  if (claims.aud !== "bee-core" || !claims.sid || !sessionDb) {
    return reply.code(401).send({ error: "Active session required" });
  }
  const session = await sessionDb.collection<{ id: string; expiresAt: Date; revokedAt: Date | null }>("refresh_sessions").findOne({
    id: claims.sid, revokedAt: null, expiresAt: { $gt: new Date() }
  });
  if (!session || !(session.expiresAt instanceof Date)) return reply.code(401).send({ error: "Session expired or revoked" });
  const sessionContext = { sessionId: session.id, expiresAt: session.expiresAt };
  (request as any).__beeSessionIdContext = sessionContext;
  try {
    if (request.params && typeof request.params === "object") {
      (request as any).params = transformSessionResourceIds(request.params, "unmask", sessionContext, resourceIdSecret);
    }
    if (request.query && typeof request.query === "object") {
      (request as any).query = transformSessionResourceIds(request.query, "unmask", sessionContext, resourceIdSecret);
    }
    if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) {
      (request as any).body = transformSessionResourceIds(request.body, "unmask", sessionContext, resourceIdSecret);
    }
  } catch {
    return reply.code(400).send({ error: "Invalid, expired, or session-mismatched resource reference" });
  }
});

app.addHook("preSerialization", async (request, _reply, payload) => {
  const sessionContext = (request as any).__beeSessionIdContext as { sessionId: string; expiresAt: Date } | undefined;
  if (!sessionContext || !payload || typeof payload !== "object" || Buffer.isBuffer(payload)) return payload;
  return transformSessionResourceIds(payload, "mask", sessionContext, resourceIdSecret);
});

const ctx: BeeContext = {
  appName: "Bee-Core",
  version: "0.3.1",
  events,
  logger,
  server: app,
  config: Object.freeze({
    environment: process.env.NODE_ENV ?? "development",
    jwtSecret,
    mongoUri: process.env.MONGODB_URI ?? "",
    mongoDbName: process.env.MONGODB_DB ?? "bee_core",
    authAdminEmail: process.env.AUTH_ADMIN_EMAIL ?? "",
    authAdminPassword: process.env.AUTH_ADMIN_PASSWORD ?? "",
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

app.get("/health", async () => ({ status: "ok", name: ctx.appName, version: ctx.version, uptime: process.uptime() }));
app.get("/plugins", async () => ({ plugins: plugins.list() }));
app.get("/", async () => ({
  name: "Bee-Core", slogan: "All Is a Plugin", version: ctx.version, status: "running",
  endpoints: ["/health", "/plugins", "/auth/login", "/auth/refresh", "/auth/me", "/auth/logout"]
}));

async function bootstrap() {
  const mongoUri = String(ctx.config.mongoUri ?? "");
  if (!mongoUri) throw new Error("MONGODB_URI is required.");
  const sessionMongo = new MongoClient(mongoUri, { maxPoolSize: 5, serverSelectionTimeoutMS: 10000 });
  await sessionMongo.connect();
  sessionDb = sessionMongo.db(String(ctx.config.mongoDbName ?? "bee_core"));
  app.addHook("onClose", async () => { await sessionMongo.close(); });
  await plugins.mountAll(ctx);
  await events.emit("bee.started", { at: new Date().toISOString() });
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";
  await app.listen({ port, host });
  logger.info(`Bee-Core listening at http://${host}:${port}`);
}

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal}, shutting down`);
  await plugins.stopAll(ctx);
  await app.close();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
bootstrap().catch(error => {
  logger.error("Bootstrap failed", error);
  process.exit(1);
});
