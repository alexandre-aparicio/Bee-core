import type { BeePlugin } from "../../core/types.js";
import { randomUUID } from "node:crypto";
import { resolveTenantContext, hasTenantPermission } from "../../core/tenant-context.js";
import { isPluginInstalled } from "../../core/plugin-entitlements.js";
import { type ResourceAccessPolicy, type TeamResourceGrant, type UserResourceOverride } from "../../core/resource-access.js";
import { maskResourceId, unmaskResourceId } from "../../core/session-id.js";
import { appendTenantAuditEvent, ensureTenantAuditIndexes, type TenantAuditEvent } from "../../core/audit-log.js";

type Team = { id:string; tenantId:string; name:string; description:string; status:"active"|"archived"; parentTeamId?:string|null; createdAt:Date; updatedAt:Date; createdBy:string };
type TeamMember = { id:string; tenantId:string; teamId:string; userId:string; addedAt:Date; addedBy:string };
type TeamAppAssignment = { id:string; tenantId:string; teamId:string; pluginId:string; enabled:boolean; updatedAt:Date; updatedBy:string };
const clean = (value:unknown,max:number) => String(value??"").trim().slice(0,max);
const uniqueStrings = (value:unknown,max=80):string[] => Array.isArray(value) ? [...new Set(value.map(item=>clean(item,80)).filter(Boolean))].slice(0,max) : [];

