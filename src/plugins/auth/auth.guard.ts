import type { FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "mongodb";
import type { BeeAuthClient } from "../../core/types.js";
import { hasTenantPermission, resolveTenantContext, type TenantContext, type TenantClaims } from "../../core/tenant-context.js";

type AuthClaims = TenantClaims & { roles?: string[]; client?: BeeAuthClient };
export type AuthenticatedRequest = FastifyRequest & {
  user: AuthClaims;
  tenantContext: TenantContext;
};

/**
 * Verify the JWT and re-resolve its company membership and persisted session.
 * Use this guard for every private business-plugin route; do not authorize from
 * the JWT roles array alone.
 */
export function requireAuth(db: Db, client?: BeeAuthClient, sessionIdSecret: string = String(process.env.JWT_SECRET ?? "")) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      const claims = request.user as AuthClaims;
      if (claims.aud !== "bee-core" || !claims.sub || !claims.client) {
        return reply.code(401).send({ error: "Invalid token" });
      }
      const context = await resolveTenantContext(db, claims, {}, sessionIdSecret);
      if (!context) return reply.code(401).send({ error: "Unauthorized or active company session required" });
      if (client && context.client !== client) {
        return reply.code(403).send({ error: "Token client context not allowed" });
      }
      (request as AuthenticatedRequest).tenantContext = context;
    } catch {
      return reply.code(401).send({ error: "Unauthorized" });
    }
  };
}

/** Check the active company role only; legacy/global JWT roles are not trusted. */
export function requireRoles(...allowed: TenantContext["role"][]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const context = (request as AuthenticatedRequest).tenantContext;
    if (!context || !allowed.includes(context.role)) {
      return reply.code(403).send({ error: "Insufficient company role" });
    }
  };
}

/** Require every listed permission from the active company's role policy. */
export function requireTenantPermissions(...permissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const context = (request as AuthenticatedRequest).tenantContext;
    if (!context || !permissions.every(permission => hasTenantPermission(context, permission))) {
      return reply.code(403).send({ error: "Insufficient company permissions" });
    }
  };
}
