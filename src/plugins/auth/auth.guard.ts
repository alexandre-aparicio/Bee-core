import type { FastifyReply, FastifyRequest } from "fastify";
import type { BeeAuthClient } from "../../core/types.js";

type AuthClaims = {
  sub?: string;
  email?: string;
  roles?: string[];
  client?: BeeAuthClient;
  aud?: string;
};

export type AuthenticatedRequest = FastifyRequest & { user: AuthClaims };

/** Verify a JWT and optionally restrict it to the client that is calling the route. */
export function requireAuth(client?: BeeAuthClient) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      const claims = request.user as AuthClaims;
      if (claims.aud !== "bee-core" || !claims.sub || !claims.client) {
        return reply.code(401).send({ error: "Invalid token" });
      }
      if (client && claims.client !== client) {
        return reply.code(403).send({ error: "Token client context not allowed" });
      }
    } catch {
      return reply.code(401).send({ error: "Unauthorized" });
    }
  };
}

/** Role check to use after requireAuth(). Admin implicitly passes every role gate. */
export function requireRoles(...allowed: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const claims = request.user as AuthClaims | undefined;
    const roles = claims?.roles ?? [];
    if (roles.includes("admin")) return;
    if (!allowed.some(role => roles.includes(role))) {
      return reply.code(403).send({ error: "Insufficient permissions" });
    }
  };
}
