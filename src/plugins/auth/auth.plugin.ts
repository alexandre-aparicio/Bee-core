import type { BeePlugin } from "../../core/types.js";
import jwt from "@fastify/jwt";
import bcrypt from "bcryptjs";
import { MongoClient, type Collection, type Db } from "mongodb";
import { createHash, randomBytes, randomUUID } from "node:crypto";

type ClientType = "backend" | "dashboard" | "public";
type Role = "admin" | "user" | "service";
type UserRecord = { id:string; email:string; passwordHash:string; roles:Role[]; enabled:boolean; allowedClients:ClientType[]; tenantId?:string; createdAt:Date; updatedAt:Date };
type RefreshSession = { id:string; userId:string; tokenHash:string; client:ClientType; expiresAt:Date; revokedAt:Date|null; createdAt:Date };
type LoginBody = { email?:string; password?:string; client?:ClientType };
type RefreshBody = { refreshToken?:string };
const validClients:ClientType[]=["backend","dashboard","public"];
const publicUser=(u:UserRecord)=>({id:u.id,email:u.email,roles:u.roles,allowedClients:u.allowedClients,tenantId:u.tenantId??"default"});
const clientFrom=(v:unknown):ClientType|null=>validClients.includes(v as ClientType)?v as ClientType:null;
const hashToken=(t:string)=>createHash("sha256").update(t).digest("hex");
const makeRefreshToken=()=>randomBytes(48).toString("base64url");
const refreshExpiry=()=>new Date(Date.now()+30*24*60*60*1000);

