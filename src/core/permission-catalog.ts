import type { Db } from "mongodb";

/** Canonical permission keys currently enforced by Bee-Core Core modules. */
export type PermissionDefinition={key:string;module:string;resource:string;action:string;label:string;description:string;sensitive?:boolean;customRoleAssignable:boolean;defaultGrants?:{owner:boolean;admin:boolean;manager:boolean;member:boolean}};
export const CORE_PERMISSION_CATALOG:readonly PermissionDefinition[]=[
{key:"members.read",module:"organization",resource:"members",action:"read",label:"View members",description:"List members and inspect membership details.",customRoleAssignable:true},
{key:"members.invite",module:"organization",resource:"members",action:"invite",label:"Invite members",description:"Invite members, add existing accounts and manage invitations.",customRoleAssignable:true},
{key:"members.manage",module:"organization",resource:"members",action:"manage",label:"Manage memberships",description:"Change membership roles and suspend members.",customRoleAssignable:false,sensitive:true},
{key:"plugins.read",module:"plugins",resource:"plugins",action:"read",label:"View plugins",description:"Browse the organization's available plugins.",customRoleAssignable:true},
{key:"plugins.install",module:"plugins",resource:"plugins",action:"install",label:"Install plugins",description:"Install or activate available plugins.",customRoleAssignable:true},
{key:"plugins.manage",module:"plugins",resource:"plugins",action:"manage",label:"Manage plugins",description:"Change plugin configuration and lifecycle.",customRoleAssignable:false,sensitive:true},
{key:"billing.manage",module:"billing",resource:"billing",action:"manage",label:"Manage billing",description:"Manage plans, subscriptions and billing settings.",customRoleAssignable:false,sensitive:true},
{key:"files.read",module:"files",resource:"files",action:"read",label:"View files",description:"List and download organization files.",customRoleAssignable:true},
{key:"files.write",module:"files",resource:"files",action:"write",label:"Manage files",description:"Upload and modify organization files.",customRoleAssignable:true},
{key:"documents.read",module:"documents",resource:"documents",action:"read",label:"View documents",description:"Browse and download documents allowed by tenant and resource-level access.",customRoleAssignable:true},
{key:"documents.write",module:"documents",resource:"documents",action:"write",label:"Manage documents",description:"Create folders, register documents and manage publication.",customRoleAssignable:true},
{key:"mail.read",module:"mail",resource:"mail",action:"read",label:"Read mail",description:"Read connected mailbox messages.",customRoleAssignable:true},
{key:"mail.send",module:"mail",resource:"mail",action:"send",label:"Send mail",description:"Send messages through connected mailboxes.",customRoleAssignable:true},
{key:"mail.manage",module:"mail",resource:"mail",action:"manage",label:"Manage mailboxes",description:"Configure and manage organization mailboxes.",customRoleAssignable:false,sensitive:true}
] as const;
export const CORE_PERMISSION_KEYS=CORE_PERMISSION_CATALOG.map(item=>item.key) as readonly string[];


/** Permissions are visible only while their plugin is installed for this tenant. */
export async function getTenantPluginPermissionCatalog(db: Db, tenantId: string): Promise<PermissionDefinition[]> {
  const installations = await db.collection<{ pluginId: string; status: string }>("tenant_plugin_installations")
    .find({ tenantId, status: "installed" }, { projection: { pluginId: 1, _id: 0 } }).toArray();
  const pluginIds = [...new Set(installations.map(item => item.pluginId).filter(Boolean))];
  if (!pluginIds.length) return [];
  const packages = await db.collection<{ id: string; status: string; permissions?: PermissionDefinition[] }>("plugin_catalog")
    .find({ id: { $in: pluginIds }, status: "published" }, { projection: { id: 1, permissions: 1, _id: 0 } }).toArray();
  return packages.flatMap(pkg => Array.isArray(pkg.permissions)
    ? pkg.permissions.filter(permission => permission && permission.module === pkg.id && typeof permission.key === "string" && typeof permission.label === "string" && permission.defaultGrants).map(permission => ({ ...permission, customRoleAssignable: permission.customRoleAssignable !== false }))
    : []);
}