export const teamsPlugin:BeePlugin = {
 manifest:{name:"teams",version:"0.1.0",description:"Tenant-scoped teams, application assignments and resource-level access policies",dependencies:["auth","organizations"]},
 async initialize(ctx){
  const db=ctx.mongoClient.db(String(ctx.config.mongoDbName??"bee_core"));
  const secret=String(ctx.config.sessionIdSecret??ctx.config.jwtSecret??"");
  if(secret.length<32) throw new Error("Teams: JWT_SECRET must contain at least 32 characters.");
  const teams=db.collection<Team>("company_teams");
  const members=db.collection<TeamMember>("company_team_members");
  const assignments=db.collection<TeamAppAssignment>("team_app_assignments");
  const policies=db.collection<ResourceAccessPolicy>("resource_access_policies");
  await Promise.all([
   teams.createIndex({tenantId:1,id:1},{unique:true,name:"company_teams_tenant_id_unique"}),
   teams.createIndex({tenantId:1,name:1},{unique:true,name:"company_teams_tenant_name_unique"}),
   members.createIndex({tenantId:1,teamId:1,userId:1},{unique:true,name:"company_team_members_unique"}),
   members.createIndex({tenantId:1,userId:1},{name:"company_team_members_user"}),
   assignments.createIndex({tenantId:1,teamId:1,pluginId:1},{unique:true,name:"team_app_assignments_unique"}),
   policies.createIndex({tenantId:1,pluginId:1,resourceType:1,resourceId:1},{unique:true,name:"resource_access_policy_unique"})
  ]);
  const authenticate=async(req:any,reply:any)=>{
   try{
    await req.jwtVerify();
    const tenant=await resolveTenantContext(db,req.user,{},secret);
    if(!tenant||tenant.client!=="dashboard"){reply.code(401).send({error:"Active organization dashboard session required"});return null;}
    return tenant;
   }catch{reply.code(401).send({error:"Unauthorized"});return null;}
  };
  const companyScope=(tenant:any,companyId:string,reply:any)=>{
   if(companyId!==tenant.tenantId){reply.code(403).send({error:"Switch to this organization before managing its teams"});return false;}
   return true;
  };
  const canRead=(tenant:any,reply:any)=>{if(!hasTenantPermission(tenant,"members.read")){reply.code(403).send({error:"Organization read permission required"});return false;}return true;};
  const canManage=(tenant:any,reply:any)=>{if(!hasTenantPermission(tenant,"members.manage")){reply.code(403).send({error:"Organization management permission required"});return false;}return true;};
  const publicTeam=(team:Team)=>({id:team.id,name:team.name,description:team.description,status:team.status,parentTeamId:team.parentTeamId??null,createdAt:team.createdAt,updatedAt:team.updatedAt});
  const createsParentCycle=async(tenantId:string,teamId:string,parentTeamId:string|null)=>{const seen=new Set<string>();let cursor=parentTeamId;while(cursor){if(cursor===teamId||seen.has(cursor))return true;seen.add(cursor);const parent=await teams.findOne({id:cursor,tenantId});cursor=parent?.parentTeamId??null;}return false;};
  ctx.server.get<{Params:{companyId:string}}>("/companies/:companyId/teams",async(req,reply)=>{
   const tenant=await authenticate(req,reply);if(!tenant||!companyScope(tenant,req.params.companyId,reply)||!canRead(tenant,reply))return;
   const rows=await teams.find({tenantId:tenant.tenantId}).sort({name:1}).toArray();
   const teamIds=rows.map(item=>item.id);
   const [counts,appRows]=await Promise.all([
    members.aggregate<{_id:string;count:number}>([{$match:{tenantId:tenant.tenantId,teamId:{$in:teamIds}}},{$group:{_id:"$teamId",count:{$sum:1}}}]).toArray(),
    assignments.find({tenantId:tenant.tenantId,teamId:{$in:teamIds},enabled:true}).toArray()
   ]);
   return {teams:rows.map(team=>({...publicTeam(team),memberCount:counts.find(item=>item._id===team.id)?.count??0,applications:appRows.filter(item=>item.teamId===team.id).map(item=>item.pluginId)}))};
  });
  ctx.server.post<{Params:{companyId:string};Body:{name?:string;description?:string;parentTeamId?:string|null}}>("/companies/:companyId/teams",async(req,reply)=>{
   const tenant=await authenticate(req,reply);if(!tenant||!companyScope(tenant,req.params.companyId,reply)||!canManage(tenant,reply))return;
   const name=clean(req.body?.name,64),description=clean(req.body?.description,240),parentTeamId=clean(req.body?.parentTeamId,80)||null;
   if(name.length<2)return reply.code(400).send({error:"Team name must contain at least two characters"});
   if(parentTeamId&&!await teams.findOne({id:parentTeamId,tenantId:tenant.tenantId,status:"active"}))return reply.code(400).send({error:"Parent team must belong to the active organization"});
   if(await createsParentCycle(tenant.tenantId,team.id,parentTeamId))return reply.code(400).send({error:"The parent selection would create a team hierarchy cycle"});
   const now=new Date(),team:Team={id:randomUUID(),tenantId:tenant.tenantId,name,description,status:"active",parentTeamId,createdAt:now,updatedAt:now,createdBy:tenant.userId};
   try{await teams.insertOne(team);}catch(error){if((error as any)?.code===11000)return reply.code(409).send({error:"A team with this name already exists"});throw error;}
   await audit(tenant.tenantId,tenant.userId,"team.created","team",team.id,{name:team.name});return reply.code(201).send({team:publicTeam(team)});
  });
  ctx.server.put<{Params:{companyId:string;teamId:string};Body:{name?:string;description?:string;status?:"active"|"archived";parentTeamId?:string|null}}>("/companies/:companyId/teams/:teamId",async(req,reply)=>{
   const tenant=await authenticate(req,reply);if(!tenant||!companyScope(tenant,req.params.companyId,reply)||!canManage(tenant,reply))return;
   const team=await teams.findOne({id:req.params.teamId,tenantId:tenant.tenantId});if(!team)return reply.code(404).send({error:"Team not found"});
   const name=req.body?.name===undefined?team.name:clean(req.body.name,64),description=req.body?.description===undefined?team.description:clean(req.body.description,240);
   const status=req.body?.status==="archived"?"archived":"active",parentTeamId=req.body?.parentTeamId===undefined?team.parentTeamId??null:clean(req.body.parentTeamId,80)||null;
   if(name.length<2)return reply.code(400).send({error:"Team name must contain at least two characters"});
   if(parentTeamId===team.id)return reply.code(400).send({error:"A team cannot be its own parent"});
   if(parentTeamId&&!await teams.findOne({id:parentTeamId,tenantId:tenant.tenantId,status:"active"}))return reply.code(400).send({error:"Parent team must belong to the active organization"});
   try{await teams.updateOne({id:team.id,tenantId:tenant.tenantId},{$set:{name,description,status,parentTeamId,updatedAt:new Date()}});}catch(error){if((error as any)?.code===11000)return reply.code(409).send({error:"A team with this name already exists"});throw error;}
   await audit(tenant.tenantId,tenant.userId,"team.updated","team",team.id,{status});return {team:publicTeam({...team,name,description,status,parentTeamId,updatedAt:new Date()})};
  });
  ctx.server.delete<{Params:{companyId:string;teamId:string}}>("/companies/:companyId/teams/:teamId",async(req,reply)=>{
   const tenant=await authenticate(req,reply);if(!tenant||!companyScope(tenant,req.params.companyId,reply)||!canManage(tenant,reply))return;
   const team=await teams.findOne({id:req.params.teamId,tenantId:tenant.tenantId});if(!team)return reply.code(404).send({error:"Team not found"});
   const [memberCount,childCount,policyCount]=await Promise.all([members.countDocuments({tenantId:tenant.tenantId,teamId:team.id}),teams.countDocuments({tenantId:tenant.tenantId,parentTeamId:team.id}),policies.countDocuments({tenantId:tenant.tenantId,"teamGrants.teamId":team.id})]);
   if(memberCount||childCount||policyCount)return reply.code(409).send({error:"Remove team members, child teams and resource grants before deleting this team"});
   await assignments.deleteMany({tenantId:tenant.tenantId,teamId:team.id});await teams.deleteOne({tenantId:tenant.tenantId,id:team.id});await audit(tenant.tenantId,tenant.userId,"team.deleted","team",team.id);return {success:true};
  });
  ctx.server.get<{Params:{companyId:string;teamId:string}}>("/companies/:companyId/teams/:teamId/members",async(req,reply)=>{
   const tenant=await authenticate(req,reply);if(!tenant||!companyScope(tenant,req.params.companyId,reply)||!canRead(tenant,reply))return;
   if(!await teams.findOne({id:req.params.teamId,tenantId:tenant.tenantId}))return reply.code(404).send({error:"Team not found"});
   const rows=await members.find({tenantId:tenant.tenantId,teamId:req.params.teamId}).toArray();
   const ids=rows.map(item=>item.userId);const users=await db.collection<{id:string;email:string;enabled:boolean}>("users").find({id:{$in:ids},enabled:true},{projection:{id:1,email:1}}).toArray();
   return {members:users.map(user=>({userId:maskUser(tenant,user.id),email:user.email}))};
  });
  ctx.server.put<{Params:{companyId:string;teamId:string};Body:{userIds?:unknown}}>("/companies/:companyId/teams/:teamId/members",async(req,reply)=>{
   const tenant=await authenticate(req,reply);if(!tenant||!companyScope(tenant,req.params.companyId,reply)||!canManage(tenant,reply))return;
   if(!await teams.findOne({id:req.params.teamId,tenantId:tenant.tenantId}))return reply.code(404).send({error:"Team not found"});
   let userIds:string[];
   try{userIds=uniqueStrings(req.body?.userIds,500).map(id=>unmaskUser(tenant,id));}catch{return reply.code(400).send({error:"Invalid organization member reference"});}
   const valid=await db.collection("memberships").find({tenantId:tenant.tenantId,status:"active",userId:{$in:userIds}}).project({userId:1}).toArray();
   if(valid.length!==userIds.length)return reply.code(400).send({error:"Every team member must have an active membership in this organization"});
   await members.deleteMany({tenantId:tenant.tenantId,teamId:req.params.teamId});
   if(userIds.length)await members.insertMany(userIds.map(userId=>({id:randomUUID(),tenantId:tenant.tenantId,teamId:req.params.teamId,userId,addedAt:new Date(),addedBy:tenant.userId})));
   await audit(tenant.tenantId,tenant.userId,"team.members.updated","team",req.params.teamId,{memberCount:userIds.length});return {success:true,userIds:userIds.map(id=>maskUser(tenant,id))};
  });
  ctx.server.put<{Params:{companyId:string;teamId:string};Body:{pluginIds?:unknown}}>("/companies/:companyId/teams/:teamId/applications",async(req,reply)=>{
   const tenant=await authenticate(req,reply);if(!tenant||!companyScope(tenant,req.params.companyId,reply)||!canManage(tenant,reply))return;
   if(!await teams.findOne({id:req.params.teamId,tenantId:tenant.tenantId}))return reply.code(404).send({error:"Team not found"});
   const pluginIds=uniqueStrings(req.body?.pluginIds,100).map(id=>id.toLowerCase());
   for(const pluginId of pluginIds)if(!await isPluginInstalled(db,tenant.tenantId,pluginId))return reply.code(400).send({error:"Application is not installed for this organization: "+pluginId});
   const now=new Date();
   await assignments.deleteMany({tenantId:tenant.tenantId,teamId:req.params.teamId});
   if(pluginIds.length)await assignments.insertMany(pluginIds.map(pluginId=>({id:randomUUID(),tenantId:tenant.tenantId,teamId:req.params.teamId,pluginId,enabled:true,updatedAt:now,updatedBy:tenant.userId})));
   await audit(tenant.tenantId,tenant.userId,"team.applications.updated","team",req.params.teamId,{applicationCount:pluginIds.length});return {success:true,pluginIds};
  });
  ctx.server.get<{Params:{companyId:string;pluginId:string;resourceType:string;resourceId:string}}>("/companies/:companyId/resource-access/:pluginId/:resourceType/:resourceId",async(req,reply)=>{
   const tenant=await authenticate(req,reply);if(!tenant||!companyScope(tenant,req.params.companyId,reply)||!canRead(tenant,reply))return;
   const policy=await policies.findOne({tenantId:tenant.tenantId,pluginId:req.params.pluginId,resourceType:req.params.resourceType,resourceId:req.params.resourceId});
   return {policy:policy?{teamGrants:policy.teamGrants,userOverrides:policy.userOverrides.map(item=>({...item,userId:maskUser(tenant,item.userId)}))}:null};
  });
  ctx.server.put<{Params:{companyId:string;pluginId:string;resourceType:string;resourceId:string};Body:{teamGrants?:unknown;userOverrides?:unknown}}>("/companies/:companyId/resource-access/:pluginId/:resourceType/:resourceId",async(req,reply)=>{
   const tenant=await authenticate(req,reply);if(!tenant||!companyScope(tenant,req.params.companyId,reply)||!canManage(tenant,reply))return;
   const pluginId=clean(req.params.pluginId,80).toLowerCase(),resourceType=clean(req.params.resourceType,80).toLowerCase(),resourceId=clean(req.params.resourceId,160);
   if(!/^[a-z0-9][a-z0-9._-]*$/.test(pluginId)||!resourceType||!resourceId)return reply.code(400).send({error:"A valid plugin, resource type and resource ID are required"});
   if(!await isPluginInstalled(db,tenant.tenantId,pluginId))return reply.code(400).send({error:"Application is not installed for this organization"});
   const rawGrants=Array.isArray(req.body?.teamGrants)?req.body!.teamGrants as any[]:[],rawOverrides=Array.isArray(req.body?.userOverrides)?req.body!.userOverrides as any[]:[];
   const teamGrants:TeamResourceGrant[]=rawGrants.map(item=>({teamId:clean(item?.teamId,80),permissions:uniqueStrings(item?.permissions,10)})).filter(item=>item.teamId&&item.permissions.length);
   const overrideMap=new Map<string,UserResourceOverride>();
   for(const item of rawOverrides){const userId=clean(item?.userId,80),permissions=uniqueStrings(item?.permissions,10);if(!userId||!permissions.length)continue;const prior=overrideMap.get(userId);overrideMap.set(userId,{userId,effect:item?.effect==="deny"||prior?.effect==="deny"?"deny":"allow",permissions:[...new Set([...(prior?.permissions??[]),...permissions])]});}
   let userOverrides:UserResourceOverride[];
   try{userOverrides=[...overrideMap.values()].map(item=>({...item,userId:unmaskUser(tenant,item.userId)}));}catch{return reply.code(400).send({error:"Invalid organization member reference"});}
   if(teamGrants.some(item=>item.permissions.some(permission=>!["read","write","delete"].includes(permission)))||userOverrides.some(item=>item.permissions.some(permission=>!["read","write","delete"].includes(permission))))return reply.code(400).send({error:"Unsupported resource permission"});
   const teamIds=teamGrants.map(item=>item.teamId);
   if(teamIds.length&&await teams.countDocuments({tenantId:tenant.tenantId,id:{$in:teamIds}})!==new Set(teamIds).size)return reply.code(400).send({error:"All granted teams must belong to this organization"});
   const userIds=userOverrides.map(item=>item.userId);
   if(userIds.length&&await db.collection("memberships").countDocuments({tenantId:tenant.tenantId,status:"active",userId:{$in:userIds}})!==new Set(userIds).size)return reply.code(400).send({error:"All overridden users must be active members of this organization"});
   const key={tenantId:tenant.tenantId,pluginId,resourceType,resourceId};
   const policy:ResourceAccessPolicy={...key,teamGrants,userOverrides,updatedAt:new Date(),updatedBy:tenant.userId};
   await policies.updateOne(key,{$set:policy}, {upsert:true});
   await audit(tenant.tenantId,tenant.userId,"resource.access.updated","resource",resourceId,{pluginId,resourceType,teamGrantCount:teamGrants.length,userOverrideCount:userOverrides.length});return {success:true,policy:{teamGrants,userOverrides:userOverrides.map(item=>({...item,userId:maskUser(tenant,item.userId)}))}};
  });
  ctx.server.delete<{Params:{companyId:string;pluginId:string;resourceType:string;resourceId:string}}>("/companies/:companyId/resource-access/:pluginId/:resourceType/:resourceId",async(req,reply)=>{
   const tenant=await authenticate(req,reply);if(!tenant||!companyScope(tenant,req.params.companyId,reply)||!canManage(tenant,reply))return;
   const pluginId=clean(req.params.pluginId,80).toLowerCase(),resourceType=clean(req.params.resourceType,80).toLowerCase(),resourceId=clean(req.params.resourceId,160);
   if(!await isPluginInstalled(db,tenant.tenantId,pluginId))return reply.code(400).send({error:"Application is not installed for this organization"});
   await policies.deleteOne({tenantId:tenant.tenantId,pluginId,resourceType,resourceId});
   await audit(tenant.tenantId,tenant.userId,"resource.access.reset","resource",resourceId,{pluginId,resourceType});
   return {success:true};
  });
  ctx.logger.info("Teams plugin initialized: tenant teams, app assignments and resource ACLs ready.");
 }
};