export const authPlugin:BeePlugin={
 manifest:{name:"auth",version:"0.3.0",description:"Persistent authentication for backend, dashboard and public frontend clients"},
 async initialize(ctx){
  const secret=String(ctx.config.jwtSecret??""),mongoUri=String(ctx.config.mongoUri??""),dbName=String(ctx.config.mongoDbName??"bee_core");
  if(secret.length<32)throw new Error("Auth: JWT_SECRET must contain at least 32 characters.");
  if(!mongoUri)throw new Error("Auth: MONGODB_URI is required.");
  await ctx.server.register(jwt,{secret,sign:{expiresIn:"20m"}});
  const mongo=new MongoClient(mongoUri,{maxPoolSize:10,serverSelectionTimeoutMS:10000});
  await mongo.connect(); const db:Db=mongo.db(dbName);
  const users:Collection<UserRecord>=db.collection("users"),sessions:Collection<RefreshSession>=db.collection("refresh_sessions");
  const templatePreferences=db.collection<{tenantId?:string;userId?:string;public:string;dashboard:string;themeTokens?:Record<string,string>;updatedAt:Date}>("template_preferences");
  const templateStreamTickets=new Map<string,{tenantId:string;expiresAt:number}>();
  const templateSubscribers=new Map<string,Set<import("node:http").ServerResponse>>();
  const broadcastTemplateUpdate=(tenantId:string,payload:unknown)=>{const clients=templateSubscribers.get(tenantId);if(!clients)return;const event=`event: template-update\ndata: ${JSON.stringify(payload)}\n\n`;for(const client of clients){if(client.destroyed){clients.delete(client);continue;}client.write(event);}if(!clients.size)templateSubscribers.delete(tenantId);};
  const defaultTenantId=String(ctx.config.defaultTenantId??"default").trim()||"default";
  const tenants=db.collection<{id:string;name:string;domains?:string[];createdAt:Date}>("tenants");
  await Promise.all([
   users.createIndex({email:1},{unique:true,name:"users_email_unique"}),
   users.createIndex({id:1},{unique:true,name:"users_id_unique"}),
   sessions.createIndex({tokenHash:1},{unique:true,name:"refresh_token_hash_unique"}),
   sessions.createIndex({userId:1},{name:"refresh_sessions_user"}),
   sessions.createIndex({expiresAt:1},{expireAfterSeconds:0,name:"refresh_sessions_ttl"}),
   tenants.createIndex({id:1},{unique:true,name:"tenants_id_unique"}),
   tenants.createIndex({domains:1},{unique:true,sparse:true,name:"tenants_domains_unique"})
  ]);
  await tenants.updateOne({id:defaultTenantId},{$setOnInsert:{id:defaultTenantId,name:defaultTenantId,createdAt:new Date()}},{upsert:true});
  const preferenceIndexes=await templatePreferences.listIndexes().toArray();
  if(preferenceIndexes.some(index=>index.name==="template_preferences_user_unique"))await templatePreferences.dropIndex("template_preferences_user_unique");
  for await(const legacy of templatePreferences.find({tenantId:{$exists:false},userId:{$exists:true}}).sort({updatedAt:-1})){
   const legacyUserId=String(legacy.userId??"");
   const owner=legacyUserId?await users.findOne({id:legacyUserId}):null;
   const tenantId=owner?.tenantId??defaultTenantId;
   await templatePreferences.updateOne({tenantId},{$setOnInsert:{tenantId,public:legacy.public??"aurora",dashboard:legacy.dashboard??"midnight",...(legacy.themeTokens?{themeTokens:legacy.themeTokens}:{}),updatedAt:legacy.updatedAt??new Date()}},{upsert:true});
   await templatePreferences.deleteOne({_id:legacy._id});
  }
  await templatePreferences.createIndex({tenantId:1},{unique:true,name:"template_preferences_tenant_unique"});

  const adminEmail=String(ctx.config.authAdminEmail??"").trim().toLowerCase(),adminPassword=String(ctx.config.authAdminPassword??"");
  if(adminEmail&&adminPassword){
   if(adminPassword.length<12)throw new Error("Auth: bootstrap admin password must be at least 12 characters.");
   await users.updateOne({email:adminEmail},{$setOnInsert:{id:"bootstrap-admin",email:adminEmail,passwordHash:await bcrypt.hash(adminPassword,12),roles:["admin"],enabled:true,allowedClients:validClients,tenantId:defaultTenantId,createdAt:new Date(),updatedAt:new Date()}},{upsert:true});
   ctx.logger.info("Auth bootstrap administrator ensured (existing account credentials are not overwritten).");
  }
  const issue=(u:Pick<UserRecord,"id"|"email"|"roles"|"tenantId">,client:ClientType)=>ctx.server.jwt.sign({sub:u.id,email:u.email,roles:u.roles,tenantId:u.tenantId??defaultTenantId,client,aud:"bee-core"});
  ctx.server.post<{Body:LoginBody}>("/auth/login",async(req,reply)=>{
   const email=String(req.body?.email??"").trim().toLowerCase(),password=String(req.body?.password??""),client=clientFrom(req.body?.client);
   if(!email||!password||!client)return reply.code(400).send({error:"email, password and valid client required"});
   const u=await users.findOne({email,enabled:true});
   if(!u||!await bcrypt.compare(password,u.passwordHash))return reply.code(401).send({error:"Invalid credentials"});
   if(!u.allowedClients.includes(client))return reply.code(403).send({error:"Client access denied"});
   if(!u.tenantId){u.tenantId=defaultTenantId;await users.updateOne({id:u.id},{$set:{tenantId:defaultTenantId,updatedAt:new Date()}});}
   const accessToken=issue(u,client),refreshToken=makeRefreshToken();
   await sessions.insertOne({id:randomUUID(),userId:u.id,tokenHash:hashToken(refreshToken),client,expiresAt:refreshExpiry(),revokedAt:null,createdAt:new Date()});
   await ctx.events.emit("auth.login",{userId:u.id,client,at:new Date().toISOString()});
   return {accessToken,refreshToken,tokenType:"Bearer",expiresIn:1200,refreshExpiresIn:2592000,user:publicUser(u),client};
  });
  ctx.server.post<{Body:RefreshBody}>("/auth/refresh",async(req,reply)=>{
   const raw=String(req.body?.refreshToken??"");if(raw.length<40)return reply.code(400).send({error:"refreshToken required"});
   const next=makeRefreshToken(),session=await sessions.findOneAndUpdate({tokenHash:hashToken(raw),revokedAt:null,expiresAt:{$gt:new Date()}},{$set:{tokenHash:hashToken(next),expiresAt:refreshExpiry()}},{returnDocument:"after"});
   if(!session)return reply.code(401).send({error:"Invalid or expired refresh token"});
   const u=await users.findOne({id:session.userId,enabled:true});
   if(!u||!u.allowedClients.includes(session.client)){await sessions.updateOne({id:session.id},{$set:{revokedAt:new Date()}});return reply.code(401).send({error:"Invalid or expired refresh token"});}
   return {accessToken:issue(u,session.client),refreshToken:next,tokenType:"Bearer",expiresIn:1200,refreshExpiresIn:2592000,client:session.client};
  });
  ctx.server.get("/auth/me",async(req,reply)=>{try{await req.jwtVerify();const c=req.user as {sub?:string;email?:string;roles?:Role[];client?:ClientType;aud?:string};if(c.aud!=="bee-core"||!c.sub||!c.client)return reply.code(401).send({error:"Unauthorized"});return {authenticated:true,user:{id:c.sub,email:c.email,roles:c.roles},client:c.client};}catch{return reply.code(401).send({error:"Unauthorized"});}});
  ctx.server.post<{Body:RefreshBody}>("/auth/logout",async(req,reply)=>{try{await req.jwtVerify();const raw=String(req.body?.refreshToken??"");if(raw)await sessions.updateOne({tokenHash:hashToken(raw),revokedAt:null},{$set:{revokedAt:new Date()}});return {success:true,message:"Refresh session revoked. Current access token expires within 20 minutes."};}catch{return reply.code(401).send({error:"Unauthorized"});}});

  const templateDefaults={public:"aurora",dashboard:"midnight"} as const;
  const allowedThemeTokens=["--bg","--panel","--muted","--border","--purple","--cyan"] as const;
  const defaultThemeTokens:Record<string,string>={"--bg":"#080a12","--panel":"#10131e","--muted":"#8991a4","--border":"#303447","--purple":"#8c72ff","--cyan":"#69e5d4"};
  const allowedTemplates={public:["aurora","editorial"],dashboard:["midnight","paper"]} as const;
  const readTemplateTenant=async(req:import("fastify").FastifyRequest,reply:import("fastify").FastifyReply)=>{
   try{
    await req.jwtVerify();
    const claims=req.user as {sub?:string;tenantId?:string;aud?:string};
    if(claims.aud!=="bee-core"||!claims.sub){reply.code(401).send({error:"Unauthorized"});return null;}
    const user=await users.findOne({id:claims.sub,enabled:true});
    if(!user){reply.code(401).send({error:"Unauthorized"});return null;}
    const tenantId=String(user.tenantId??defaultTenantId);
    if(claims.tenantId&&claims.tenantId!==tenantId){reply.code(401).send({error:"Tenant membership changed; sign in again"});return null;}
    return tenantId;
   }catch{reply.code(401).send({error:"Unauthorized"});return null;}
  };
  ctx.server.get("/templates/public",async(req)=>{
   const host=String(req.hostname??"").toLowerCase().replace(/:\d+$/,"");
   const tenant=await tenants.findOne({domains:host});
   const tenantId=tenant?.id??defaultTenantId;
   const saved=await templatePreferences.findOne({tenantId});
   return {tenantId,selection:{public:saved?.public??templateDefaults.public,dashboard:saved?.dashboard??templateDefaults.dashboard},tokens:{...defaultThemeTokens,...(saved?.themeTokens??{})},customized:Boolean(saved?.themeTokens)};
  });
  ctx.server.put<{Body:{domains?:string[]}}>("/tenants/domains",async(req,reply)=>{
   const tenantId=await readTemplateTenant(req,reply);if(!tenantId)return;
   const claims=req.user as {roles?:Role[]};
   if(!claims.roles?.includes("admin"))return reply.code(403).send({error:"Tenant administrator required"});
   const domains=req.body?.domains;
   if(!Array.isArray(domains)||domains.some(domain=>typeof domain!=="string"||!/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain.trim())))return reply.code(400).send({error:"Provide valid domain names"});
   const normalized=[...new Set(domains.map(domain=>domain.trim().toLowerCase()))];
   try{await tenants.updateOne({id:tenantId},{$set:{domains:normalized}},{upsert:true});}
   catch(error){return reply.code(409).send({error:"A domain is already assigned to another tenant"});}
   return {tenantId,domains:normalized};
  });
  ctx.server.get("/templates/preferences",async(req,reply)=>{
   const tenantId=await readTemplateTenant(req,reply);if(!tenantId)return;
   const saved=await templatePreferences.findOne({tenantId});
   return {tenantId,selection:{public:saved?.public??templateDefaults.public,dashboard:saved?.dashboard??templateDefaults.dashboard}};
  });
  ctx.server.put<{Body:{public?:string;dashboard?:string}}>("/templates/preferences",async(req,reply)=>{
   const tenantId=await readTemplateTenant(req,reply);if(!tenantId)return;
   const claims=req.user as {roles?:Role[]};
   if(!claims.roles?.includes("admin"))return reply.code(403).send({error:"Tenant administrator required"});
   const body=req.body??{};
   if(body.public!==undefined&&!(allowedTemplates.public as readonly string[]).includes(body.public))return reply.code(400).send({error:"Invalid public template"});
   if(body.dashboard!==undefined&&!(allowedTemplates.dashboard as readonly string[]).includes(body.dashboard))return reply.code(400).send({error:"Invalid dashboard template"});
   if(body.public===undefined&&body.dashboard===undefined)return reply.code(400).send({error:"At least one template selection is required"});
   const current=await templatePreferences.findOne({tenantId});
   const selection={public:body.public??current?.public??templateDefaults.public,dashboard:body.dashboard??current?.dashboard??templateDefaults.dashboard};
   await templatePreferences.updateOne({tenantId},{$set:{...selection,updatedAt:new Date()}},{upsert:true});
   broadcastTemplateUpdate(tenantId,{type:"preferences",selection});
   return {tenantId,selection};
  });
  ctx.server.get("/templates/theme",async(req,reply)=>{
   const tenantId=await readTemplateTenant(req,reply);if(!tenantId)return;
   const saved=await templatePreferences.findOne({tenantId});
   return {tenantId,tokens:{...defaultThemeTokens,...(saved?.themeTokens??{})},customized:Boolean(saved?.themeTokens)};
  });
  ctx.server.put<{Body:{tokens?:Record<string,string>}}>("/templates/theme",async(req,reply)=>{
   const tenantId=await readTemplateTenant(req,reply);if(!tenantId)return;
   const claims=req.user as {roles?:Role[]};
   if(!claims.roles?.includes("admin"))return reply.code(403).send({error:"Tenant administrator required"});
   const input=req.body?.tokens;
   if(!input||typeof input!=="object"||Array.isArray(input)||!Object.keys(input).length)return reply.code(400).send({error:"Theme tokens are required"});
   for(const [key,value] of Object.entries(input)){
    if(!(allowedThemeTokens as readonly string[]).includes(key)||typeof value!=="string"||!/^#[0-9a-fA-F]{6}$/.test(value))return reply.code(400).send({error:"Invalid theme token"});
   }
   const current=await templatePreferences.findOne({tenantId});
   const tokens={...defaultThemeTokens,...(current?.themeTokens??{}),...input};
   await templatePreferences.updateOne({tenantId},{$set:{themeTokens:tokens,updatedAt:new Date()}},{upsert:true});
   broadcastTemplateUpdate(tenantId,{type:"theme",tokens,customized:true});
   return {tenantId,tokens,customized:true};
  });
  ctx.server.post("/templates/public-stream-ticket",async(req)=>{
   const host=String(req.hostname??"").toLowerCase().replace(/:\\d+$/,"");
   const tenant=await tenants.findOne({domains:host});
   const tenantId=tenant?.id??defaultTenantId;
   const now=Date.now();
   for(const [key,value] of templateStreamTickets){if(value.expiresAt<now)templateStreamTickets.delete(key);}
   const ticket=randomBytes(24).toString("base64url");
   templateStreamTickets.set(ticket,{tenantId,expiresAt:now+30_000});
   return {ticket,expiresIn:30};
  });
  ctx.server.post("/templates/stream-ticket",async(req,reply)=>{
   const tenantId=await readTemplateTenant(req,reply);if(!tenantId)return;
   const now=Date.now();
   for(const [key,value] of templateStreamTickets){if(value.expiresAt<now)templateStreamTickets.delete(key);}
   const ticket=randomBytes(24).toString("base64url");
   templateStreamTickets.set(ticket,{tenantId,expiresAt:now+30_000});
   return {ticket,expiresIn:30};
  });
  ctx.server.get<{Querystring:{ticket?:string}}>("/templates/events",async(req,reply)=>{
   const ticket=String(req.query.ticket??"");
   const record=templateStreamTickets.get(ticket);
   templateStreamTickets.delete(ticket);
   if(!record||record.expiresAt<Date.now())return reply.code(401).send({error:"Invalid stream ticket"});
   const saved=await templatePreferences.findOne({tenantId:record.tenantId});
   const raw=reply.raw;
   reply.hijack();
   raw.writeHead(200,{"content-type":"text/event-stream","cache-control":"no-cache, no-transform","connection":"keep-alive","x-accel-buffering":"no"});
   raw.write("event: template-update\ndata: "+JSON.stringify({type:"snapshot",selection:{public:saved?.public??templateDefaults.public,dashboard:saved?.dashboard??templateDefaults.dashboard},tokens:{...defaultThemeTokens,...(saved?.themeTokens??{})},customized:Boolean(saved?.themeTokens)})+"\n\n");
   const clients=templateSubscribers.get(record.tenantId)??new Set<import("node:http").ServerResponse>();
   clients.add(raw);templateSubscribers.set(record.tenantId,clients);
   const heartbeat=setInterval(()=>{if(raw.destroyed){clearInterval(heartbeat);return;}raw.write(": keep-alive\n\n");},20_000);
   raw.on("close",()=>{clearInterval(heartbeat);clients.delete(raw);if(!clients.size)templateSubscribers.delete(record.tenantId);});
   return reply;
  });
  ctx.server.addHook("onClose",async()=>{await mongo.close();});
  ctx.logger.info("Auth plugin initialized",{clients:validClients,persistence:"mongodb",refreshRotation:true});
 }
};