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


const templatePreview=(id:string):string=>{
 const palettes:Record<string,string[]>={aurora:["#17152f","#29254d","#a78bfa","#f5f3ff"],editorial:["#f3eee5","#ded1c0","#b45e43","#29251f"],studio:["#f8f7f4","#e9ddd1","#ef805f","#292929"],midnight:["#090d18","#171f32","#8c72ff","#e8eaf5"],paper:["#f4f5f7","#ffffff","#64748b","#1e293b"],glass:["#dce8f8","#ffffff","#7776d8","#293451"]};
 const p=palettes[id];if(!p)return "";return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600"><rect width="960" height="600" fill="${p[0]}"/><rect width="190" height="600" fill="${p[1]}"/><circle cx="38" cy="36" r="13" fill="${p[2]}"/><rect x="65" y="29" width="95" height="12" rx="5" fill="${p[3]}" opacity=".8"/><rect x="225" y="36" width="300" height="22" rx="6" fill="${p[3]}" opacity=".8"/><rect x="225" y="100" width="205" height="105" rx="12" fill="${p[1]}"/><rect x="450" y="100" width="205" height="105" rx="12" fill="${p[1]}"/><rect x="675" y="100" width="245" height="105" rx="12" fill="${p[1]}"/><rect x="225" y="225" width="430" height="285" rx="14" fill="${p[1]}"/><rect x="675" y="225" width="245" height="285" rx="14" fill="${p[1]}"/><path d="M250 445 L325 375 L400 415 L480 315 L555 350 L635 270" fill="none" stroke="${p[2]}" stroke-width="7"/></svg>`;
};
app.get("/templates/previews/:id.svg",async(request,reply)=>{const {id}=request.params as {id:string};const svg=templatePreview(id);if(!svg)return reply.code(404).send({error:"Template preview not found"});return reply.type("image/svg+xml; charset=utf-8").header("Cache-Control","public, max-age=86400").send(svg);});

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
