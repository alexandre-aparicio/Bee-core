import type { Db } from "mongodb";
import { applyPermissionRestrictions, permissionsForCustomRole, type CustomRolePolicy } from "./role-policy.js";
import { unmaskTenantId, unmaskUserId } from "./session-id.js";
import { CORE_PERMISSION_KEYS, getTenantPluginPermissionCatalog } from "./permission-catalog.js";

export type CompanyRole = "super_admin" | "owner" | "admin" | "manager" | "member" | "guest";
export type MembershipRole = CompanyRole | "custom";
export type TenantClaims = {
  sub?: string;
  email?: string;
  tenantRef?: string;
  sid?: string;
  client?: "backend" | "dashboard" | "public";
  aud?: string;
};

export const COMPANY_ROLE_PERMISSIONS: Record<CompanyRole, readonly string[]> = {
  super_admin: ["members.read", "members.invite", "members.manage", "plugins.read", "plugins.install", "plugins.manage", "billing.manage", "files.read", "files.write", "documents.read", "documents.write", "mail.read", "mail.send", "mail.manage"],
  owner: ["members.read", "members.invite", "members.manage", "plugins.read", "plugins.install", "plugins.manage", "billing.manage", "files.read", "files.write", "documents.read", "documents.write", "mail.read", "mail.send", "mail.manage"],
  admin: ["members.read", "members.invite", "members.manage", "plugins.read", "plugins.install", "plugins.manage", "files.read", "files.write", "documents.read", "documents.write", "mail.read", "mail.send", "mail.manage"],
  manager: ["members.read", "plugins.read", "files.read", "files.write", "documents.read", "documents.write", "mail.read", "mail.send"],
  member: ["members.read", "plugins.read", "files.read", "documents.read", "mail.read"],
  guest: ["plugins.read"]
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
  options: TenantContextOptions = {},
  sessionIdSecret: string = String(process.env.JWT_SECRET ?? "")
): Promise<TenantContext | null> {
  if (claims.aud !== "bee-core" || !claims.sub || !claims.tenantRef || !claims.sid || !claims.client) {
    return null;
  }

  const now = new Date();
  const session = await db.collection<{ id:string; userId:string; tenantId:string; client?:string; expiresAt:Date; revokedAt:Date|null; mfaVerifiedAt?:Date }>("refresh_sessions").findOne({
    id: claims.sid,
    revokedAt: null,
    expiresAt: { $gt: now }
  });
  if (!session || session.client !== claims.client) return null;
  let userId: string;
  let tenantId: string;
  const sessionContext={sessionId:session.id,expiresAt:session.expiresAt};
  try {
    userId = unmaskUserId(claims.sub, sessionContext, sessionIdSecret);
    tenantId = unmaskTenantId(claims.tenantRef, sessionContext, sessionIdSecret);
  } catch { return null; }
  if (!userId || userId !== session.userId) return null;
  const users = db.collection<{ id: string; email: string; enabled: boolean; allowedClients?: string[]; platformRole?: string; mfaSecretEnc?: string }>("users");
  const user = await users.findOne({ id: userId, enabled: true });
  if (!user || !Array.isArray(user.allowedClients) || !user.allowedClients.includes(claims.client)) return null;
  if (!tenantId || tenantId !== session.tenantId) return null;

  const membership = await db.collection<{ role: MembershipRole; customRoleId?: string; restrictionRoleIds?: string[]; status: string }>("memberships").findOne({
    userId: user.id,
    tenantId,
    status: "active"
  });
  if (!membership) return null;
  if (membership.role === "super_admin" || user.platformRole === "superadmin") {
    if (membership.role === "super_admin") {
      const superOrganization = await db.collection<{ id:string; kind?:string }>("tenants").findOne({ id: tenantId, kind: "super" });
      if (!superOrganization) return null;
    }
    if (!user.mfaSecretEnc || !session.mfaVerifiedAt || session.mfaVerifiedAt.getTime() > now.getTime() || now.getTime() - session.mfaVerifiedAt.getTime() > 15 * 60 * 1000) return null;
  }
  const pluginPermissionCatalog = await getTenantPluginPermissionCatalog(db, tenantId);
  const availablePermissionKeys = [...CORE_PERMISSION_KEYS, ...pluginPermissionCatalog.map(permission => permission.key)];
  let permissions: readonly string[];
  if (membership.role === "custom") {
    if (!membership.customRoleId) return null;
    const customRole = await db.collection<CustomRolePolicy>("company_roles").findOne({ id: membership.customRoleId, tenantId });
    if (!customRole || customRole.mode === "restriction") return null;
    try { const permissionPolicy = await db.collection<{id:string;tenantAssignablePermissions:string[]}>("platform_permission_policies").findOne({id:"global"},{projection:{tenantAssignablePermissions:1}}); const defaultAllowed = [...CORE_PERMISSION_KEYS, ...pluginPermissionCatalog.filter(permission => permission.customRoleAssignable).map(permission => permission.key)]; const allowed = Array.isArray(permissionPolicy?.tenantAssignablePermissions) ? permissionPolicy.tenantAssignablePermissions : defaultAllowed; permissions = permissionsForCustomRole(customRole, allowed.filter(key => availablePermissionKeys.includes(key))); } catch { return null; }
  } else {
    if (!Object.prototype.hasOwnProperty.call(COMPANY_ROLE_PERMISSIONS, membership.role)) return null;
    const rolePermissions = COMPANY_ROLE_PERMISSIONS[membership.role];
    const grantRole = membership.role === "super_admin" ? "owner" : membership.role;
    const pluginGrants = pluginPermissionCatalog.filter(permission => grantRole !== "guest" && permission.defaultGrants?.[grantRole as "owner" | "admin" | "manager" | "member"]);
    permissions = [...rolePermissions, ...pluginGrants.map(permission => permission.key)];
  }

  const restrictionRoleIds = Array.isArray(membership.restrictionRoleIds) ? [...new Set(membership.restrictionRoleIds)] : [];
  if (restrictionRoleIds.length) {
    // Owner and super_admin are protected system identities, never constrained
    // by tenant-authored role documents.
    if (membership.role === "owner" || membership.role === "super_admin") return null;
    const restrictionRoles = await db.collection<CustomRolePolicy>("company_roles")
      .find({ id: { $in: restrictionRoleIds }, tenantId, mode: "restriction" }).toArray();
    if (restrictionRoles.length !== restrictionRoleIds.length) return null;
    try { permissions = applyPermissionRestrictions(permissions, restrictionRoles, availablePermissionKeys); } catch { return null; }
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
