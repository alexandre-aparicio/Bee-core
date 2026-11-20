import type { Db } from "mongodb";\nimport { permissionsForCustomRole, type CustomRolePolicy } from "./role-policy.js";

export type CompanyRole = "owner" | "admin" | "manager" | "member";\nexport type MembershipRole = CompanyRole | "custom";
export type TenantClaims = {
  sub?: string;
  email?: string;
  tenantId?: string;
  sid?: string;
  client?: "backend" | "dashboard" | "public";
  aud?: string;
};

export const COMPANY_ROLE_PERMISSIONS: Record<CompanyRole, readonly string[]> = {
  owner: ["members.read", "members.invite", "members.manage", "plugins.read", "plugins.install", "plugins.manage", "billing.manage", "files.read", "files.write", "notes.read", "notes.write"],
  admin: ["members.read", "members.invite", "members.manage", "plugins.read", "plugins.install", "plugins.manage", "files.read", "files.write", "notes.read", "notes.write"],
  manager: ["members.read", "plugins.read", "files.read", "files.write", "notes.read", "notes.write"],
  member: ["members.read", "plugins.read", "files.read", "notes.read"]
};

export type TenantContext = {
  userId: string;
  email: string;
  tenantId: string;
  sessionId: string;
  client: NonNullable<TenantClaims["client"]>;
  role: CompanyRole;
  permissions: readonly string[];
};

export type TenantContextOptions = {
  allowSuspendedCompany?: boolean;
};

/**
 * Resolve company identity only from a verified JWT and the persisted session.
 * The caller must run Fastify's jwtVerify() before passing request.user here.
 */
export async function resolveTenantContext(
  db: Db,
  claims: TenantClaims,
  options: TenantContextOptions = {}
): Promise<TenantContext | null> {
  if (claims.aud !== "bee-core" || !claims.sub || !claims.tenantId || !claims.sid || !claims.client) {
    return null;
  }

  const now = new Date();
  const users = db.collection<{ id: string; email: string; enabled: boolean; allowedClients?: string[] }>("users");
  const user = await users.findOne({ id: claims.sub, enabled: true });
  if (!user || !Array.isArray(user.allowedClients) || !user.allowedClients.includes(claims.client)) return null;

  const session = await db.collection("refresh_sessions").findOne({
    id: claims.sid,
    userId: user.id,
    tenantId: claims.tenantId,
    revokedAt: null,
    expiresAt: { $gt: now }
  });
  if (!session) return null;

  const membership = await db.collection<{ role: MembershipRole; customRoleId?: string; status: string }>("memberships").findOne({
    userId: user.id,
    tenantId: claims.tenantId,
    status: "active"
  });
  if (!membership) return null;\n  let permissions: readonly string[];\n  if (membership.role === "custom") {\n    if (!membership.customRoleId) return null;\n    const customRole = await db.collection<CustomRolePolicy>("company_roles").findOne({ id: membership.customRoleId, tenantId: claims.tenantId });\n    if (!customRole) return null;\n    try { permissions = permissionsForCustomRole(customRole); } catch { return null; }\n  } else {\n    if (!Object.prototype.hasOwnProperty.call(COMPANY_ROLE_PERMISSIONS, membership.role)) return null;\n    permissions = COMPANY_ROLE_PERMISSIONS[membership.role];\n  }

  if (!options.allowSuspendedCompany) {
    const company = await db.collection<{ id: string; status?: string }>("tenants").findOne({ id: claims.tenantId });
    if (!company || company.status === "suspended") return null;
  }

  return {
    userId: user.id,
    email: user.email,
    tenantId: claims.tenantId,
    sessionId: claims.sid,
    client: claims.client,
    role: membership.role,
    permissions: COMPANY_ROLE_PERMISSIONS[membership.role]
  };
}

export function hasTenantPermission(context: TenantContext, permission: string): boolean {
  return context.permissions.includes(permission);
}
