import type { Db } from "mongodb";
import { applyPermissionRestrictions, permissionsForCustomRole, type CustomRolePolicy } from "./role-policy.js";
import { unmaskTenantId, unmaskUserId } from "./session-id.js";
import { composePermissionCatalog, CORE_PERMISSION_KEYS, CORE_PERMISSION_CATALOG, type PluginPermissionSource } from "./permission-catalog.js";

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
  super_admin: ["members.read", "members.invite", "members.manage", "plugins.read", "plugins.install", "plugins.manage", "billing.manage", "files.read", "files.write", "mail.read", "mail.send", "mail.manage"],
  owner: ["members.read", "members.invite", "members.manage", "plugins.read", "plugins.install", "plugins.manage", "billing.manage", "files.read", "files.write", "mail.read", "mail.send", "mail.manage"],
  admin: ["members.read", "members.invite", "members.manage", "plugins.read", "plugins.install", "plugins.manage", "files.read", "files.write", "mail.read", "mail.send", "mail.manage"],
  manager: ["members.read", "plugins.read", "files.read", "files.write", "mail.read", "mail.send"],
  member: ["members.read", "plugins.read", "files.read", "mail.read"],
  guest: ["plugins.read"]
};


export async function activeTenantPluginPermissionSources(db: Db, tenantId: string): Promise<PluginPermissionSource[]> {
  const tenant = await db.collection<{id:string;kind?:string}>("tenants").findOne({id:tenantId},{projection:{id:1,kind:1}});
  const installations = await db.collection<{pluginId:string}>("tenant_plugin_installations")
    .find({tenantId,status:"installed",enabled:{$ne:false}}).project<{pluginId:string}>({pluginId:1,_id:0}).toArray();
  const installedIds = [...new Set(installations.map(item=>item.pluginId))];
  if (!tenant || !installedIds.length) return [];
  const globalPackages = await db.collection<{pluginId:string}>("platform_plugin_packages")
    .find({pluginId:{$in:installedIds},status:"installed",globallyEnabled:{$ne:false}})
    .project<{pluginId:string}>({pluginId:1,_id:0}).toArray();
  const globallyAvailable = new Set(globalPackages.map(item=>item.pluginId));
  if (tenant.kind !== "super") {
    const subscription = await db.collection<{planId:string;status:string;currentPeriodEnd?:Date|null}>("tenant_subscriptions").findOne({tenantId});
    const activeSubscription = subscription && (subscription.status==="active"||subscription.status==="trial") && (!subscription.currentPeriodEnd||subscription.currentPeriodEnd>new Date());
    const plan = await db.collection<{includedPluginIds?:string[]}>("plugin_plans").findOne({id:activeSubscription?subscription!.planId:"starter"});
    const assignments = await db.collection<{pluginId:string}>("plugin_plan_package_assignments")
      .find({planId:activeSubscription?subscription!.planId:"starter"}).project<{pluginId:string}>({pluginId:1,_id:0}).toArray();
    const grants = await db.collection<{pluginId:string}>("tenant_plugin_entitlements").find({tenantId,status:"granted"}).project<{pluginId:string}>({pluginId:1,_id:0}).toArray();
    const purchases = await db.collection<{pluginId:string}>("plugin_purchases")
      .find({tenantId,status:"active",$or:[{expiresAt:null},{expiresAt:{$gt:new Date()}}]})
      .project<{pluginId:string}>({pluginId:1,_id:0}).toArray();
    const entitled = new Set([...(plan?.includedPluginIds??[]),...assignments.map(item=>item.pluginId),...grants.map(item=>item.pluginId),...purchases.map(item=>item.pluginId)]);
    for (const id of [...globallyAvailable]) if (!entitled.has(id)) globallyAvailable.delete(id);
  }
  if (!globallyAvailable.size) return [];
  return db.collection<PluginPermissionSource>("plugin_catalog")
    .find({id:{$in:[...globallyAvailable]},status:"published",permissions:{$exists:true}})
    .project<PluginPermissionSource>({id:1,permissions:1,_id:0}).toArray();
}

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
  const pluginPermissionSources = await activeTenantPluginPermissionSources(db, tenantId);
  const pluginPermissionCatalog = composePermissionCatalog(pluginPermissionSources);
  const pluginPermissionKeys = pluginPermissionCatalog.filter(item=>!CORE_PERMISSION_KEYS.includes(item.key)).map(item=>item.key);
  let permissions: readonly string[];
  if (membership.role === "custom") {
    if (!membership.customRoleId) return null;
    const customRole = await db.collection<CustomRolePolicy>("company_roles").findOne({ id: membership.customRoleId, tenantId });
    if (!customRole || customRole.mode === "restriction") return null;
    try { const permissionPolicy = await db.collection<{id:string;tenantAssignablePermissions:string[]}>("platform_permission_policies").findOne({id:"global"},{projection:{tenantAssignablePermissions:1}}); const allowed = permissionPolicy?.tenantAssignablePermissions; const coreAllowed = CORE_PERMISSION_CATALOG.filter(item=>item.customRoleAssignable).map(item=>item.key); permissions = permissionsForCustomRole(customRole, [...(Array.isArray(allowed) ? allowed : coreAllowed), ...pluginPermissionKeys]); } catch { return null; }
  } else {
    if (!Object.prototype.hasOwnProperty.call(COMPANY_ROLE_PERMISSIONS, membership.role)) return null;
    const roleKey = membership.role === "super_admin" ? "owner" : membership.role;
    const defaults = pluginPermissionSources.flatMap(source=>(source.permissions??[]).filter(permission=>permission.defaultGrants?.[roleKey as "owner"|"admin"|"manager"|"member"]).map(permission=>permission.key));
    permissions = [...COMPANY_ROLE_PERMISSIONS[membership.role], ...defaults];
  }

  const restrictionRoleIds = Array.isArray(membership.restrictionRoleIds) ? [...new Set(membership.restrictionRoleIds)] : [];
  if (restrictionRoleIds.length) {
    // Owner and super_admin are protected system identities, never constrained
    // by tenant-authored role documents.
    if (membership.role === "owner" || membership.role === "super_admin") return null;
    const restrictionRoles = await db.collection<CustomRolePolicy>("company_roles")
      .find({ id: { $in: restrictionRoleIds }, tenantId, mode: "restriction" }).toArray();
    if (restrictionRoles.length !== restrictionRoleIds.length) return null;
    try { permissions = applyPermissionRestrictions(permissions, restrictionRoles); } catch { return null; }
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
