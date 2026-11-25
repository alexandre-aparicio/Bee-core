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
import { lstat, rm } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { normalizeTenantSlug, slugifyTenantName } from "../../core/tenant-domain.js";
import { getTenantSubscription, getTenantPluginCatalog, getTrustedPluginPackage, hasPluginEntitlement, syncAutomaticPluginProvisioning, syncPluginPackageVersionUpdates, TRUSTED_PLUGIN_PACKAGES, MIGRATABLE_BUILTIN_PLUGIN_IDS, RETIRED_BUNDLED_PLUGIN_PACKAGES } from "../../core/plugin-entitlements.js";
import { rollbackTenantPluginMigrations, runTenantPluginMigrations } from "../../core/plugin-migrations.js";
import { maskResourceId, unmaskResourceId } from "../../core/session-id.js";
import { ensurePlatformPluginRegistry, listPlatformPluginPackages, migrateLegacyPlatformPackageInstalls, retireBundledPlatformPackage, seedBundledPlatformPackages } from "../../core/platform-plugin-registry.js";
import { installSignedPluginZip } from "../../core/plugin-zip-installer.js";
import { CORE_RUNTIME_PLUGIN_IDS, satisfiesPluginVersion } from "../../core/plugin-package.js";
import { getRuntimePlugin } from "../../core/runtime-plugin-registry.js";
import type { PluginPackageDefinition } from "../../core/plugin-entitlements.js";

