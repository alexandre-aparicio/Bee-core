import type { BeePlugin } from "../../core/types.js";
import jwt from "@fastify/jwt";
import bcrypt from "bcryptjs";

type ClientType = "backend" | "dashboard" | "public";
type Role = "admin" | "user" | "service";
type UserRecord = { id: string; email: string; passwordHash: string; roles: Role[]; enabled: boolean; allowedClients: ClientType[] };
type LoginBody = { email?: string; password?: string; client?: ClientType };

const users: UserRecord[] = [];
const validClients: ClientType[] = ["backend", "dashboard", "public"];
const publicUser = (u: UserRecord) => ({ id: u.id, email: u.email, roles: u.roles, allowedClients: u.allowedClients });
const clientFrom = (v: unknown): ClientType | null => validClients.includes(v as ClientType) ? v as ClientType : null;

export const authPlugin: BeePlugin = {
  manifest: {
    name: "auth",
    version: "0.1.0",
    description: "Authentication for backend, dashboard and public frontend clients"
  },
  async initialize(ctx) {
    const secret = String(ctx.config.jwtSecret ?? "");
    if (secret.length < 32) throw new Error("Auth: JWT_SECRET must contain at least 32 characters.");
    await ctx.server.register(jwt, { secret, sign: { expiresIn: "20m" } });

    const adminEmail = String(ctx.config.authAdminEmail ?? "").trim().toLowerCase();
    const adminPassword = String(ctx.config.authAdminPassword ?? "");
    if (adminEmail && adminPassword) {
      if (adminPassword.length < 12) throw new Error("Auth: bootstrap admin password must be at least 12 characters.");
      if (!users.some(u => u.email === adminEmail)) users.push({
        id: "bootstrap-admin",
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPassword, 12),
        roles: ["admin"],
        enabled: true,
        allowedClients: validClients
      });
      ctx.logger.warn("Bootstrap admin loaded. User storage is in-memory for this prototype.");
    }

    ctx.server.post<{ Body: LoginBody }>("/auth/login", async (req, reply) => {
      const email = String(req.body?.email ?? "").trim().toLowerCase();
      const password = String(req.body?.password ?? "");
      const client = clientFrom(req.body?.client);
      if (!email || !password || !client) return reply.code(400).send({ error: "email, password and valid client required" });
      const user = users.find(u => u.email === email && u.enabled);
      if (!user || !(await bcrypt.compare(password, user.passwordHash))) return reply.code(401).send({ error: "Invalid credentials" });
      if (!user.allowedClients.includes(client)) return reply.code(403).send({ error: "Client access denied" });
      const accessToken = ctx.server.jwt.sign({ sub: user.id, email, roles: user.roles, client, aud: "bee-core" });
      await ctx.events.emit("auth.login", { userId: user.id, client, at: new Date().toISOString() });
      return { accessToken, tokenType: "Bearer", expiresIn: 1200, user: publicUser(user), client };
    });

    ctx.server.get("/auth/me", async (req, reply) => {
      try {
        await req.jwtVerify();
        const claims = req.user as { sub?: string; email?: string; roles?: Role[]; client?: ClientType };
        return { authenticated: true, user: { id: claims.sub, email: claims.email, roles: claims.roles }, client: claims.client };
      } catch {
        return reply.code(401).send({ error: "Unauthorized" });
      }
    });

    ctx.server.post("/auth/logout", async (req, reply) => {
      try {
        await req.jwtVerify();
        return { success: true, message: "Discard the access token client-side. Token revocation is not implemented yet." };
      } catch {
        return reply.code(401).send({ error: "Unauthorized" });
      }
    });
    ctx.logger.info("Auth plugin initialized", { clientTypes: validClients });
  }
};
