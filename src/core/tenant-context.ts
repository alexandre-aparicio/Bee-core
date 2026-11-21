import type { Db } from "mongodb";
import { permissionsForCustomRole, type CustomRolePolicy } from "./role-policy.js";
import { unmaskTenantId } from "./session-id.js";

export type CompanyRole = "owner" | "admin" | "manager" | "member";
export type MembershipRole = CompanyRole | "custom";
export type TenantClaims = {
  sub?: string;
  email?: string;
  tenantRef?: string;
  /** Legacy claim accepted only during rolling migration; remove after all old sessions expire. */
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
  sessionExpiresAt: Date;
  client: NonNullable<TenantClaims["client"]>;
  role: MembershipRole;
  customRoleId?: string;
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
  if (claims.aud !== "bee-core" || !claims.sub || (!claims.tenantRef && !claims.tenantId) || !claims.sid || !claims.client) {
    return null;
  }

  const now = new Date();
  const users = db.collection<{ id: string; email: string; enabled: boolean; allowedClients?: string[] }>("users");
  const user = await users.findOne({ id: claims.sub, enabled: true });
  if (!user || !Array.isArray(user.allowedClients) || !user.allowedClients.includes(claims.client)) return null;

  const session = await db.collection<{ id:string; userId:string; tenantId:string; expiresAt:Date; revokedAt:Date|null }>("refresh_sessions").findOne({
    id: claims.sid,
    userId: user.id,
    revokedAt: null,
    expiresAt: { $gt: now }
  });
  if (!session) return null;
  let tenantId: string;
  try {
    tenantId = claims.tenantRef
      ? unmaskTenantId(claims.tenantRef, { sessionId: session.id, expiresAt: session.expiresAt }, String(process.env.JWT_SECRET ?? ""))
      : String(claims.tenantId ?? "");
  } catch { return null; }
  if (!tenantId || tenantId !== session.tenantId) return null;

  const membership = await db.collection<{ role: MembershipRole; customRoleId?: string; status: string }>("memberships").findOne({
    userId: user.id,
    tenantId,
    status: "active"
  });
  if (!membership) return null;
  let permissions: readonly string[];
  if (membership.role === "custom") {
    if (!membership.customRoleId) return null;
    const customRole = await db.collection<CustomRolePolicy>("company_roles").findOne({ id: membership.customRoleId, tenantId });
    if (!customRole) return null;
    try { permissions = permissionsForCustomRole(customRole); } catch { return null; }
  } else {
    if (!Object.prototype.hasOwnProperty.call(COMPANY_ROLE_PERMISSIONS, membership.role)) return null;
    permissions = COMPANY_ROLE_PERMISSIONS[membership.role];
  }

  if (!options.allowSuspendedCompany) {
    const company = await db.collection<{ id: string; status?: string }>("tenants").findOne({ id: tenantId });
    if (!company || company.status === "suspended") return null;
  }

  return {
    userId: user.id,
    email: user.email,
    tenantId,
    sessionId: claims.sid,
    sessionExpiresAt: session.expiresAt,
    client: claims.client,
    role: membership.role,
    ...(membership.customRoleId ? { customRoleId: membership.customRoleId } : {}),
    permissions
  };
}

export function hasTenantPermission(context: TenantContext, permission: string): boolean {
  return context.permissions.includes(permission);
}