type Company={id:string;name:string;slug?:string;kind?:"super"|"tenant";settings?:{defaultLanguage?:"en"|"es"};createdAt:Date;status:"active"|"suspended"};
type User={_id?:import("mongodb").ObjectId;id:string;email:string;passwordHash:string;roles:string[];platformRole?:string;mfaSecretEnc?:string;enabled:boolean;allowedClients:string[];tenantId?:string;createdAt:Date;updatedAt:Date};
type Membership={id:string;userId:string;tenantId:string;role:"super_admin"|"owner"|"admin"|"manager"|"member"|"guest"|"custom";status:"active"|"invited"|"suspended";createdAt:Date;updatedAt:Date};
type Claims={sub?:string;sid?:string;client?:string;aud?:string};
export const platformAdminPlugin:BeePlugin={
 manifest:{ requiredServices: ["mongo","session-resource-ids","plugin-package-storage","plugin-publisher-public-key"],name:"platform-admin",version:"0.1.0",description:"Platform-wide administration protected by Super Organization super_admin membership",dependencies:["auth","organizations","marketplace"]},
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
  await ensurePlatformPluginRegistry(db);
  await seedBundledPlatformPackages(db,TRUSTED_PLUGIN_PACKAGES);
  const migratedPlatformPackages=await migrateLegacyPlatformPackageInstalls(db,superOrganization.id);
  if(migratedPlatformPackages)ctx.logger.info("Legacy platform package installations migrated",{count:migratedPlatformPackages});
  // Legacy modules must only be available as separately uploaded, signed ZIP packages.
  // Preserve tenant installation history; hide only the old bundled platform record.
  for (const retiredPackage of RETIRED_BUNDLED_PLUGIN_PACKAGES) {
    await retireBundledPlatformPackage(db, retiredPackage.id, retiredPackage.retireSignedZip);
  }
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
    if(!session.mfaVerifiedAt||session.mfaVerifiedAt.getTime()>Date.now()||Date.now()-session.mfaVerifiedAt.getTime()>15*60*1000){
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
  const getPlatformPluginDefinition=async(pluginId:string):Promise<PluginPackageDefinition|undefined>=>{
   const builtIn=getTrustedPluginPackage(pluginId);
   if(builtIn)return builtIn;
   const runtime=getRuntimePlugin(pluginId);
   if(!runtime)return undefined;
   const metadata=await db.collection<PluginPackageDefinition>("plugin_catalog").findOne({id:pluginId,status:"published"});
   if(!metadata)return undefined;
   // ZIP packages deliberately keep codeAvailable=false: their executable code
   // lives in the signed-package runtime, not in the bundled plugin catalogue.
   // Resolve that metadata only while the matching global ZIP is installed and
   // mounted successfully. Preserve the existing bundled/external-code path.
   if(metadata.codeAvailable!==true){
    const loadedZip=await db.collection("platform_plugin_packages").findOne({
     pluginId,status:"installed",source:"zip",runtimeState:"loaded"
    });
    if(!loadedZip)return undefined;
   }
   return {...metadata,migrations:runtime.tenantMigrations??[],installTenant:runtime.installTenant,updateTenant:runtime.updateTenant,uninstallTenant:runtime.uninstallTenant};
  };
  const permissionPolicyCollection=db.collection<{id:string;tenantAssignablePermissions:string[];updatedAt:Date;updatedBy:string}>("platform_permission_policies");
  await permissionPolicyCollection.createIndex({id:1},{unique:true,name:"platform_permission_policy_id_unique"});
  const readPermissionPolicy=async()=>{
   const saved=await permissionPolicyCollection.findOne({id:"global"},{projection:{_id:0}});
   const packages=await db.collection<{id:string;permissions?:Array<{key:string;module:string;label?:string;description?:string;resource?:string;action?:string;defaultGrants?:{owner:boolean;admin:boolean;manager:boolean;member:boolean};customRoleAssignable?:boolean}>}>("plugin_catalog").find({status:{$in:["published","installed"]}},{projection:{id:1,permissions:1,_id:0}}).toArray();
   const pluginCatalog=packages.flatMap(pkg=>(pkg.permissions??[]).filter(permission=>permission.module===pkg.id&&typeof permission.key==="string"));
   const catalog=[...CORE_PERMISSION_CATALOG,...pluginCatalog.map(permission=>({...permission,label:permission.label??permission.key,description:permission.description??permission.key,resource:permission.resource??permission.key.split(".")[0]??"plugin",action:permission.action??permission.key.split(".")[1]??"read",customRoleAssignable:permission.customRoleAssignable!==false}))];
   const defaultTenantAssignablePermissions=catalog.filter(item=>item.customRoleAssignable).map(item=>item.key);
   return {catalog,tenantAssignablePermissions:saved?.tenantAssignablePermissions??defaultTenantAssignablePermissions};
  };
  ctx.server.get("/platform/permissions",async(req,reply)=>{
   const actor=await guard(req,reply);if(!actor)return;
   const policy=await readPermissionPolicy();
   const permissionsForRole=(role:"owner"|"admin"|"manager"|"member")=>[...new Set([...COMPANY_ROLE_PERMISSIONS[role],...policy.catalog.filter(item=>item.defaultGrants?.[role]).map(item=>item.key)])];
   return {catalog:policy.catalog,tenantAssignablePermissions:policy.tenantAssignablePermissions,systemRoles:[
    {key:"super_admin",label:"Super Admin",scope:"platform",protected:true,description:"Full platform administration; assigned only through the Super Organization.",permissions:permissionsForRole("owner")},
    {key:"owner",label:"Tenant Owner",scope:"tenant",protected:true,description:"Owns one tenant and administers its users, roles and organization settings.",permissions:permissionsForRole("owner")},
    {key:"admin",label:"Tenant Admin",scope:"tenant",protected:true,description:"Administers tenant operations within the permissions enforced by Core.",permissions:permissionsForRole("admin")},
    {key:"manager",label:"Manager",scope:"tenant",protected:false,description:"Operational access defined by the tenant membership policy.",permissions:permissionsForRole("manager")},
    {key:"member",label:"Member",scope:"tenant",protected:false,description:"Standard tenant access.",permissions:permissionsForRole("member")},
    {key:"guest",label:"Guest",scope:"tenant",protected:true,description:"Restricted read-only membership.",permissions:COMPANY_ROLE_PERMISSIONS.guest}
   ]};
  });
  ctx.server.put<{Body:{tenantAssignablePermissions?:unknown}}>("/platform/permissions",async(req,reply)=>{
   const actor=await guard(req,reply);if(!actor)return;
   const requested=req.body?.tenantAssignablePermissions;
   if(!Array.isArray(requested)||requested.length>100||requested.some(item=>typeof item!=="string"))return reply.code(400).send({error:"tenantAssignablePermissions must be an array of permission keys"});
   const policy=await readPermissionPolicy();
   const allowedCatalog=new Set(policy.catalog.filter(item=>item.customRoleAssignable).map(item=>item.key));
   const tenantAssignablePermissions=[...new Set((requested as string[]).map(item=>item.trim()))].sort();
   const unsupported=tenantAssignablePermissions.filter(key=>!allowedCatalog.has(key));
   if(unsupported.length)return reply.code(400).send({error:"Protected or unknown permissions cannot be delegated to tenants: "+unsupported.join(", ")});
   const updatedAt=new Date();
   await permissionPolicyCollection.updateOne({id:"global"},{$set:{tenantAssignablePermissions,updatedAt,updatedBy:actor.id}},{upsert:true});
   // Keep previously stored role permissions intact. Effective tenant contexts hide
   // unavailable or revoked capabilities without deleting tenant-authored policy.
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
  ctx.server.post<{Body:{archiveBase64?:string}}>("/platform/plugin-packages",{bodyLimit:70*1024*1024},async(req,reply)=>{
   const actor=await guard(req,reply);if(!actor)return;
   const archiveBase64=req.body?.archiveBase64;
   if(typeof archiveBase64!=="string"||!archiveBase64.length)return reply.code(400).send({error:"archiveBase64 is required"});
   if(archiveBase64.length>Math.ceil(50*1024*1024*4/3)+8||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(archiveBase64))return reply.code(413).send({error:"ZIP payload must be canonical base64 and no larger than 50 MB"});
   const archive=Buffer.from(archiveBase64,"base64");
   if(archive.length>50*1024*1024||archive.toString("base64")!==archiveBase64)return reply.code(413).send({error:"ZIP payload is invalid or exceeds 50 MB"});
   const packages=db.collection("platform_plugin_packages");
   try{
    const installed=await installSignedPluginZip({
     archive,
     storageRoot:String(ctx.config.pluginPackagePath??"/data/bee-plugins"),
     publisherPublicKey:String(ctx.config.pluginPublisherPublicKey??""),
     runtimeVersion:ctx.version,
     validateManifest:async manifest=>{
      const hostFrontendContract=1;
      if((manifest.frontendContract??1)!==hostFrontendContract)throw new Error("Plugin update required: this package targets frontend contract "+String(manifest.frontendContract)+" but this Bee Core host supports "+hostFrontendContract+".");
      const existing=await packages.findOne({pluginId:manifest.id});
      if(existing&&existing.source!=="zip"&&!MIGRATABLE_BUILTIN_PLUGIN_IDS.has(manifest.id))throw new Error("Plugin ID is reserved by a built-in package");
      if(existing?.version){
       const current=existing.version.split(/[.+-]/)[0]!.split(".").map(Number);
       const incoming=manifest.version.split(/[.+-]/)[0]!.split(".").map(Number);
       const isUpgrade=incoming[0]!>current[0]!||(incoming[0]===current[0]&&incoming[1]!>current[1]!)||(incoming[0]===current[0]&&incoming[1]===current[1]&&incoming[2]!>current[2]!);
       const isSameVersion=incoming[0]===current[0]&&incoming[1]===current[1]&&incoming[2]===current[2];
       const isBundledMigration=existing.source!=="zip"&&isSameVersion;
       if(!isUpgrade&&!isBundledMigration)throw new Error("Package version must be newer than the currently installed version unless replacing the same-version bundled package");
      }
      for(const dependency of manifest.dependencies.filter(item=>!item.optional)){
       if(CORE_RUNTIME_PLUGIN_IDS.has(dependency.pluginId)){
        if(dependency.versionRange!=="*")throw new Error("Core runtime dependencies currently require the wildcard version range: "+dependency.pluginId);
        continue;
       }
       const dependencyPackage=await packages.findOne({pluginId:dependency.pluginId,status:"installed"});
       if(!dependencyPackage)throw new Error("Required platform dependency is not installed: "+dependency.pluginId);
       if(dependencyPackage.runtimeState==="failed")throw new Error("Required platform dependency is not healthy: "+dependency.pluginId);
       if(!satisfiesPluginVersion(String(dependencyPackage.version??"0.0.0"),dependency.versionRange))throw new Error("Installed dependency version does not satisfy "+dependency.pluginId+" "+dependency.versionRange);
      }
     }
    });
    const {manifest,digest,storageKey,packageDirectory,extractedFiles,extractedBytes}=installed;
    const now=new Date();
    await db.collection("platform_plugin_package_versions").updateOne(
     {pluginId:manifest.id,version:manifest.version},
     {$setOnInsert:{pluginId:manifest.id,version:manifest.version,digest,storageKey,packageDirectory,publisher:manifest.publisher,manifest,runtimeState:"stored_pending_runtime",installedAt:now,installedBy:actor.id,createdAt:now}},
     {upsert:true}
    );
    await db.collection("plugin_catalog").updateOne(
     {id:manifest.id},
     {$set:{
      name:manifest.name,version:manifest.version,description:manifest.description,category:manifest.category,
      dependencies:manifest.tenantDependencies??[],
      activationPolicy:manifest.activationPolicy??"manual",codeAvailable:false,status:"published"
     },$setOnInsert:{createdAt:now,visibleInPlans:[],includedInPlans:[],purchasable:false,system:false}},
     {upsert:true}
    );
    await packages.updateOne(
     {pluginId:manifest.id},
     {$set:{name:manifest.name,version:manifest.version,description:manifest.description,category:manifest.category,dependencies:manifest.dependencies.filter(item=>!item.optional).map(item=>item.pluginId),activationPolicy:manifest.activationPolicy??"manual",status:"installed",source:"zip",runtimeState:"stored_pending_runtime",publisher:manifest.publisher,digest,packageDirectory,backendEntrypoint:manifest.backend.entrypoint,frontendRoutes:manifest.frontend.routes,permissions:manifest.permissions,requiredServices:manifest.requiredServices??[],frontendContract:manifest.frontendContract??1,installedAt:now,installedBy:actor.id,updatedAt:now},$setOnInsert:{pluginId:manifest.id,createdAt:now}},
     {upsert:true}
    );
    ctx.logger.info("Platform package upload stored; mounting runtime without restarting Bee Core", { pluginId: manifest.id, version: manifest.version, actorId: actor.id });
    const runtime = await ctx.pluginRuntime?.mountStoredPackage(manifest.id);
    if (!runtime) throw new Error("Dynamic plugin runtime is not available");
    await recordPlatformAudit({actorId:actor.id,action:"plugin.package_uploaded",resourceType:"plugin_package",resourceId:manifest.id,metadata:{version:manifest.version,digest,publisher:manifest.publisher,extractedFiles,extractedBytes,runtimeState:"loaded"}});
    return reply.code(201).send({success:true,package:{id:mask(req.platformSession!,manifest.id,"plugin"),pluginKey:manifest.id,name:manifest.name,version:manifest.version,status:"installed",runtimeState:"loaded",activationPolicy:manifest.activationPolicy??"manual",extractedFiles,extractedBytes,storageKey}});
   }catch(error){
    const message=error instanceof Error?error.message:"Plugin package installation failed";
    ctx.logger.error("Platform package installation/runtime mount failed", { error: message });
    const status=/not configured/.test(message)?503:/already stored|already being installed|reserved by a built-in|must be newer|dependency is not installed|dependency is not healthy/.test(message)?409:/signature|digest|manifest|ZIP|archive|path|entrypoint|compatible|storageKey|README|frontend|backend|publisher|version/i.test(message)?400:500;
    await recordPlatformAudit({actorId:actor.id,action:"plugin.package_upload_failed",resourceType:"plugin_package",metadata:{error:message.slice(0,300)}});
    return reply.code(status).send({error:message});
   }
  });
  ctx.server.get<{Params:{pluginId:string}}>("/platform/plugin-packages/:pluginId/tenants",async(req,reply)=>{
   const actor=await guard(req,reply);if(!actor)return;
   const pluginId=String(req.params.pluginId??"");
   const packageRecord=await db.collection("platform_plugin_packages").findOne({pluginId});
   if(!packageRecord)return reply.code(404).send({error:"Platform package not found"});
   if(packageRecord.source!=="zip")return reply.code(409).send({error:"Only externally uploaded ZIP packages can be removed"});
   const [activeInstallations,inactiveInstallations,pendingJobs]=await Promise.all([
    db.collection("tenant_plugin_installations").find({pluginId,status:{$ne:"uninstalled"},enabled:{$ne:false}}).project<{tenantId:string;status:string;version?:string;updatedAt?:Date}>({tenantId:1,status:1,version:1,updatedAt:1,_id:0}).toArray(),
    db.collection("tenant_plugin_installations").find({pluginId,status:{$ne:"uninstalled"},enabled:false}).project<{tenantId:string;status:string;version?:string;updatedAt?:Date}>({tenantId:1,status:1,version:1,updatedAt:1,_id:0}).toArray(),
    db.collection("plugin_install_jobs").find({pluginId,status:{$in:["queued","running"]}}).project<{tenantId:string;action:string;status:string}>({tenantId:1,action:1,status:1,_id:0}).toArray()
   ]);
   const tenantIds=[...new Set([...activeInstallations,...inactiveInstallations,...pendingJobs].map(item=>item.tenantId))];
   const tenantRows=tenantIds.length?await companies.find({id:{$in:tenantIds}}).project<{id:string;name:string;slug?:string;kind?:string;status:string}>({id:1,name:1,slug:1,kind:1,status:1,_id:0}).toArray():[];
   const tenantById=new Map(tenantRows.map(item=>[item.id,item]));
   const publicTenant=(item:{tenantId:string;status:string;version?:string;updatedAt?:Date})=>({name:tenantById.get(item.tenantId)?.name??"Unknown tenant",slug:tenantById.get(item.tenantId)?.slug??null,kind:tenantById.get(item.tenantId)?.kind??"tenant",companyStatus:tenantById.get(item.tenantId)?.status??"unknown",installationStatus:item.status,version:item.version??null,updatedAt:item.updatedAt??null});
   return {
    pluginId,
    package:{name:packageRecord.name,version:packageRecord.version,status:packageRecord.status,runtimeState:packageRecord.runtimeState},
    canRemove:activeInstallations.length===0&&pendingJobs.length===0,
    installedCount:activeInstallations.length,
    inactiveCount:inactiveInstallations.length,
    pendingJobCount:pendingJobs.length,
    tenants:activeInstallations.map(publicTenant),
    inactiveTenants:inactiveInstallations.map(publicTenant),
    pendingJobs:pendingJobs.map(item=>({tenantName:tenantById.get(item.tenantId)?.name??"Unknown tenant",action:item.action,status:item.status}))
   };
  });
  ctx.server.delete<{Params:{pluginId:string}}>("/platform/plugin-packages/:pluginId",async(req,reply)=>{
   const actor=await guard(req,reply);if(!actor)return;
   const pluginId=String(req.params.pluginId??"");
   if(!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(pluginId))return reply.code(400).send({error:"Invalid plugin ID"});
   if(CORE_RUNTIME_PLUGIN_IDS.has(pluginId))return reply.code(409).send({error:"Core runtime plugins cannot be removed"});
   const packages=db.collection("platform_plugin_packages");
   const packageRecord=await packages.findOne({pluginId});
   if(!packageRecord)return reply.code(404).send({error:"Platform package not found"});
   if(packageRecord.source!=="zip")return reply.code(409).send({error:"Only externally uploaded ZIP packages can be removed"});
   if(packageRecord.status!=="installed")return reply.code(409).send({error:"Package is not in an installed state"});
   const dependent=await packages.findOne({pluginId:{$ne:pluginId},status:"installed",dependencies:pluginId});
   if(dependent)return reply.code(409).send({error:"Cannot remove this package while another installed package depends on it: "+dependent.pluginId});
   const claimed=await packages.updateOne({pluginId,status:"installed",source:"zip"},{$set:{status:"removing",updatedAt:new Date()}});
   if(claimed.modifiedCount!==1)return reply.code(409).send({error:"Package lifecycle changed; refresh and try again"});
   const [activeInstallations,inactiveInstallations,pendingJobs,versions]=await Promise.all([
    db.collection("tenant_plugin_installations").find({pluginId,status:{$ne:"uninstalled"},enabled:{$ne:false}}).toArray(),
    db.collection("tenant_plugin_installations").find({pluginId,status:{$ne:"uninstalled"},enabled:false}).toArray(),
    db.collection("plugin_install_jobs").find({pluginId,status:{$in:["queued","running"]}}).toArray(),
    db.collection("platform_plugin_package_versions").find({pluginId}).project<{version:string;packageDirectory?:string}>({version:1,packageDirectory:1,_id:0}).toArray()
   ]);
   if(activeInstallations.length||pendingJobs.length){
    await packages.updateOne({pluginId,status:"removing"},{$set:{status:"installed",updatedAt:new Date()}});
    return reply.code(409).send({error:"Package still has active tenant installations or lifecycle jobs",installedCount:activeInstallations.length,pendingJobCount:pendingJobs.length});
   }
   const storageRoot=resolve(String(ctx.config.pluginPackagePath??"/data/bee-plugins"));
   const pluginRoot=resolve(storageRoot,pluginId);
   const relativePluginRoot=relative(storageRoot,pluginRoot);
   if(!relativePluginRoot||relativePluginRoot.startsWith(".."+sep)||isAbsolute(relativePluginRoot)){
    await packages.updateOne({pluginId,status:"removing"},{$set:{status:"installed",updatedAt:new Date()}});
    return reply.code(400).send({error:"Resolved plugin storage path is unsafe"});
   }
   for(const version of versions){
    if(!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(version.version))||version.packageDirectory&&resolve(version.packageDirectory)!==resolve(pluginRoot,String(version.version))){
     await packages.updateOne({pluginId,status:"removing"},{$set:{status:"installed",updatedAt:new Date()}});
     return reply.code(409).send({error:"Stored package version path does not match its registered identity"});
    }
   }
   try {
    await ctx.pluginRuntime?.unmount(pluginId);
   } catch (error) {
    await packages.updateOne({pluginId,status:"removing"},{$set:{status:"installed",updatedAt:new Date()}});
    ctx.logger.error("Platform package removal aborted because its runtime could not be unloaded", { pluginId, error });
    return reply.code(409).send({error:"Plugin runtime could not be safely unloaded; package files and registry entry were preserved"});
   }
   try{
    const info=await lstat(pluginRoot);
    if(!info.isDirectory()||info.isSymbolicLink())throw new Error("Stored plugin package path is not a regular directory");
    await rm(pluginRoot,{recursive:true,force:false});
   }catch(error){
    if((error as NodeJS.ErrnoException).code!=="ENOENT"){
     await packages.updateOne({pluginId,status:"removing"},{$set:{status:"installed",updatedAt:new Date()}});
     try { await ctx.pluginRuntime?.mountStoredPackage(pluginId); }
     catch (reloadError) { ctx.logger.error("Package file removal failed and runtime recovery also failed", { pluginId, error, reloadError }); }
     return reply.code(500).send({error:"Could not remove stored package files; registry entry was preserved and runtime recovery was attempted"});
    }
   }
   if(inactiveInstallations.length){
    await db.collection("tenant_plugin_installations").updateMany(
     {pluginId,status:{$ne:"uninstalled"},enabled:false},
     {$set:{status:"uninstalled",updatedAt:new Date(),packageRemovedAt:new Date(),packageRemovedBy:actor.id}}
    );
   }
   await Promise.all([
    packages.deleteOne({pluginId,status:"removing"}),
    db.collection("platform_plugin_package_versions").deleteMany({pluginId}),
    db.collection("plugin_plan_package_assignments").deleteMany({pluginId}),
    db.collection("tenant_plugin_entitlements").deleteMany({pluginId})
   ]);
   await db.collection("plugin_catalog").updateOne({id:pluginId},{$set:{status:"deprecated",codeAvailable:false,updatedAt:new Date()}});
   await recordPlatformAudit({actorId:actor.id,action:"plugin.package_removed",resourceType:"plugin_package",resourceId:pluginId,metadata:{version:packageRecord.version,activeTenantInstallations:0,inactiveTenantInstallationsRetired:inactiveInstallations.length,tenantDataPreserved:true}});
   return {success:true,pluginId,restartRequired:false,runtimeUnloaded:true,tenantDataPreserved:true,message:"Package removed from the platform registry and unloaded from the current Bee Core process."};
  });
  ctx.server.get("/platform/plugin-plans",async(req,reply)=>{
   const actor=await guard(req,reply);if(!actor)return;
   const plans=await db.collection("plugin_plans").find({},{projection:{_id:0,id:1,name:1}}).sort({name:1}).toArray();
   const assignments=await db.collection("plugin_plan_package_assignments").find({}).project<{planId:string;pluginId:string}>({planId:1,pluginId:1,_id:0}).toArray();
   return {plans:plans.map(plan=>({...plan,packageIds:assignments.filter(item=>item.planId===plan.id).map(item=>item.pluginId)}))};
  });
  ctx.server.put<{Params:{pluginId:string};Body:{planIds?:unknown}}>("/platform/plugin-packages/:pluginId/plans",async(req,reply)=>{
   const actor=await guard(req,reply);if(!actor)return;
   const pluginId=req.params.pluginId;
   const requested=req.body?.planIds;
   if(!Array.isArray(requested)||requested.length>50||requested.some(id=>typeof id!=="string"))return reply.code(400).send({error:"planIds must be an array of plan IDs"});
   const planIds=[...new Set((requested as string[]).map(id=>id.trim()))];
   const packageRecord=await db.collection("platform_plugin_packages").findOne({pluginId,status:"installed"});
   if(!packageRecord)return reply.code(404).send({error:"Installed platform package not found"});
   const plans=db.collection("plugin_plans");
   const available=await plans.find({id:{$in:planIds}}).project<{id:string}>({id:1,_id:0}).toArray();
   if(available.length!==planIds.length)return reply.code(400).send({error:"One or more plan IDs do not exist"});
   const assignments=db.collection("plugin_plan_package_assignments");
   await assignments.deleteMany({pluginId,planId:{$nin:planIds}});
   for(const planId of planIds)await assignments.updateOne({planId,pluginId},{$setOnInsert:{planId,pluginId,createdAt:new Date(),createdBy:actor.id}},{upsert:true});
   const queued=await syncAutomaticPluginProvisioning(db,pluginId);
   const upgraded=await syncPluginPackageVersionUpdates(db,pluginId);
   await recordPlatformAudit({actorId:actor.id,action:"plugin.plan_entitlements_updated",resourceType:"plugin_package",resourceId:pluginId,metadata:{planIds,automaticInstallJobsQueued:queued,tenantUpgradeJobsQueued:upgraded}});
   return {success:true,pluginId:mask(req.platformSession!,pluginId,"plugin"),planIds,automaticInstallJobsQueued:queued,tenantUpgradeJobsQueued:upgraded};
  });
  ctx.server.put<{Params:{companyId:string;pluginId:string};Body:{granted?:boolean}}>("/platform/companies/:companyId/plugin-entitlements/:pluginId",async(req,reply)=>{
   const actor=await guard(req,reply);if(!actor)return;
   const company=await companies.findOne({id:req.params.companyId,status:"active",kind:{$ne:"super"}});
   if(!company)return reply.code(404).send({error:"Active tenant not found"});
   if(typeof req.body?.granted!=="boolean")return reply.code(400).send({error:"granted must be a boolean"});
   const packageRecord=await db.collection("platform_plugin_packages").findOne({pluginId:req.params.pluginId,status:"installed"});
   if(!packageRecord)return reply.code(404).send({error:"Installed platform package not found"});
   if(packageRecord.source==="zip"&&packageRecord.runtimeState!=="loaded")return reply.code(409).send({error:"Plugin backend is not loaded yet; restart Bee Core and verify the package before granting access"});
   const grants=db.collection("tenant_plugin_entitlements");
   if(req.body.granted){
    const now=new Date();
    await grants.updateOne({tenantId:company.id,pluginId:req.params.pluginId},{$set:{status:"granted",source:"manual",grantedBy:actor.id,grantedAt:now,updatedAt:now},$setOnInsert:{id:randomUUID(),tenantId:company.id,pluginId:req.params.pluginId,createdAt:now}},{upsert:true});
   }else{
    await grants.deleteOne({tenantId:company.id,pluginId:req.params.pluginId,source:"manual"});
   }
   const queued=req.body.granted?await syncAutomaticPluginProvisioning(db,req.params.pluginId):0;
    const upgraded=req.body.granted?await syncPluginPackageVersionUpdates(db,req.params.pluginId):0;
   await recordPlatformAudit({actorId:actor.id,action:req.body.granted?"plugin.tenant_entitlement_granted":"plugin.tenant_entitlement_revoked",tenantId:company.id,resourceType:"plugin_package",resourceId:req.params.pluginId,metadata:{source:"manual",granted:req.body.granted,automaticInstallJobsQueued:queued,tenantUpgradeJobsQueued:upgraded}});
   return {success:true,tenantId:mask(req.platformSession!,company.id,"tenant"),pluginId:mask(req.platformSession!,req.params.pluginId,"plugin"),granted:req.body.granted,automaticInstallJobsQueued:queued,tenantUpgradeJobsQueued:upgraded};
  });
  ctx.server.put<{Params:{pluginId:string};Body:{enabled?:boolean}}>("/platform/plugin-packages/:pluginId/activation",async(req,reply)=>{
   const actor=await guard(req,reply);if(!actor)return;
   const pluginId=String(req.params.pluginId??"");
   if(!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(pluginId))return reply.code(400).send({error:"Invalid plugin ID"});
   if(typeof req.body?.enabled!=="boolean")return reply.code(400).send({error:"enabled must be a boolean"});
   const packages=db.collection("platform_plugin_packages");
   const current=await packages.findOne({pluginId,status:{$ne:"deprecated"}});
   if(!current)return reply.code(404).send({error:"Platform package not found"});
   if(current.status!=="installed")return reply.code(409).send({error:"Install the platform package before changing its global availability"});
   if((current.globallyEnabled!==false)===req.body.enabled)return {success:true,pluginId,globallyEnabled:req.body.enabled,unchanged:true};
   const now=new Date();
   const expectedState:any={pluginId,status:"installed"};
   if(typeof current.globallyEnabled==="boolean")expectedState.globallyEnabled=current.globallyEnabled;else expectedState.globallyEnabled={$exists:false};
   const updated=await packages.updateOne(expectedState,{$set:{globallyEnabled:req.body.enabled,globallyEnabledAt:now,globallyEnabledBy:actor.id,updatedAt:now}});
   if(!updated.modifiedCount)return reply.code(409).send({error:"Platform package changed concurrently; refresh and retry"});
   try {
    if (req.body.enabled) {
     await ctx.pluginRuntime?.mountStoredPackage(pluginId);
    } else {
     await ctx.pluginRuntime?.unmount(pluginId);
    }
   } catch (error) {
    await packages.updateOne({pluginId,status:"installed"},{$set:{globallyEnabled:!req.body.enabled,updatedAt:new Date()}});
    ctx.logger.error("Global plugin activation runtime transition failed; persisted flag was rolled back", { pluginId, enabled: req.body.enabled, error });
    return reply.code(500).send({error:"Plugin runtime could not complete the requested global activation change"});
   }
   await recordPlatformAudit({actorId:actor.id,action:req.body.enabled?"plugin.globally_enabled":"plugin.globally_disabled",resourceType:"plugin_package",resourceId:pluginId,metadata:{globallyEnabled:req.body.enabled,tenantInstallationsPreserved:true,runtimeChanged:true}});
   return {success:true,pluginId,globallyEnabled:req.body.enabled,runtimeState:req.body.enabled?"loaded":"stored_pending_runtime",tenantInstallationsPreserved:true};
  });
  ctx.server.get("/platform/plugin-packages",async(req,reply)=>{
   const actor=await guard(req,reply);if(!actor)return;
   const packages=await listPlatformPluginPackages(db);
   return {packages:packages.map(item=>({
    id:mask(req.platformSession!,item.pluginId,"plugin"),
    pluginKey:item.pluginId,
    name:item.name,
    description:item.description,
    category:item.category,
    version:item.version,
    dependencies:item.dependencies,
    activationPolicy:item.activationPolicy??"manual",
    runtimeState:item.runtimeState??(item.source==="bundled"?"loaded":null),
    publisher:item.publisher??null,
    status:item.status,
    source:item.source,
    globallyEnabled:item.globallyEnabled!==false,
    installedAt:item.installedAt,
    updatedAt:item.updatedAt
   }))};
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
   await migrateLegacyPlatformPackageInstalls(db,superOrganization.id);
   const [platformPackages,tenantInstallations]=await Promise.all([
    listPlatformPluginPackages(db),
    db.collection("tenant_plugin_installations").find({tenantId:company.id}).toArray()
   ]);
   const globalByPlugin=new Map(platformPackages.map(item=>[item.pluginId,item]));
   const tenantByPlugin=new Map(tenantInstallations.map(item=>[String(item.pluginId),item]));
   const loadedZipIds=platformPackages
    .filter(item=>item.source==="zip"&&item.status==="installed"&&item.runtimeState==="loaded")
    .map(item=>item.pluginId);
   const externalCatalog=await db.collection<PluginPackageDefinition>("plugin_catalog").find({
    status:"published",
    $or:[{codeAvailable:true},{id:{$in:loadedZipIds},codeAvailable:false}]
   }).toArray();
   const externalDefinitions=externalCatalog.filter(plugin=>
    !TRUSTED_PLUGIN_PACKAGES.some(builtIn=>builtIn.id===plugin.id)&&
    (plugin.codeAvailable===true||loadedZipIds.includes(plugin.id))&&
    Boolean(getRuntimePlugin(plugin.id))
   );
   const definitions=[...TRUSTED_PLUGIN_PACKAGES,...externalDefinitions];
   const tenantCatalog=await getTenantPluginCatalog(db,company.id);
   const entitlementByPlugin=new Map(tenantCatalog.map(item=>[item.id,item]));
   return {tenantId:mask(req.platformSession!,company.id,"tenant"),plugins:definitions.map(plugin=>{
    const globalPackage=globalByPlugin.get(plugin.id);
    const tenantInstallation=tenantByPlugin.get(plugin.id);
    const installed=globalPackage?.status==="installed"&&(globalPackage.source!=="zip"||globalPackage.runtimeState==="loaded");
    const enabled=!!installed&&tenantInstallation?.status==="installed"&&tenantInstallation?.enabled!==false;
    const entitlement=entitlementByPlugin.get(plugin.id);
    return {id:mask(req.platformSession!,plugin.id,"plugin"),pluginKey:plugin.id,name:plugin.name,description:plugin.description,version:globalPackage?.version??plugin.version,system:plugin.system,installed,enabled,status:!installed?"uninstalled":enabled?"installed":"disabled",dependencies:plugin.dependencies,activationPolicy:plugin.activationPolicy??"manual",entitled:!!entitlement?.entitled,accessSource:entitlement?.accessSource??null};
   })};
  });
  ctx.server.put<{Params:{companyId:string;pluginId:string};Body:{enabled?:boolean}}>("/platform/companies/:companyId/plugins/:pluginId",async(req,reply)=>{
   const actor=await guard(req,reply);if(!actor)return;
   const company=await companies.findOne({id:req.params.companyId,status:"active"});
   if(!company)return reply.code(404).send({error:"Active company not found"});
   const plugin=await getPlatformPluginDefinition(req.params.pluginId);
   if(!plugin)return reply.code(404).send({error:"Trusted plugin package not found"});
   if(typeof req.body?.enabled!=="boolean")return reply.code(400).send({error:"enabled must be a boolean"});
   const superOrganization=await companies.findOne({kind:"super",status:"active"});
   if(!superOrganization)return reply.code(503).send({error:"Super Organization is unavailable"});
   const installations=db.collection("tenant_plugin_installations");
   const globalInstallation=await db.collection("platform_plugin_packages").findOne({pluginId:plugin.id,status:"installed"});
   if(!globalInstallation)return reply.code(409).send({error:"Plugin is not installed on the platform. Install it first in Super Organization → Plugins."});
   const installation=await installations.findOne({tenantId:company.id,pluginId:plugin.id});
   const currentEnabled=!!installation&&installation.status==="installed"&&installation.enabled!==false;
   if(req.body.enabled===currentEnabled)return {success:true,tenantId:mask(req.platformSession!,company.id,"tenant"),pluginId:mask(req.platformSession!,plugin.id,"plugin"),installed:true,enabled:currentEnabled,unchanged:true};
   if(!req.body.enabled){
    const activeInstallations=await installations.find({tenantId:company.id,status:"installed",enabled:{$ne:false},pluginId:{$ne:plugin.id}}).project<{pluginId:string}>({pluginId:1,_id:0}).toArray();
    for(const active of activeInstallations){
     const dependent=await getPlatformPluginDefinition(String(active.pluginId));
     if(dependent?.dependencies.includes(plugin.id))return reply.code(409).send({error:"Cannot deactivate this plugin while the dependent plugin is enabled: "+dependent.name});
    }
    if(installation?.status==="installed"){
     const now=new Date();
     await installations.updateOne({tenantId:company.id,pluginId:plugin.id,status:"installed"},{$set:{enabled:false,enabledUpdatedAt:now,enabledUpdatedBy:actor.id,updatedAt:now}});
    }
   }else{
    // Super Organization is the platform root: an installed platform package is available to it without a commercial tenant entitlement.
    // Commercial tenants must still pass the normal plan, purchase or manual-grant check.
    if(company.kind!=="super"&&!await hasPluginEntitlement(db,company.id,plugin.id))return reply.code(402).send({error:"This company plan or an active plugin purchase does not include this package"});
    for(const dependencyId of plugin.dependencies){
     const dependencyGlobal=await db.collection("platform_plugin_packages").findOne({pluginId:dependencyId,status:"installed"});
     const dependencyTenant=await installations.findOne({tenantId:company.id,pluginId:dependencyId,status:"installed",enabled:{$ne:false}});
     if(!dependencyGlobal||!dependencyTenant)return reply.code(409).send({error:"Activate the required plugin first: "+dependencyId});
    }
    const now=new Date();
    if(!installation||installation.status!=="installed"){
     const tenantMigrations=(plugin.migrations??[]).filter(migration=>!migration.phase||migration.phase==="install");
     const migrationRun=await runTenantPluginMigrations(db,company.id,plugin.id,tenantMigrations);
     try{
      await plugin.installTenant?.(db,company.id);
      await installations.updateOne(
       {tenantId:company.id,pluginId:plugin.id},
       {$set:{status:"installed",version:String(globalInstallation.version??plugin.version),installedAt:now,updatedAt:now,enabled:true,enabledUpdatedAt:now,enabledUpdatedBy:actor.id},$setOnInsert:{id:randomUUID(),tenantId:company.id,pluginId:plugin.id}},
       {upsert:true}
      );
     }catch(error){
      const rollback=await rollbackTenantPluginMigrations(db,company.id,plugin.id,tenantMigrations,migrationRun.applied);
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