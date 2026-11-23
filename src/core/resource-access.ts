import type { Db } from "mongodb";

export type ResourcePermission = "read" | "write" | "delete" | string;
export type TeamResourceGrant = { teamId: string; permissions: string[] };
export type UserResourceOverride = { userId: string; effect: "allow" | "deny"; permissions: string[] };
export type ResourceAccessPolicy = {
  tenantId: string; pluginId: string; resourceType: string; resourceId: string;
  teamGrants: TeamResourceGrant[]; userOverrides: UserResourceOverride[];
  updatedAt: Date; updatedBy: string;
};

/**
 * Returns null when a resource has no explicit policy (preserve the plugin's
 * tenant-level permission behavior), otherwise returns the resource decision.
 * Explicit user denials win over grants from every team the user belongs to.
 */
export async function evaluateResourceAccess(
  db: Db,
  input: { tenantId: string; userId: string; pluginId: string; resourceType: string; resourceId: string; permission: ResourcePermission; ancestorResourceIds?: string[]; ancestorResources?: Array<{resourceType:string;resourceId:string}> }
): Promise<boolean | null> {
  const resourceRefs = [{resourceType:input.resourceType,resourceId:input.resourceId},...(input.ancestorResourceIds??[]).map(resourceId=>({resourceType:input.resourceType,resourceId})),...(input.ancestorResources??[])];
  const uniqueRefs = [...new Map(resourceRefs.filter(item=>item.resourceId&&item.resourceType).map(item=>[item.resourceType+":"+item.resourceId,item])).values()];
  const policies = await db.collection<ResourceAccessPolicy>("resource_access_policies").find({tenantId:input.tenantId,pluginId:input.pluginId,$or:uniqueRefs.map(item=>({resourceType:item.resourceType,resourceId:item.resourceId}))}).toArray();
  if (!policies.length) return null;
  const overrides = policies.flatMap(policy => policy.userOverrides.filter(item => item.userId === input.userId && item.permissions.includes(input.permission)));
  if (overrides.some(item => item.effect === "deny")) return false;
  if (overrides.some(item => item.effect === "allow")) return true;
  const memberships = await db.collection<{tenantId:string;teamId:string;userId:string}>("company_team_members")
    .find({ tenantId: input.tenantId, userId: input.userId }, { projection: { teamId: 1 } }).toArray();
  const memberTeamIds = [...new Set(memberships.map(item => item.teamId))];
  if (!memberTeamIds.length) return false;
  const activeTeams = await db.collection<{id:string;tenantId:string;status:string}>("company_teams")
    .find({tenantId:input.tenantId,id:{$in:memberTeamIds},status:"active"},{projection:{id:1}}).toArray();
  const activeIds = activeTeams.map(item=>item.id);
  if (!activeIds.length) return false;
  const assigned = await db.collection<{teamId:string}>("team_app_assignments")
    .find({tenantId:input.tenantId,pluginId:input.pluginId,teamId:{$in:activeIds},enabled:true},{projection:{teamId:1}}).toArray();
  const enabledTeamIds = new Set(assigned.map(item=>item.teamId));
  return policies.some(policy => policy.teamGrants.some(grant => enabledTeamIds.has(grant.teamId) && grant.permissions.includes(input.permission)));
}
