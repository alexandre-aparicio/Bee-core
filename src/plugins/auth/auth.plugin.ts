import type { BeePlugin } from "../../core/types.js";
import jwt from "@fastify/jwt";
import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { createHash, randomBytes, randomUUID } from "node:crypto";

type ClientType = "backend" | "dashboard" | "public";
type Role = "admin" | "user" | "service";
type UserRecord = { id: string; email: string; passwordHash: string; roles: Role[]; enabled: boolean; allowedClients: ClientType[] };
type LoginBody = { email?: string; password?: string; client?: ClientType };
type RefreshBody = { refreshToken?: string };
const validClients: ClientType[] = ["backend", "dashboard", "public"];
const publicUser = (u: UserRecord) => ({ id: u.id, email: u.email, roles: u.roles, allowedClients: u.allowedClients });
const clientFrom = (v: unknown): ClientType | null => validClients.includes(v as ClientType) ? v as ClientType : null;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const makeRefreshToken = () => randomBytes(48).toString("base64url");

export const authPlugin: BeePlugin = {
  manifest: {
    name: "auth",
    version: "0.2.0",
    description: "Persistent authentication for backend, dashboard and public frontend clients"
  },
  async initialize(ctx) {
    const secret = String(ctx.config.jwtSecret ?? "");
    const databaseUrl = String(ctx.config.databaseUrl ?? "");
    if (secret.length < 32) throw new Error("Auth: JWT_SECRET must contain at least 32 characters.");
    if (!databaseUrl) throw new Error("Auth: DATABASE_URL is required.");
    await ctx.server.register(jwt, { secret, sign: { expiresIn: "20m" } });

    const pool = new Pool({ connectionString: databaseUrl, max: 10 });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bee_auth_users (
        id TEXT PRIMARY PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        roles TEXT[] NOT NULL DEFAULT ARRAY['user']::TEXT[],
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        allowed_clients TEXT[] NOT NULL DEFAULT ARRAY['dashboard','public']::TEXT[],
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS bee_auth_refresh_sessions (
        id UUID PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES bee_auth_users(id) ON DELETE CASCADE,
        token_hash TEXT UNIQUE NOT NULL,
        client TEXT NOT NULL CHECK (client IN ('backend','dashboard','public')),
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS bee_auth_sessions_user_idx ON bee_auth_refresh_sessions(user_id);
      CREATE INDEX IF NOT EXISTS bee_auth_sessions_expiry_idx ON bee_auth_refresh_sessions(expires_at);
    `);

    const adminEmail = String(ctx.config.authAdminEmail ?? "").trim().toLowerCase();
    const adminPassword = String(ctx.config.authAdminPassword ?? "");
    if (adminEmail && adminPassword) {
      if (adminPassword.length < 12) throw new Error("Auth: bootstrap admin password must be at least 12 characters.");
      const hash = await bcrypt.hash(adminPassword, 12);
      await pool.query(
        "INSERT INTO bee_auth_users (id,email,password_hash,roles,enabled,allowed_clients) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(email) DO NOTHING",
        ["bootstrap-admin", adminEmail, hash, ["admin"], true, validClients]
      );
      ctx.logger.info("Auth bootstrap administrator ensured (existing account credentials are not overwritten).");
    }

    const issueAccessToken = (user: Pick<UserRecord, "id" | "email" | "roles">, client: ClientType) =>
      ctx.server.jwt.sign({ sub: user.id, email: user.email, roles: user.roles, client, aud: "bee-core" });

    ctx.server.post<{ Body: LoginBody }>("/auth/login", async (req, reply) => {
      const email = String(req.body?.email ?? "").trim().toLowerCase();
      const password = String(req.body?.password ?? "");
      const client = clientFrom(req.body?.client);
      if (!email || !password || !client) return reply.code(400).send({ error: "email, password and valid client required" });
      const result = await pool.query(
        'SELECT id,email,password_hash AS "passwordHash",roles,enabled,allowed_clients AS "allowedClients" FROM bee_auth_users WHERE email=$1 AND enabled=TRUE LIMIT 1',
        [email]
      );
      const user = result.rows[0] as UserRecord | undefined;
      if (!user || !(await bcrypt.compare(password, user.passwordHash))) return reply.code(401).send({ error: "Invalid credentials" });
      if (!user.allowedClients.includes(client)) return reply.code(403).send({ error: "Client access denied" });
      const accessToken = issueAccessToken(user, client);
      const refreshToken = makeRefreshToken();
      await pool.query(
        "INSERT INTO bee_auth_refresh_sessions (id,user_id,token_hash,client,expires_at) VALUES ($1,$2,$3,$4,NOW()+INTERVAL '30 days')",
        [randomUUID(), user.id, hashToken(refreshToken), client]
      );
      await ctx.events.emit("auth.login", { userId: user.id, client, at: new Date().toISOString() });
      return { accessToken, refreshToken, tokenType: "Bearer", expiresIn: 1200, refreshExpiresIn: 2592000, user: publicUser(user), client };
    });

    ctx.server.post<{ Body: RefreshBody }>("/auth/refresh", async (req, reply) => {
      const raw = String(req.body?.refreshToken ?? "");
      if (raw.length < 40) return reply.code(400).send({ error: "refreshToken required" });
      const connection = await pool.connect();
      try {
        await connection.query("BEGIN");
        const result = await connection.query(
          "SELECT s.id,s.user_id,s.client,s.expires_at,u.email,u.roles,u.enabled,u.allowed_clients FROM bee_auth_refresh_sessions s JOIN bee_auth_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>NOW() FOR UPDATE",
          [hashToken(raw)]
        );
        const session = result.rows[0];
        if (!session || !session.enabled || !session.allowed_clients.includes(session.client)) {
          await connection.query("ROLLBACK");
          return reply.code(401).send({ error: "Invalid or expired refresh token" });
        }
        const nextRefresh = makeRefreshToken();
        await connection.query("UPDATE bee_auth_refresh_sessions SET token_hash=$1,expires_at=NOW()+INTERVAL '30 days' WHERE id=$2", [hashToken(nextRefresh), session.id]);
        await connection.query("COMMIT");
        const accessToken = issueAccessToken({ id: session.user_id, email: session.email, roles: session.roles }, session.client);
        return { accessToken, refreshToken: nextRefresh, tokenType: "Bearer", expiresIn: 1200, refreshExpiresIn: 2592000, client: session.client };
      } catch (error) {
        await connection.query("ROLLBACK");
        ctx.logger.error("Auth refresh failed", error);
        return reply.code(500).send({ error: "Refresh failed" });
      } finally {
        connection.release();
      }
    });

    ctx.server.get("/auth/me", async (req, reply) => {
      try {
        await req.jwtVerify();
        const claims = req.user as { sub?: string; email?: string; roles?: Role[]; client?: ClientType; aud?: string };
        if (claims.aud !== "bee-core" || !claims.sub || !claims.client) return reply.code(401).send({ error: "Unauthorized" });
        return { authenticated: true, user: { id: claims.sub, email: claims.email, roles: claims.roles }, client: claims.client };
      } catch {
        return reply.code(401).send({ error: "Unauthorized" });
      }
    });

    ctx.server.post<{ Body: RefreshBody }>("/auth/logout", async (req, reply) => {
      try {
        await req.jwtVerify();
        const raw = String(req.body?.refreshToken ?? "");
        if (raw) await pool.query("UPDATE bee_auth_refresh_sessions SET revoked_at=NOW() WHERE token_hash=$1 AND revoked_at IS NULL", [hashToken(raw)]);
        return { success: true, message: "Refresh session revoked. Current access token expires within 20 minutes." };
      } catch {
        return reply.code(401).send({ error: "Unauthorized" });
      }
    });

    ctx.server.addHook("onClose", async () => { await pool.end(); });
    ctx.logger.info("Auth plugin initialized", { clients: validClients, persistence: "postgresql", refreshRotation: true });
  }
};
