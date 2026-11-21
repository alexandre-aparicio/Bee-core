import type { BeePlugin } from "../../core/types.js";

declare module "fastify" {
 interface FastifyRequest {
  platformSession?: { sessionId: string; expiresAt: Date };
 }
}
import bcrypt from "bcryptjs";
import { MongoClient, type Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { normalizeTenantSlug, slugifyTenantName } from "../../core/tenant-domain.js";
import { enqueuePluginInstallJob, enqueuePluginUninstallJob } from "../../core/plugin-install-jobs.js";
import { getTrustedPluginPackage, isPluginInstalled } from "../../core/plugin-entitlements.js";
import { maskResourceId, unmaskResourceId } from "../../core/session-id.js";

type Company={id:string;name:string;slug?:string;createdAt:Date;status:"active"|"suspended"};
type User={_id?:import("mongodb").ObjectId;id:string;email:string;passwordHash:string;roles:string[];platformRole?:string;enabled:boolean;allowedClients:string[];tenantId?:string;createdAt:Date;updatedAt:Date};
type Membership={id:string;userId:string;tenantId:string;role:"owner"|"admin"|"manager"|"member";status:"active";createdAt:Date;updatedAt:Date};
type Claims={sub?:string;sid?:string;client?:string;aud?:string;platformRole?:string};
export const platformAdminPlugin:BeePlugin={
 manifest:{name:"platform-admin",version:"0.1.0",description:"Platform-wide administration for the bootstrap superadministrator",dependencies:["auth","organizations","marketplace"]},
 async initialize(ctx){
  const mongo=new MongoClient(String(ctx.config.mongoUri??""),{maxPoolSize:8,serverSelectionTimeoutMS:10000});
  await mongo.connect();const db:Db=mongo.db(String(ctx.config.mongoDbName??"bee_core"));
  const users=db.collection<User>("users"),sessions=db.collection("refresh_sessions"),companies=db.collection<Company>("tenants"),memberships=db.collection<Membership>("memberships");
  const sessionIdSecret=String(ctx.config.sessionIdSecret ?? ctx.config.jwtSecret ?? "");
  if(sessionIdSecret.length<32)throw new Error("Platform admin: JWT_SECRET must contain at least 32 characters.");
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
    try {
     if(req.params?.companyId)req.params.companyId=unmaskResourceId(String(req.params.companyId),"tenant",sessionContext,sessionIdSecret);
     if(req.params?.pluginId)req.params.pluginId=unmaskResourceId(String(req.params.pluginId),"plugin",sessionContext,sessionIdSecret);
    } catch { return reply.code(404).send({error:"Resource not found"}),null; }
    req.platformSession=sessionContext;
    return user;
   }catch{return reply.code(401).send({error:"Unauthorized"}),null;}
  };
  ctx.server.get("/platform/me",async(req,reply)=>{const user=await guard(req,reply);if(!user)return;return {platformAdmin:true,role:user.platformRole,email:user.email};});
  ctx.server.get("/platform/companies",async(req,reply)=>{const user=await guard(req,reply);if(!user)return;const list=await companies.find({}).sort({createdAt:-1}).toArray();return {companies:await Promise.all(list.map(async c=>({id:mask(req.platformSession,c.id,"tenant"),name:c.name,slug:c.slug??null,status:c.status??"active",createdAt:c.createdAt,membersCount:await memberships.countDocuments({tenantId:c.id,status:"active"})}))) };});
  ctx.server.post<{Body:{name?:string;slug?:string;ownerEmail?:string;ownerPassword?:string}}>("/platform/companies",async(req,reply)=>{
   const actor=await guard(req,reply);if(!actor)return;
   const name=String(req.body?.name??"").trim();const ownerEmail=String(req.body?.ownerEmail??"").trim().toLowerCase();
   if(name.length<2||name.length>120||!ownerEmail||!/^\S+@\S+\.\S+$/.test(ownerEmail))return reply.code(400).send({error:"Company name and valid owner email are required"});
   let slug:string;
   try{slug=normalizeTenantSlug(req.body?.slug||slugifyTenantName(name));}catch(error){return reply.code(400).send({error:error instanceof Error?error.message:"Invalid tenant slug"});}
   if(await companies.findOne({slug},{projection:{_id:1}}))return reply.code(409).send({error:"This tenant slug is already in use"});
   const now=new Date(),tenantId=randomUUID();
   const company:Company={id:tenantId,name,slug,createdAt:now,status:"active"};
   let owner:User|null=await users.findOne({email:ownerEmail});
   if(!owner){const password=String(req.body?.ownerPassword??"");if(password.length<12)return reply.code(400).send({error:"For a new owner, ownerPassword must contain at least 12 characters"});
    owner={id:randomUUID(),email:ownerEmail,passwordHash:await bcrypt.hash(password,12),roles:["user"],enabled:true,allowedClients:["dashboard","public"],tenantId,createdAt:now,updatedAt:now};
    await users.insertOne(owner);
   }
   if(!owner.enabled)return reply.code(409).send({error:"Owner account is disabled"});
   await companies.insertOne(company);
   await memberships.updateOne({userId:owner.id,tenantId},{$setOnInsert:{id:randomUUID(),userId:owner.id,tenantId,role:"owner",status:"active",createdAt:now,updatedAt:now}},{upsert:true});
   return reply.code(201).send({company:{id:mask(req.platformSession,company.id,"tenant"),name:company.name,slug:company.slug,status:company.status,createdAt:company.createdAt},owner:{id:mask(req.platformSession,owner.id,"user"),email:owner.email}});
  });
  ctx.server.patch<{Params:{companyId:string};Body:{status?:"active"|"suspended"}}>("/platform/companies/:companyId",async(req,reply)=>{
   const actor=await guard(req,reply);if(!actor)return;const status=req.body?.status;
   if(status!=="active"&&status!=="suspended")return reply.code(400).send({error:"status must be active or suspended"});
   const result=await companies.updateOne({id:req.params.companyId},{$set:{status}});
   if(!result.matchedCount)return reply.code(404).send({error:"Company not found"});
   return {success:true,companyId:mask(req.platformSession,req.params.companyId,"tenant"),status};
  });
  ctx.server.get<{Params:{companyId:string}}>("/platform/companies/:companyId/plugins",async(req,reply)=>{
   const actor=await guard(req,reply);if(!actor)return;
   const company=await companies.findOne({id:req.params.companyId});
   if(!company)return reply.code(404).send({error:"Company not found"});
   const plugin=getTrustedPluginPackage("hello-world");
   if(!plugin)return reply.code(404).send({error:"Plugin package not found"});
   const installation=await db.collection("tenant_plugin_installations").findOne({tenantId:company.id,pluginId:plugin.id});
   return {tenantId:mask(req.platformSession,company.id,"tenant"),plugins:[{id:mask(req.platformSession,plugin.id,"plugin"),name:plugin.name,description:plugin.description,installed:await isPluginInstalled(db,company.id,plugin.id),status:installation?.status??"uninstalled"}]};
  });
  ctx.server.put<{Params:{companyId:string;pluginId:string};Body:{enabled?:boolean}}>("/platform/companies/:companyId/plugins/:pluginId",async(req,reply)=>{
   const actor=await guard(req,reply);if(!actor)return;
   const company=await companies.findOne({id:req.params.companyId,status:"active"});
   if(!company)return reply.code(404).send({error:"Active company not found"});
   const plugin=getTrustedPluginPackage(req.params.pluginId);
   if(!plugin||plugin.system)return reply.code(404).send({error:"Manageable plugin package not found"});
   if(typeof req.body?.enabled!=="boolean")return reply.code(400).send({error:"enabled must be a boolean"});
   const installed=await isPluginInstalled(db,company.id,plugin.id);
   if(req.body.enabled===installed)return {success:true,tenantId:mask(req.platformSession,company.id,"tenant"),pluginId:mask(req.platformSession,plugin.id,"plugin"),enabled:installed,unchanged:true};
   if(req.body.enabled){
    const queued=await enqueuePluginInstallJob(db.collection("plugin_install_jobs") as any,{tenantId:company.id,pluginId:plugin.id,actorId:actor.id});
    if(queued.job.action!=="install")return reply.code(409).send({error:"A plugin lifecycle operation is already in progress"});
    return reply.code(202).send({success:true,tenantId:mask(req.platformSession,company.id,"tenant"),pluginId:mask(req.platformSession,plugin.id,"plugin"),enabled:true,jobId:mask(req.platformSession,queued.job.id,"job"),status:queued.job.status});
   }
   const queued=await enqueuePluginUninstallJob(db.collection("plugin_install_jobs") as any,{tenantId:company.id,pluginId:plugin.id,actorId:actor.id});
   if(queued.job.action!=="uninstall")return reply.code(409).send({error:"A plugin lifecycle operation is already in progress"});
   return reply.code(202).send({success:true,tenantId:mask(req.platformSession,company.id,"tenant"),pluginId:mask(req.platformSession,plugin.id,"plugin"),enabled:false,jobId:mask(req.platformSession,queued.job.id,"job"),status:queued.job.status});
  });
  ctx.server.addHook("onClose",async()=>mongo.close());
  ctx.logger.info("Platform admin plugin initialized",{platformRole:"superadmin"});
 }
};
