import type { BeePlugin } from "../../core/types.js";
import type { PlatformIdentityDocument } from "../../core/platform-identity.js";

declare module "fastify" {
 interface FastifyRequest {
  platformSession?: { sessionId: string; expiresAt: Date };
 }
}
import bcrypt from "bcryptjs";
import type { Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { normalizeTenantSlug, slugifyTenantName } from "../../core/tenant-domain.js";
import { enqueuePluginInstallJob, enqueuePluginUninstallJob } from "../../core/plugin-install-jobs.js";
import { getTrustedPluginPackage, isPluginInstalled } from "../../core/plugin-entitlements.js";
import { maskResourceId, unmaskResourceId } from "../../core/session-id.js";

type Company={id:string;name:string;slug?:string;kind?:"super"|"tenant";settings?:{defaultLanguage?:"en"|"es"};createdAt:Date;status:"active"|"suspended"};
type User={_id?:import("mongodb").ObjectId;id:string;email:string;passwordHash:string;roles:string[];platformRole?:string;mfaSecretEnc?:string;enabled:boolean;allowedClients:string[];tenantId?:string;createdAt:Date;updatedAt:Date};
type Membership={id:string;userId:string;tenantId:string;role:"super_admin"|"owner"|"admin"|"manager"|"member"|"guest"|"custom";status:"active";createdAt:Date;updatedAt:Date};
type Claims={sub?:string;sid?:string;client?:string;aud?:string};
export const platformAdminPlugin:BeePlugin={
 manifest:{name:"platform-admin",version:"0.1.0",description:"Platform-wide administration for the bootstrap superadministrator",dependencies:["auth","organizations","marketplace"]},
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
   const existingSlug=await companies.findOne({slug:"super-organization"});
   const now=new Date();
   const superOrganizationId="bee-core-super-organization";
   superOrganization=await companies.findOne({id:superOrganizationId});
   if(!superOrganization){
    const slug=existingSlug?"bee-core-super-organization":"super-organization";
    superOrganization={id:superOrganizationId,name:"Bee-Core Super Organization",slug,kind:"super",createdAt:now,status:"active",settings:{defaultLanguage:"en"}};
    await companies.insertOne(superOrganization);
   }else{
    await companies.updateOne({id:superOrganizationId},{$set:{kind:"super",status:"active",name:"Bee-Core Super Organization"}});
    superOrganization={...superOrganization,kind:"super",status:"active"};
   }
  }
  const legacyFilter:any={$or:[{platformRole:"superadmin"},...(bootstrapEmail?[{email:bootstrapEmail}]:[])]};
  const legacyAdmins=await users.find(legacyFilter).toArray();
  for(const legacyAdmin of legacyAdmins){
   const now=new Date();
   await memberships.updateOne(
    {userId:legacyAdmin.id,tenantId:superOrganization.id},
    {$set:{role:"super_admin",status:"active",updatedAt:now},$setOnInsert:{id:randomUUID(),userId:legacyAdmin.id,tenantId:superOrganization.id,createdAt:now}},
    {upsert:true}
   );
   const moved=legacyAdmin.tenantId!==superOrganization.id||legacyAdmin.platformRole==="superadmin";
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
    const user=await users.findOne({id:userId,enabled:true,platformRole:"superadmin"});
    if(!user)return reply.code(403).send({error:"Platform superadministrator required"}),null;
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
  ctx.server.get<{Params:{companyId:string}}>("/platform/companies/:companyId/plugins",async(req,reply)=>{
   const actor=await guard(req,reply);if(!actor)return;
   const company=await companies.findOne({id:req.params.companyId});
   if(!company)return reply.code(404).send({error:"Company not found"});
   const plugin=getTrustedPluginPackage("hello-world");
   if(!plugin)return reply.code(404).send({error:"Plugin package not found"});
   const installation=await db.collection("tenant_plugin_installations").findOne({tenantId:company.id,pluginId:plugin.id});
   return {tenantId:mask(req.platformSession!,company.id,"tenant"),plugins:[{id:mask(req.platformSession!,plugin.id,"plugin"),name:plugin.name,description:plugin.description,installed:await isPluginInstalled(db,company.id,plugin.id),status:installation?.status??"uninstalled"}]};
  });
  ctx.server.put<{Params:{companyId:string;pluginId:string};Body:{enabled?:boolean}}>("/platform/companies/:companyId/plugins/:pluginId",async(req,reply)=>{
   const actor=await guard(req,reply);if(!actor)return;
   const company=await companies.findOne({id:req.params.companyId,status:"active"});
   if(!company)return reply.code(404).send({error:"Active company not found"});
   const plugin=getTrustedPluginPackage(req.params.pluginId);
   if(!plugin||plugin.system)return reply.code(404).send({error:"Manageable plugin package not found"});
   if(typeof req.body?.enabled!=="boolean")return reply.code(400).send({error:"enabled must be a boolean"});
   const installed=await isPluginInstalled(db,company.id,plugin.id);
   if(req.body.enabled===installed)return {success:true,tenantId:mask(req.platformSession!,company.id,"tenant"),pluginId:mask(req.platformSession!,plugin.id,"plugin"),enabled:installed,unchanged:true};
   if(req.body.enabled){
    const queued=await enqueuePluginInstallJob(db.collection("plugin_install_jobs") as any,{tenantId:company.id,pluginId:plugin.id,actorId:actor.id});
    if(queued.job.action!=="install")return reply.code(409).send({error:"A plugin lifecycle operation is already in progress"});
    await recordPlatformAudit({actorId:actor.id,action:"plugin.install.requested",tenantId:company.id,resourceType:"plugin",resourceId:plugin.id,metadata:{jobId:queued.job.id}});
    return reply.code(202).send({success:true,tenantId:mask(req.platformSession!,company.id,"tenant"),pluginId:mask(req.platformSession!,plugin.id,"plugin"),enabled:true,jobId:mask(req.platformSession!,queued.job.id,"job"),status:queued.job.status});
   }
   const queued=await enqueuePluginUninstallJob(db.collection("plugin_install_jobs") as any,{tenantId:company.id,pluginId:plugin.id,actorId:actor.id});
   if(queued.job.action!=="uninstall")return reply.code(409).send({error:"A plugin lifecycle operation is already in progress"});
   await recordPlatformAudit({actorId:actor.id,action:"plugin.uninstall.requested",tenantId:company.id,resourceType:"plugin",resourceId:plugin.id,metadata:{jobId:queued.job.id}});
   return reply.code(202).send({success:true,tenantId:mask(req.platformSession!,company.id,"tenant"),pluginId:mask(req.platformSession!,plugin.id,"plugin"),enabled:false,jobId:mask(req.platformSession!,queued.job.id,"job"),status:queued.job.status});
  });
  ctx.logger.info("Platform admin plugin initialized",{platformRole:"superadmin"});
 }
};
