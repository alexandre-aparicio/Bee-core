import Fastify from "fastify";
import { BeeEventBus } from "./core/event-bus.js";
import { BeePluginManager } from "./core/plugin-manager.js";
import type { BeeContext, BeeLogger } from "./core/types.js";
import { helloPlugin } from "./plugins/hello.plugin.js";
import { authPlugin } from "./plugins/auth/auth.plugin.js";

const logger: BeeLogger = {
  info: (message, context) => console.log("[INFO]", message, context ?? ""),
  warn: (message, context) => console.warn("[WARN]", message, context ?? ""),
  error: (message, context) => console.error("[ERROR]", message, context ?? "")
};

const events = new BeeEventBus();
const plugins = new BeePluginManager();
const app = Fastify({ logger: false });
const ctx: BeeContext = {
  appName: "Bee-Core",
  version: "0.2.0",
  events,
  logger,
  server: app,
  config: Object.freeze({
    environment: process.env.NODE_ENV ?? "development",
    jwtSecret: process.env.JWT_SECRET ?? "",
    authAdminEmail: process.env.AUTH_ADMIN_EMAIL ?? "",
    authAdminPassword: process.env.AUTH_ADMIN_PASSWORD ?? ""
  })
};

plugins.register(helloPlugin);
plugins.register(authPlugin);

app.get("/health", async () => ({
  status: "ok",
  name: ctx.appName,
  version: ctx.version,
  uptime: process.uptime()
}));

app.get("/plugins", async () => ({ plugins: plugins.list() }));

app.get("/", async () => ({
  name: "Bee-Core",
  slogan: "All Is a Plugin",
  version: ctx.version,
  status: "running",
  endpoints: ["/health", "/plugins", "/auth/login", "/auth/me", "/auth/logout"]
}));

async function bootstrap() {
  await plugins.initializeAll(ctx);
  await plugins.startAll(ctx);
  await events.emit("bee.started", { at: new Date().toISOString() });
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";
  await app.listen({ port, host });
  logger.info(`Bee-Core listening at http://${host}:${port}`);
}

const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down`);
  await app.close();
  await plugins.stopAll(ctx);
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

bootstrap().catch(error => {
  logger.error("Bootstrap failed", error);
  process.exit(1);
});
