import type { BeePlugin } from "../../core/types.js";
import type { PlatformIdentityDocument } from "../../core/platform-identity.js";
import { CORE_PERMISSION_CATALOG } from "../../core/permission-catalog.js";
import { COMPANY_ROLE_PERMISSIONS } from "../../core/tenant-context.js";

declare module "fastify" {
 interface FastifyRequest {
  platformSession?: { sessionId: string; expiresAt: Date };
 }
}
import bcrypt from "bcryptjs";
import type { Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { normalizeTenantSlug, slugifyTenantName } from "../../core/tenant-domain.js";
import { getTenantSubscription, getTrustedPluginPackage, TRUSTED_PLUGIN_PACKAGES } from "../../core/plugin-entitlements.js";
import { rollbackTenantPluginMigrations, runTenantPluginMigrations } from "../../core/plugin-migrations.js";
import { maskResourceId, unmaskResourceId } from "../../core/session-id.js";

type Company={id:string;name:string;slug?:string;kind?:"super"|"tenant";settings?:{defaultLanguage?:"en"|"es"};createdAt:Date;status:"active"|"suspended"};
type User={_id?:import("mongodb").ObjectId;id:string;email:string;passwordHash:string;roles:string[];platformRole?:string;mfaSecretEnc?:string;enabled:boolean;allowedClients:string[];tenantId?:string;createdAt:Date;updatedAt:Date};
type Membership={id:string;userId:string;tenantId:string;role:"super_admin"|"owner"|"admin"|"manager"|"member"|"guest"|"custom";status:"active"|"invited"|"suspended";createdAt:Date;updatedAt:Date};
type Claims={sub?:string;sid?:string;client?:string;aud?:string};
export const platformAdminPlugin:BeePlugin={
 manifest:{name:"platform-admin",version:"0.1.0",description:"Platform-wide administration protected by Super Organization super_admin membership",dependencies:["auth","organizations","marketplace"]},
 async initialize(ctx){
  const db:Db=ctx.mongoClient.db(String(ctx.config.mongoDbName??"bee_core"));
  const users=db.collection<User>("users"),sessions=db.collection("refresh_sessions"),companies=db.collection<Company>("tenants"),memberships=db.collection<Membership>("memberships");
  const sessionIdSecret=String(ctx.config.sessionIdSecret ?? ctx.config.jwtSecret ?? "");
  if(sessionIdSecret.length<32)throw new Error("Platform admin: JWT_SECRET must contain at least 32 characters.");
  const platformAudit=db.collection("platform_audit_events");
  await Promise.all([
   platformAudit.createIndex({occurredAt:-1},{name:"platform_audit_occurred"}),
   platformAudit.createIndex({actorId:1,occurredAt:-1},{name:"platform_audit_actor_occurred"})
  ]);
  // Idempotent migration: make the platform root a real organization and
  // move legacy platform superadmins into it before the API accepts requests.
  const bootstrapEmail=String(ctx.config.authAdminEmail??"").trim().toLowerCase();
  let superOrganization=await companies.findOne({kind:"super"});
  if(!superOrganization){
   const superOrganizationId="bee-core-super-organization";
   let existingOrganization=await companies.findOne({id:superOrganizationId});
   if(!existingOrganization){
    let slug="super-organization";
    if(await companies.findOne({slug}))slug="bee-core-super-organization";
    if(await companies.findOne({slug}))slug="bee-core-root-organization";
    if(await companies.findOne({slug}))slug="bee-core-root-"+randomUUID().slice(0,8);
    const newSuperOrganization:Company={id:superOrganizationId,name:"Bee-Core Super Organization",slug,kind:"super",createdAt:new Date(),status:"active",settings:{defaultLanguage:"en"}};
    await companies.insertOne(newSuperOrganization);
    existingOrganization=await companies.findOne({id:superOrganizationId});
   }
   superOrganization=existingOrganization;
  }
  if(!superOrganization)throw new Error("Platform admin: failed to initialize the Super Organization.");
  await companies.updateOne({id:superOrganization.id},{$set:{kind:"super",status:"active",name:"Bee-Core Super Organization"}});
  // Migrate legacy platformRole accounts once. The configured bootstrap email
  // is only eligible when no Super Admin membership exists yet; it must never
  // silently re-promote an intentionally demoted or suspended administrator.
  const legacyAdmins=await users.find({platformRole:"superadmin"}).toArray();
  if(!legacyAdmins.length&&bootstrapEmail){
   const existingSuperAdmin=await memberships.findOne({tenantId:superOrganization.id,role:"super_admin"});
   if(!existingSuperAdmin){
    const bootstrapUser=await users.findOne({email:bootstrapEmail});
    if(bootstrapUser)legacyAdmins.push(bootstrapUser);
   }
  }
  for(const legacyAdmin of legacyAdmins){
   const now=new Date();
   await memberships.updateOne(
    {userId:legacyAdmin.id,tenantId:superOrganization.id},
    {$set:{role:"super_admin",status:"active",updatedAt:now},$setOnInsert:{id:randomUUID(),userId:legacyAdmin.id,tenantId:superOrganization.id,createdAt:now}},
    {upsert:true}
   );
   const moved=legacyAdmin.tenantId!==superOrganization.id||legacyAdmin.platformRole==="superadmin";
   // Platform superadmins are not tenant owners: retain the historical rows
   // but suspend every old tenant membership before changing their home org.
   await memberships.updateMany({userId:legacyAdmin.id,tenantId:{$ne:superOrganization.id},status:"active"},{$set:{status:"suspended",updatedAt:now}});
   await users.updateOne({id:legacyAdmin.id},{$set:{tenantId:superOrganization.id,updatedAt:now},$unset:{platformRole:""}});
   if(moved)await sessions.updateMany({userId:legacyAdmin.id,revokedAt:null},{$set:{revokedAt:now}});
  }
  if(legacyAdmins.length)ctx.logger.info("Super Organization migration completed",{organizationId:superOrganization.id,migratedUsers:legacyAdmins.length});
  const recordPlatformAudit=async(event:{actorId:string;action:string;tenantId?:string;resourceType:string;resourceId?:string;metadata?:Record<string,unknown>})=>{
   try{await platformAudit.insertOne({id:randomUUID(),...event,occurredAt:new Date()});}
   catch(error){ctx.logger.error("Platform audit event write failed",{action:event.action,error});}
  };
  const mask=(session:{sessionId:string;expiresAt:Date},id:string,type:import("../../core/session-id.js").SessionResourceType)=>maskResourceId(id,type,session,sessionIdSecret);
  const guard=async(req:any,reply:any):Promise<User|null>=>{
   try{await req.jwtVerify();const claims=req.user as Claims;
    if(claims.aud!=="bee-core"||claims.client!=="dashboard"||!claims.sub||!claims.sid)return reply.code(401).send({error:"Platform admin session required"}),null;
    const session=await sessions.findOne({id:claims.sid,client:"dashboard",revokedAt:null,expiresAt:{$gt:new Date()}});
    if(!session)return reply.code(403).send({error:"Platform superadministrator required"}),null;
    const sessionContext={sessionId:session.id,expiresAt:session.expiresAt};
    let userId="";try{userId=unmaskResourceId(String(claims.sub),"user",sessionContext,sessionIdSecret);}catch{return reply.code(401).send({error:"Invalid session subject"}),null;}
    if(userId!==session.userId)return reply.code(401).send({error:"Invalid session subject"}),null;
    const user=await users.findOne({id:userId,enabled:true});
    const membership=await memberships.findOne({userId,tenantId:session.tenantId,status:"active",role:"super_admin"});
    const superOrganization=await companies.findOne({id:session.tenantId,kind:"super",status:"active"});
    if(!user||!membership||!superOrganization)return reply.code(403).send({error:"Super Organization super_admin membership required"}),null;
    if(!user.mfaSecretEnc){
     await recordPlatformAudit({actorId:user.id,action:"security.mfa_required",resourceType:"security",metadata:{reason:"mfa_not_enrolled"}});
     return reply.code(403).send({error:"Active MFA enrollment required"}),null;
    }
    if(!session.mfaVerifiedAt||Date.now()-session.mfaVerifiedAt.getTime()>15*60*1000){
     await recordPlatformAudit({actorId:user.id,action:"security.mfa_recent_required",resourceType:"security",metadata:{reason:"mfa_verification_stale"}});
     return reply.code(403).send({error:"Recent MFA verification required"}),null;
    }
    try {
     if(req.params?.companyId)req.params.companyId=unmaskResourceId(String(req.params.companyId),"tenant",sessionContext,sessionIdSecret);
     if(req.params?.pluginId)req.params.pluginId=unmaskResourceId(String(req.params.pluginId),"plugin",sessionContext,sessionIdSecret);
    } catch { return reply.code(404).send({error:"Resource not found"}),null; }
    req.platformSession=sessionContext;
    return user;
   }catch{return reply.code(401).send({error:"Unauthorized"}),null;}
  };
  const permissionPolicyCollection=db.collection<{id:string;tenantAssignablePermissions:string[];updatedAt:Date;updatedBy:string}>("platform_permission_policies");
  await permissionPolicyCollection.createIndex({id:1},{unique:true,name:"platform_permission_policy_id_unique"});
  const defaultTenantAssignablePermissions=CORE_PERMISSION_CATALOG.filter(item=>item.customRoleAssignable).map(item=>item.key);
  const readPermissionPolicy=async()=>{
   const saved=await permissionPolicyCollection.findOne({id:"global"},{projection:{_id:0}});
   return {tenantAssignablePermissions:saved?.tenantAssignablePermissions??defaultTenantAssignablePermissions};
  };
  ctx.server.get("/platform/permissions",async(req,reply)=>{
   const actor=await guard(req,reply);if(!actor)return;
   const policy=await readPermissionPolicy();
   return {catalog:CORE_PERMISSION_CATALOG,tenantAssignablePermissions:policy.tenantAssignablePermissions,systemRoles:[
    {key:"super_admin",label:"Super Admin",scope:"platform",protected:true,description:"Full platform administration; assigned only through the Super Organization.",permissions:COMPANY_ROLE_PERMISSIONS.super_admin},
    {key:"owner",label:"Tenant Owner",scope:"tenant",protected:true,description:"Owns one tenant and administers its users, roles and organization settings.",permissions:COMPANY_ROLE_PERMISSIONS.owner},
    {key:"admin",label:"Tenant Admin",scope:"tenant",protected:true,description:"Administers tenant operations within the permissions enforced by Core.",permissions:COMPANY_ROLE_PERMISSIONS.admin},
    {key:"manager",label:"Manager",scope:"tenant",protected:false,description:"Operational access defined by the tenant membership policy.",permissions:COMPANY_ROLE_PERMISSIONS.manager},
    {key:"member",label:"Member",scope:"tenant",protected:false,description:"Standard tenant access.",permissions:COMPANY_ROLE_PERMISSIONS.member},
    {key:"guest",label:"Guest",scope:"tenant",protected:true,description:"Restricted read-only membership.",permissions:COMPANY_ROLE_PERMISSIONS.guest}
   ]};
  });
  ctx.server.put<{Body:{tenantAssignablePermissions?:unknown}}>("/platform/permissions",async(req,reply)=>{
   const actor=await guard(req,reply);if(!actor)return;
   const requested=req.body?.tenantAssignablePermissions;
   if(!Array.isArray(requested)||requested.length>100||requested.some(item=>typeof item!=="string"))return reply.code(400).send({error:"tenantAssignablePermissions must be an array of permission keys"});
   const allowedCatalog=new Set(CORE_PERMISSION_CATALOG.filter(item=>item.customRoleAssignable).map(item=>item.key));
   const tenantAssignablePermissions=[...new Set((requested as string[]).map(item=>item.trim()))].sort();
   const unsupported=tenantAssignablePermissions.filter(key=>!allowedCatalog.has(key));
   if(unsupported.length)return reply.code(400).send({error:"Protected or unknown permissions cannot be delegated to tenants: "+unsupported.join(", ")});
   const updatedAt=new Date();
   await permissionPolicyCollection.updateOne({id:"global"},{$set:{tenantAssignablePermissions,updatedAt,updatedBy:actor.id}},{upsert:true});
   // A global revocation is immediate: remove the revoked capability from every
   // tenant custom role so existing assignments cannot retain stale authority.
   await db.collection("company_roles").updateMany({mode:{$ne:"restriction"}},{$pull:{permissions:{$nin:tenantAssignablePermissions}}} as any);
   await recordPlatformAudit({actorId:actor.id,action:"platform.permissions.updated",resourceType:"permission_policy",metadata:{tenantAssignablePermissions,updatedAt:updatedAt.toISOString()}});
   return {success:true,tenantAssignablePermissions};
  });
  const identityCollection=db.collection<PlatformIdentityDocument>("platform_identity");
  await identityCollection.createIndex({key:1},{unique:true,name:"platform_identity_singleton"});
  const defaultIdentity=():PlatformIdentityDocument=>({key:"global",
   brand:{platformName:"Bee-Core",pageTitle:"Bee-Core",tagline:"All Is a Plugin",description:"",legalName:"",websiteUrl:"",contactEmail:"",copyright:""},
   assets:{primaryLogoUrl:"",secondaryLogoUrl:"",brandMarkUrl:"",faviconUrl:"",appleTouchIconUrl:"",socialImageUrl:"",loginLogoUrl:""},
   seo:{title:"",description:"",keywords:[],canonicalUrl:"",robotsIndex:true,robotsFollow:true,openGraphTitle:"",openGraphDescription:"",openGraphImageUrl:"",twitterCard:"summary_large_image",twitterTitle:"",twitterDescription:"",twitterImageUrl:""},
   updatedAt:new Date(0),updatedBy:"system"
  });
  const readIdentity=async()=>{
   const saved=await identityCollection.findOne({key:"global"},{projection:{_id:0}});
   return saved??defaultIdentity();
  };
  const cleanText=(value:unknown,max:number):string=>typeof value==="string"?value.trim().slice(0,max):"";
  const cleanUrl=(value:unknown):string=>{
   const raw=cleanText(value,2048);if(!raw)return "";
   try{const parsed=new URL(raw);return ["https:","http:"].includes(parsed.protocol)?parsed.toString():"";}catch{return "";}
  };
  const normalizeIdentity=(body:any,actorId:string):PlatformIdentityDocument=>{
   const base=defaultIdentity();
   const brand=body?.brand??{},assets=body?.assets??{},seo=body?.seo??{};
   const keywords=Array.isArray(seo.keywords)?seo.keywords.slice(0,20).map((v:unknown)=>cleanText(v,60)).filter(Boolean):[];
   return {key:"global",
    brand:{platformName:cleanText(brand.platformName,120)||base.brand.platformName,pageTitle:cleanText(brand.pageTitle,180),tagline:cleanText(brand.tagline,180),description:cleanText(brand.description,1000),legalName:cleanText(brand.legalName,180),websiteUrl:cleanUrl(brand.websiteUrl),contactEmail:cleanText(brand.contactEmail,254),copyright:cleanText(brand.copyright,180)},
    assets:{primaryLogoUrl:cleanUrl(assets.primaryLogoUrl),secondaryLogoUrl:cleanUrl(assets.secondaryLogoUrl),brandMarkUrl:cleanUrl(assets.brandMarkUrl),faviconUrl:cleanUrl(assets.faviconUrl),appleTouchIconUrl:cleanUrl(assets.appleTouchIconUrl),socialImageUrl:cleanUrl(assets.socialImageUrl),loginLogoUrl:cleanUrl(assets.loginLogoUrl)},
    seo:{title:cleanText(seo.title,180),description:cleanText(seo.description,320),keywords,canonicalUrl:cleanUrl(seo.canonicalUrl),robotsIndex:seo.robotsIndex!==false,robotsFollow:seo.robotsFollow!==false,openGraphTitle:cleanText(seo.openGraphTitle,180),openGraphDescription:cleanText(seo.openGraphDescription,320),openGraphImageUrl:cleanUrl(seo.openGraphImageUrl),twitterCard:seo.twitterCard==="summary"?"summary":"summary_large_image",twitterTitle:cleanText(seo.twitterTitle,180),twitterDescription:cleanText(seo.twitterDescription,320),twitterImageUrl:cleanUrl(seo.twitterImageUrl)},
    updatedAt:new Date(),updatedBy:actorId
   };
  };
  ctx.server.get("/public/platform-identity",async()=>{
   const identity=await readIdentity();
   return {brand:identity.brand,assets:identity.assets,seo:identity.seo};
  });
  ctx.server.get("/platform/identity",async(req,reply)=>{
   const actor=await guard(req,reply);if(!actor)return;
   const identity=await readIdentity();
   const {_id,...safe}=identity as PlatformIdentityDocument & {_id?:unknown};
   return safe;
  });
  ctx.server.put<{Body:Record<string,unknown>}>("/platform/identity",async(req,reply)=>{
   const actor=await guard(req,reply);if(!actor)return;
   const identity=normalizeIdentity(req.body,actor.id);
   await identityCollection.updateOne({key:"global"},{$set:identity}, {upsert:true});
   await recordPlatformAudit({actorId:actor.id,action:"platform.identity.updated",resourceType:"platform_identity",metadata:{updatedAt:identity.updatedAt.toISOString()}});
   const {_id,...safe}=identity as PlatformIdentityDocument & {_id?:unknown};
   return {success:true,identity:safe};
  });
  ctx.server.get("/platform/audit-events",async(req,reply)=>{
   const actor=await guard(req,reply);if(!actor)return;
   const page=Number((req.query as any)?.page??1),limit=Number((req.query as any)?.limit??25);
   if(!Number.isSafeInteger(page)||page<1||page>10000||!Number.isSafeInteger(limit)||limit<1||limit>100)return reply.code(400).send({error:"Page must be between 1 and 10000 and limit must be between 1 and 100"});
   const rows=await platformAudit.find({},{projection:{_id:0}}).sort({occurredAt:-1,id:-1}).skip((page-1)*limit).limit(limit+1).toArray();
   const hasMore=rows.length>limit;
   return {events:rows.slice(0,limit).map(event=>({id:mask(req.platformSession!,String(event.id),"audit-event"),actorId:mask(req.platformSession!,String(event.actorId),"user"),action:event.action,tenantId:event.tenantId?mask(req.platformSession!,String(event.tenantId),"tenant"):null,resourceType:event.resourceType,resourceId:event.resourceId?mask(req.platformSession!,String(event.resourceId),event.resourceType==="plugin"?"plugin":event.resourceType==="tenant"?"tenant":"audit-event"):null,metadata:event.metadata??{},occurredAt:event.occurredAt})),page,limit,hasMore};
  });
  ctx.server.get("/platform/me",async(req,reply)=>{const user=await guard(req,reply);if(!user)return;return {platformAdmin:true,role:"super_admin",email:user.email};});
  ctx.server.get("/platform/companies",async(req,reply)=>{const user=await guard(req,reply);if(!user)return;const list=await companies.find({kind:{$ne:"super"}}).sort({createdAt:-1}).toArray();return {companies:await Promise.all(list.map(async c=>({id:mask(req.platformSession!,c.id,"tenant"),name:c.name,slug:c.slug??null,status:c.status??"active",createdAt:c.createdAt,membersCount:await memberships.countDocuments({tenantId:c.id,status:"active"})}))) };});
  ctx.server.post<{Body:{name?:string;slug?:string;ownerEmail?:string;ownerPassword?:string}}>("/platform/companies",async(req,reply)=>{
   const actor=await guard(req,reply);if(!actor)return;
   const name=String(req.body?.name??"").trim();const ownerEmail=String(req.body?.ownerEmail??"").trim().toLowerCase();
   if(name.length<2||name.length>120||!ownerEmail||!/^\S+@\S+\.\S+$/.test(ownerEmail))return reply.code(400).send({error:"Company name and valid owner email are required"});
   let slug:string;
   try{slug=normalizeTenantSlug(req.body?.slug||slugifyTenantName(name));}catch(error){return reply.code(400).send({error:error instanceof Error?error.message:"Invalid tenant slug"});}
   if(await companies.findOne({slug},{projection:{_id:1}}))return reply.code(409).send({error:"This tenant slug is already in use"});
   const now=new Date(),tenantId=randomUUID();
   const company:Company={id:tenantId,name,slug,kind:"tenant",createdAt:now,status:"active",settings:{defaultLanguage:"en"}};
   let owner:User|null=await users.findOne({email:ownerEmail});
   if(!owner){const password=String(req.body?.ownerPassword??"");if(password.length<12)return reply.code(400).send({error:"For a new owner, ownerPassword must contain at least 12 characters"});
    owner={id:randomUUID(),email:ownerEmail,passwordHash:await bcrypt.hash(password,12),roles:["user"],enabled:true,allowedClients:["dashboard","public"],tenantId,createdAt:now,updatedAt:now};
    await users.insertOne(owner);
   }
   if(!owner.enabled)return reply.code(409).send({error:"Owner account is disabled"});
   await companies.insertOne(company);
   await getTenantSubscription(db,tenantId);
   await memberships.updateOne({userId:owner.id,tenantId},{$setOnInsert:{id:randomUUID(),userId:owner.id,tenantId,role:"owner",status:"active",createdAt:now,updatedAt:now}},{upsert:true});
   await recordPlatformAudit({actorId:actor.id,action:"company.created",tenantId,resourceType:"tenant",resourceId:tenantId,metadata:{slug}});
   return reply.code(201).send({company:{id:mask(req.platformSession!,company.id,"tenant"),name:company.name,slug:company.slug,status:company.status,createdAt:company.createdAt},owner:{id:mask(req.platformSession!,owner.id,"user"),email:owner.email}});
  });
  ctx.server.patch<{Params:{companyId:string};Body:{status?:"active"|"suspended"}}>("/platform/companies/:companyId",async(req,reply)=>{
   const actor=await guard(req,reply);if(!actor)return;const status=req.body?.status;
   if(status!=="active"&&status!=="suspended")return reply.code(400).send({error:"status must be active or suspended"});
   const result=await companies.updateOne({id:req.params.companyId},{$set:{status}});
   if(!result.matchedCount)return reply.code(404).send({error:"Company not found"});
   await recordPlatformAudit({actorId:actor.id,action:"company.status_changed",tenantId:req.params.companyId,resourceType:"tenant",resourceId:req.params.companyId,metadata:{status}});
   return {success:true,companyId:mask(req.platformSession!,req.params.companyId,"tenant"),status};
  });
  ctx.server.get<{Params:{companyId:string}}>("/platform/companies/:companyId/users",async(req,reply)=>{
   const actor=await guard(req,reply);if(!actor)return;
   const company=await companies.findOne({id:req.params.companyId});
   if(!company)return reply.code(404).send({error:"Company not found"});
   const rows=await memberships.find({tenantId:company.id,status:{$in:["active","invited","suspended"]}}).sort({createdAt:1}).toArray();
   const usersById=new Map((await users.find({id:{$in:rows.map(row=>row.userId)}},{projection:{id:1,email:1,enabled:1,createdAt:1}}).toArray()).map(user=>[user.id,user]));
   return {tenantId:mask(req.platformSession!,company.id,"tenant"),users:rows.map(row=>{const user=usersById.get(row.userId);return {userId:mask(req.platformSession!,row.userId,"user"),email:user?.email??"Unknown user",role:row.role,status:!user?.enabled?"disabled":row.status,createdAt:row.createdAt};})};
  });
  ctx.server.get<{Params:{companyId:string}}>("/platform/companies/:companyId/plugins",async(req,reply)=>{
   const actor=await guard(req,reply);if(!actor)return;
   const company=await companies.findOne({id:req.params.companyId});
   if(!company)return reply.code(404).send({error:"Company not found"});
   const superOrganization=await companies.findOne({kind:"super",status:"active"});
   if(!superOrganization)return reply.code(503).send({error:"Super Organization is unavailable"});
   // The Super Organization owns the one platform package installation.
   // Tenant rows below represent activation/configuration, not package copies.
   await getTenantSubscription(db,superOrganization.id);
   const [globalInstallations,tenantInstallations]=await Promise.all([
    db.collection("tenant_plugin_installations").find({tenantId:superOrganization.id,status:"installed"}).toArray(),
    db.collection("tenant_plugin_installations").find({tenantId:company.id}).toArray()
   ]);
   const globalByPlugin=new Map(globalInstallations.map(item=>[String(item.pluginId),item]));
   const tenantByPlugin=new Map(tenantInstallations.map(item=>[String(item.pluginId),item]));
   return {tenantId:mask(req.platformSession!,company.id,"tenant"),plugins:TRUSTED_PLUGIN_PACKAGES.map(plugin=>{
    const globalInstallation=globalByPlugin.get(plugin.id);
    const tenantInstallation=tenantByPlugin.get(plugin.id);
    const installed=globalInstallation?.status==="installed";
    const enabled=!!installed&&tenantInstallation?.status==="installed"&&tenantInstallation?.enabled!==false;
    return {id:mask(req.platformSession!,plugin.id,"plugin"),name:plugin.name,description:plugin.description,version:globalInstallation?.version??plugin.version,system:plugin.system,installed,enabled,status:!installed?"uninstalled":enabled?"installed":"disabled",dependencies:plugin.dependencies};
   })};
  });
  ctx.server.put<{Params:{companyId:string;pluginId:string};Body:{enabled?:boolean}}>("/platform/companies/:companyId/plugins/:pluginId",async(req,reply)=>{
   const actor=await guard(req,reply);if(!actor)return;
   const company=await companies.findOne({id:req.params.companyId,status:"active"});
   if(!company)return reply.code(404).send({error:"Active company not found"});
   const plugin=getTrustedPluginPackage(req.params.pluginId);
   if(!plugin)return reply.code(404).send({error:"Trusted plugin package not found"});
   if(typeof req.body?.enabled!=="boolean")return reply.code(400).send({error:"enabled must be a boolean"});
   const superOrganization=await companies.findOne({kind:"super",status:"active"});
   if(!superOrganization)return reply.code(503).send({error:"Super Organization is unavailable"});
   const installations=db.collection("tenant_plugin_installations");
   const globalInstallation=await installations.findOne({tenantId:superOrganization.id,pluginId:plugin.id,status:"installed"});
   if(!globalInstallation)return reply.code(409).send({error:"Plugin is not installed on the platform. Install it first in Settings → Plugins."});
   const installation=await installations.findOne({tenantId:company.id,pluginId:plugin.id});
   const currentEnabled=!!installation&&installation.status==="installed"&&installation.enabled!==false;
   if(req.body.enabled===currentEnabled)return {success:true,tenantId:mask(req.platformSession!,company.id,"tenant"),pluginId:mask(req.platformSession!,plugin.id,"plugin"),installed:true,enabled:currentEnabled,unchanged:true};
   if(!req.body.enabled){
    const dependents=TRUSTED_PLUGIN_PACKAGES.filter(candidate=>candidate.dependencies.includes(plugin.id));
    for(const dependent of dependents){
     const activeDependent=await installations.findOne({tenantId:company.id,pluginId:dependent.id,status:"installed",enabled:{$ne:false}});
     if(activeDependent)return reply.code(409).send({error:"Cannot deactivate this plugin while the dependent plugin is enabled: "+dependent.name});
    }
    if(installation?.status==="installed"){
     const now=new Date();
     await installations.updateOne({tenantId:company.id,pluginId:plugin.id,status:"installed"},{$set:{enabled:false,enabledUpdatedAt:now,enabledUpdatedBy:actor.id,updatedAt:now}});
    }
   }else{
    for(const dependencyId of plugin.dependencies){
     const dependencyGlobal=await installations.findOne({tenantId:superOrganization.id,pluginId:dependencyId,status:"installed"});
     const dependencyTenant=await installations.findOne({tenantId:company.id,pluginId:dependencyId,status:"installed",enabled:{$ne:false}});
     if(!dependencyGlobal||!dependencyTenant)return reply.code(409).send({error:"Activate the required plugin first: "+dependencyId});
    }
    const now=new Date();
    if(!installation||installation.status!=="installed"){
     const migrationRun=await runTenantPluginMigrations(db,company.id,plugin.id,plugin.migrations??[]);
     try{
      await plugin.installTenant?.(db,company.id);
      await installations.updateOne(
       {tenantId:company.id,pluginId:plugin.id},
       {$set:{status:"installed",version:String(globalInstallation.version??plugin.version),installedAt:now,updatedAt:now,enabled:true,enabledUpdatedAt:now,enabledUpdatedBy:actor.id},$setOnInsert:{id:randomUUID(),tenantId:company.id,pluginId:plugin.id}},
       {upsert:true}
      );
     }catch(error){
      const rollback=await rollbackTenantPluginMigrations(db,company.id,plugin.id,plugin.migrations??[],migrationRun.applied);
      if(rollback.failed.length)ctx.logger.error("Tenant plugin activation rollback was incomplete",{tenantId:company.id,pluginId:plugin.id,failedMigrations:rollback.failed});
      throw error;
     }
    }else{
     await installations.updateOne({tenantId:company.id,pluginId:plugin.id,status:"installed"},{$set:{enabled:true,enabledUpdatedAt:now,enabledUpdatedBy:actor.id,updatedAt:now}});
    }
   }
   const enabled=req.body.enabled;
   await recordPlatformAudit({actorId:actor.id,action:enabled?"plugin.enabled":"plugin.disabled",tenantId:company.id,resourceType:"plugin",resourceId:plugin.id,metadata:{enabled,platformVersion:String(globalInstallation.version??plugin.version)}});
   return {success:true,tenantId:mask(req.platformSession!,company.id,"tenant"),pluginId:mask(req.platformSession!,plugin.id,"plugin"),enabled,installed:true,status:"installed"};
  });
  ctx.logger.info("Platform admin plugin initialized",{membershipRole:"super_admin"});
 }
};
