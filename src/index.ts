import Fastify from "fastify";
import { BeeEventBus } from "./core/event-bus.js";
import { BeePluginManager } from "./core/plugin-manager.js";
import type { BeeContext, BeeLogger } from "./core/types.js";
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
