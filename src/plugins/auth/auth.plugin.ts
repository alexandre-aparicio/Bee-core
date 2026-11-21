import type { BeePlugin } from "../../core/types.js";
import bcrypt from "bcryptjs";
import { MongoClient, type Collection, type Db } from "mongodb";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { resolveTenantContext } from "../../core/tenant-context.js";
import { tenantSlugFromHost } from "../../core/tenant-domain.js";
import { appendTenantAuditEvent, ensureTenantAuditIndexes, type TenantAuditEvent } from "../../core/audit-log.js";
import { maskTenantId, maskUserId, transformSessionResourceIds } from "../../core/session-id.js";

type ClientType = "backend" | "dashboard" | "public";
type Role = "admin" | "user" | "service";
type UserRecord = { id:string; email:string; passwordHash:string; roles:Role[]; platformRole?: "superadmin"; enabled:boolean; allowedClients:ClientType[]; tenantId?:string; createdAt:Date; updatedAt:Date };
type RefreshSession = { id:string; userId:string; tokenHash:string; client:ClientType; tenantId?:string; expiresAt:Date; revokedAt:Date|null; createdAt:Date };
type LoginBody = { email?:string; password?:string; client?:ClientType };
type RefreshBody = { refreshToken?:string };
const validClients:ClientType[]=["backend","dashboard","public"];
const publicUser=(u:UserRecord)=>({id:u.id,email:u.email,roles:u.roles,allowedClients:u.allowedClients,tenantId:u.tenantId??"default",...(u.platformRole?{platformRole:u.platformRole}:{})});
const clientFrom=(v:unknown):ClientType|null=>validClients.includes(v as ClientType)?v as ClientType:null;
const hashToken=(t:string)=>createHash("sha256").update(t).digest("hex");
const makeRefreshToken=()=>randomBytes(48).toString("base64url");
const refreshExpiry=()=>new Date(Date.now()+30*24*60*60*1000);

export const authPlugin:BeePlugin={
 manifest:{name:"auth",version:"0.3.0",description:"Persistent authentication for backend, dashboard and public frontend clients"},
 async initialize(ctx){
  const mongoUri=String(ctx.config.mongoUri??""),dbName=String(ctx.config.mongoDbName??"bee_core");
  if(!mongoUri)throw new Error("Auth: MONGODB_URI is required.");
  const mongo=new MongoClient(mongoUri,{maxPoolSize:10,serverSelectionTimeoutMS:10000});
  await mongo.connect(); const db:Db=mongo.db(dbName);
  const auditEvents:Collection<TenantAuditEvent>=db.collection("tenant_audit_events");
  await ensureTenantAuditIndexes(auditEvents);
  const auditAuthEvent=async(event:{tenantId:string;actorId:string;action:TenantAuditEvent["action"];outcome:TenantAuditEvent["outcome"];metadata?:TenantAuditEvent["metadata"]})=>{try{await appendTenantAuditEvent(auditEvents,{tenantId:event.tenantId,actorId:event.actorId,action:event.action,outcome:event.outcome,metadata:event.metadata,id:randomUUID(),occurredAt:new Date()});}catch(error){ctx.logger.error("Auth audit event write failed",{action:event.action,tenantId:event.tenantId,error});}};
  const users:Collection<UserRecord>=db.collection("users"),sessions:Collection<RefreshSession>=db.collection("refresh_sessions");
  const templatePreferences=db.collection<{tenantId?:string;userId?:string;public:string;dashboard:string;themeTokens?:Record<string,string>;installedTemplates?:string[];updatedAt:Date}>("template_preferences");
  const templateStreamTickets=new Map<string,{tenantId:string;expiresAt:number;claims?:import("../../core/tenant-context.js").TenantClaims}>();
  const templateSubscribers=new Map<string,Set<{response:import("node:http").ServerResponse;claims?:import("../../core/tenant-context.js").TenantClaims}>>();
  const broadcastTemplateUpdate=(tenantId:string,payload:unknown)=>{const clients=templateSubscribers.get(tenantId);if(!clients)return;const event=`event: template-update\ndata: ${JSON.stringify(payload)}\n\n`;for(const client of clients){if(client.response.destroyed){clients.delete(client);continue;}client.response.write(event);}if(!clients.size)templateSubscribers.delete(tenantId);};
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
  await users.updateMany({$or:[{tenantId:{$exists:false}},{tenantId:""}]},{$set:{tenantId:defaultTenantId,updatedAt:new Date()}});
  const preferencesCollectionExists=await db.listCollections({name:"template_preferences"},{nameOnly:true}).hasNext();
  if(!preferencesCollectionExists){
   try{await db.createCollection("template_preferences");}
   catch(error){if((error as {codeName?:string}).codeName!=="NamespaceExists")throw error;}
  }
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
   await users.updateOne({email:adminEmail},{$set:{platformRole:"superadmin"},$setOnInsert:{id:"bootstrap-admin",email:adminEmail,passwordHash:await bcrypt.hash(adminPassword,12),roles:["admin"],enabled:true,allowedClients:validClients,tenantId:defaultTenantId,createdAt:new Date(),updatedAt:new Date()}},{upsert:true});
   ctx.logger.info("Auth bootstrap administrator ensured (existing account credentials are not overwritten).");
  }
  const resourceIdSecret=String(ctx.config.jwtSecret??"");
  if(!process.env.JWT_SECRET)process.env.JWT_SECRET=resourceIdSecret;
  ctx.server.addHook("preValidation",async(request,reply)=>{
   if(!request.headers.authorization||request.url.split("?")[0]==="/billing/webhooks/entitlement")return;
   try{await request.jwtVerify();}catch{return reply.code(401).send({error:"Unauthorized"});}
   const claims=request.user as {sid?:string;aud?:string};
   if(claims.aud!=="bee-core"||!claims.sid)return reply.code(401).send({error:"Active session required"});
   const activeSession=await sessions.findOne({id:claims.sid,revokedAt:null,expiresAt:{$gt:new Date()}});
   if(!activeSession)return reply.code(401).send({error:"Session expired or revoked"});
   const sessionContext={sessionId:activeSession.id,expiresAt:activeSession.expiresAt};
   (request as any).__beeSessionIdContext=sessionContext;
   try{
    if(request.params&&typeof request.params==="object")(request as any).params=transformSessionResourceIds(request.params,"unmask",sessionContext,resourceIdSecret);
    if(request.query&&typeof request.query==="object")(request as any).query=transformSessionResourceIds(request.query,"unmask",sessionContext,resourceIdSecret);
    if(request.body&&typeof request.body==="object"&&!Buffer.isBuffer(request.body))(request as any).body=transformSessionResourceIds(request.body,"unmask",sessionContext,resourceIdSecret);
   }catch{return reply.code(400).send({error:"Invalid, expired, or session-mismatched resource reference"});}
  });
  ctx.server.addHook("preSerialization",async(request,_reply,payload)=>{
   const sessionContext=(request as any).__beeSessionIdContext as {sessionId:string;expiresAt:Date}|undefined;
   if(!sessionContext||!payload||typeof payload!=="object"||Buffer.isBuffer(payload))return payload;
   return transformSessionResourceIds(payload,"mask",sessionContext,resourceIdSecret);
  });
  const issue=(u:Pick<UserRecord,"id"|"email"|"roles"|"tenantId"|"platformRole">,client:ClientType,tenantId:string,sessionId:string,expiresAt:Date)=>{
   const sessionContext={sessionId,expiresAt};
   return ctx.server.jwt.sign({sub:maskUserId(u.id,sessionContext,resourceIdSecret),email:u.email,roles:u.roles,...(u.platformRole?{platformRole:u.platformRole}:{}),tenantId:maskTenantId(tenantId,sessionContext,resourceIdSecret),client,aud:"bee-core",sid:sessionId});
  };
  ctx.server.post<{Body:LoginBody}>("/auth/login",async(req,reply)=>{
   const email=String(req.body?.email??"").trim().toLowerCase(),password=String(req.body?.password??""),client=clientFrom(req.body?.client);
   if(!email||!password||!client)return reply.code(400).send({error:"email, password and valid client required"});
   const u=await users.findOne({email,enabled:true});
   if(!u||!await bcrypt.compare(password,u.passwordHash))return reply.code(401).send({error:"Invalid credentials"});
   if(!u.allowedClients.includes(client))return reply.code(403).send({error:"Client access denied"});
   if(!u.tenantId){u.tenantId=defaultTenantId;await users.updateOne({id:u.id},{$set:{tenantId:defaultTenantId,updatedAt:new Date()}});}
   const tenantId=u.tenantId??defaultTenantId;
   const membership=await db.collection("memberships").findOne({userId:u.id,tenantId,status:"active"});
   if(!membership)return reply.code(403).send({error:"No active company membership"});
   const membershipRole=String(membership.role??"member"),effectiveRoles:Role[]=membershipRole==="owner"||membershipRole==="admin"?["admin"]:["user"];
   const sessionId=randomUUID(),expiresAt=refreshExpiry(),refreshToken=makeRefreshToken();
   await sessions.insertOne({id:sessionId,userId:u.id,tokenHash:hashToken(refreshToken),client,tenantId,expiresAt,revokedAt:null,createdAt:new Date()});
   (req as any).__beeSessionIdContext={sessionId,expiresAt};
   const accessToken=issue({...u,roles:effectiveRoles},client,tenantId,sessionId,expiresAt);
   await ctx.events.emit("auth.login",{userId:u.id,client,at:new Date().toISOString()});
   await auditAuthEvent({tenantId,actorId:u.id,action:"auth.login",outcome:"success",metadata:{client}});
   return {accessToken,refreshToken,tokenType:"Bearer",expiresIn:1200,refreshExpiresIn:2592000,user:publicUser({...u,roles:effectiveRoles}),client,tenantId, ...(u.platformRole?{platformRole:u.platformRole}:{})};
  });
  ctx.server.post<{Body:RefreshBody}>("/auth/refresh",async(req,reply)=>{
   const raw=String(req.body?.refreshToken??"");if(raw.length<40)return reply.code(400).send({error:"refreshToken required"});
   const next=makeRefreshToken(),session=await sessions.findOneAndUpdate({tokenHash:hashToken(raw),revokedAt:null,expiresAt:{$gt:new Date()}},{$set:{tokenHash:hashToken(next)}},{returnDocument:"after"});
   if(!session)return reply.code(401).send({error:"Invalid or expired refresh token"});
   const u=await users.findOne({id:session.userId,enabled:true});
   if(!u||!u.allowedClients.includes(session.client)){await sessions.updateOne({id:session.id},{$set:{revokedAt:new Date()}});return reply.code(401).send({error:"Invalid or expired refresh token"});}
   const activeTenantId=session.tenantId??u.tenantId??defaultTenantId;
   const membership=await db.collection("memberships").findOne({userId:u.id,tenantId:activeTenantId,status:"active"});
   if(!membership){await sessions.updateOne({id:session.id},{$set:{revokedAt:new Date()}});return reply.code(401).send({error:"Company membership is no longer active"});}
   const role=String(membership.role??"member"),roles:Role[]=role==="owner"||role==="admin"?["admin"]:["user"];
   (req as any).__beeSessionIdContext={sessionId:session.id,expiresAt:session.expiresAt};
   return {accessToken:issue({...u,roles},session.client,activeTenantId,session.id,session.expiresAt),refreshToken:next,tokenType:"Bearer",expiresIn:1200,refreshExpiresIn:Math.max(0,Math.floor((session.expiresAt.getTime()-Date.now())/1000)),client:session.client,tenantId:activeTenantId,...(u.platformRole?{platformRole:u.platformRole}:{})};
  });
  ctx.server.get("/auth/me",async(req,reply)=>{try{await req.jwtVerify();const c=req.user as {sub?:string;email?:string;roles?:Role[];client?:ClientType;aud?:string;tenantId?:string;sid?:string};const tenantContext=await resolveTenantContext(db,c,{},resourceIdSecret);if(!tenantContext)return reply.code(401).send({error:"Unauthorized or active company session required"});return {authenticated:true,user:{id:tenantContext.userId,email:tenantContext.email,roles:c.roles},client:tenantContext.client,tenantId:tenantContext.tenantId,platformRole:(await users.findOne({id:tenantContext.userId}))?.platformRole??null};}catch{return reply.code(401).send({error:"Unauthorized"});}});
  ctx.server.post<{Body:RefreshBody}>("/auth/logout",async(req,reply)=>{try{await req.jwtVerify();const claims=req.user as {sid?:string;aud?:string};if(claims.aud!=="bee-core"||!claims.sid)return reply.code(401).send({error:"Unauthorized"});const session=await sessions.findOne({id:claims.sid,revokedAt:null});if(!session)return reply.code(401).send({error:"Session is no longer active"});await sessions.updateOne({id:session.id,revokedAt:null},{$set:{revokedAt:new Date()}});await auditAuthEvent({tenantId:session.tenantId??defaultTenantId,actorId:session.userId,action:"auth.logout",outcome:"success",metadata:{refreshTokenProvided:Boolean(req.body?.refreshToken)}});return {success:true,message:"Session revoked."};}catch{return reply.code(401).send({error:"Unauthorized"});}});

  const templateDefaults={public:"aurora",dashboard:"midnight"} as const;
  const allowedThemeTokens=["--bg","--panel","--muted","--border","--purple","--cyan"] as const;
  const defaultThemeTokens:Record<string,string>={"--bg":"#080a12","--panel":"#10131e","--muted":"#8991a4","--border":"#303447","--purple":"#8c72ff","--cyan":"#69e5d4"};
  const allowedTemplates={public:["aurora","editorial","studio"],dashboard:["midnight","paper","glass"]} as const;
  const baseTemplateIds=["aurora","editorial","midnight","paper"];
  const templateCatalog=[
   {id:"studio",name:"Studio",version:"1.0.0",target:"public",description:"Warm editorial landing page with a bright accent palette.",layout:"public.studio",tokens:{"--bg":"#f4f0e9","--panel":"#fffaf2","--muted":"#756e65","--border":"#ded5c8","--purple":"#b85d3b","--cyan":"#397d78"}},
   {id:"glass",name:"Glass",version:"1.0.0",target:"dashboard",description:"Soft glass workspace with cool blue and violet accents.",layout:"dashboard.glass",tokens:{"--bg":"#101827","--panel":"#1b2940","--muted":"#a2b1c7","--border":"#40516b","--purple":"#8b9dff","--cyan":"#69d9e8"}}
  ] as const;
  const getInstalledTemplates=(saved?:{installedTemplates?:string[]}|null)=>[...baseTemplateIds,...(saved?.installedTemplates??[]).filter(id=>templateCatalog.some(item=>item.id===id))];
  const readTemplateTenant=async(req:import("fastify").FastifyRequest,reply:import("fastify").FastifyReply)=>{
   try{
    await req.jwtVerify();
    const tenantContext=await resolveTenantContext(db,req.user as {sub?:string;email?:string;tenantId?:string;sid?:string;client?:"backend"|"dashboard"|"public";aud?:string},{},resourceIdSecret);
    if(!tenantContext){reply.code(401).send({error:"Unauthorized or active company session required"});return null;}
    if(tenantContext.client!=="dashboard"){reply.code(403).send({error:"Private template management requires a dashboard session"});return null;}
    return tenantContext;
   }catch{reply.code(401).send({error:"Unauthorized"});return null;}
  };
  ctx.server.get("/templates/public",async(req)=>{
   const host=String(req.hostname??"").trim().toLowerCase().replace(/:\d+$/,"").replace(/\.$/,"");
   const publicBaseDomain=String(ctx.config.publicBaseDomain??"beecore.beeprojects.net").trim().toLowerCase().replace(/^\.+|\.+$/g,"");
   const slug=tenantSlugFromHost(host,publicBaseDomain);
   const tenant=slug?await tenants.findOne({slug}):host!==publicBaseDomain?await tenants.findOne({domains:host}):null;
   const tenantId=tenant?.id??defaultTenantId;
   const saved=await templatePreferences.findOne({tenantId});
   return {tenantId,selection:{public:saved?.public??templateDefaults.public,dashboard:saved?.dashboard??templateDefaults.dashboard},tokens:{...defaultThemeTokens,...(saved?.themeTokens??{})},customized:Boolean(saved?.themeTokens),installedTemplates:getInstalledTemplates(saved)};
  });
  ctx.server.put<{Body:{domains?:string[]}}>("/tenants/domains",async(req,reply)=>{
   const tenantContext=await readTemplateTenant(req,reply);if(!tenantContext)return;
   const tenantId=tenantContext.tenantId;
   if(tenantContext.role!=="owner"&&tenantContext.role!=="admin")return reply.code(403).send({error:"Tenant administrator required"});
   const domains=req.body?.domains;
   if(!Array.isArray(domains)||domains.some(domain=>typeof domain!=="string"||!/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain.trim())))return reply.code(400).send({error:"Provide valid domain names"});
   const normalized=[...new Set(domains.map(domain=>domain.trim().toLowerCase()))];
   try{await tenants.updateOne({id:tenantId},{$set:{domains:normalized}},{upsert:true});}
   catch(error){return reply.code(409).send({error:"A domain is already assigned to another tenant"});}
   return {tenantId,domains:normalized};
  });
  ctx.server.get("/templates/catalog",async(req,reply)=>{
   const tenantContext=await readTemplateTenant(req,reply);if(!tenantContext)return;
   const tenantId=tenantContext.tenantId;
   const saved=await templatePreferences.findOne({tenantId});
   const installed=getInstalledTemplates(saved);
   return {catalog:templateCatalog.map(({tokens,...item})=>({...item,installed:installed.includes(item.id)}))};
  });
  ctx.server.get("/templates/installed",async(req,reply)=>{
   const tenantContext=await readTemplateTenant(req,reply);if(!tenantContext)return;
   const tenantId=tenantContext.tenantId;
   const saved=await templatePreferences.findOne({tenantId});
   return {tenantId,installedTemplates:getInstalledTemplates(saved)};
  });
  ctx.server.post<{Body:{templateId?:string}}>("/templates/install",async(req,reply)=>{
   const tenantContext=await readTemplateTenant(req,reply);if(!tenantContext)return;
   const tenantId=tenantContext.tenantId;
   if(tenantContext.role!=="owner"&&tenantContext.role!=="admin")return reply.code(403).send({error:"Tenant administrator required"});
   const templateId=String(req.body?.templateId??"");
   if(!templateCatalog.some(item=>item.id===templateId))return reply.code(404).send({error:"Template package not found"});
   await templatePreferences.updateOne({tenantId},{$addToSet:{installedTemplates:templateId},$set:{updatedAt:new Date()}},{upsert:true});
   const saved=await templatePreferences.findOne({tenantId});
   const installedTemplates=getInstalledTemplates(saved);
   broadcastTemplateUpdate(tenantId,{type:"installed",installedTemplates});
   return {tenantId,installedTemplates};
  });
  ctx.server.delete<{Params:{templateId:string}}>("/templates/install/:templateId",async(req,reply)=>{
   const tenantContext=await readTemplateTenant(req,reply);if(!tenantContext)return;
   const tenantId=tenantContext.tenantId;
   if(tenantContext.role!=="owner"&&tenantContext.role!=="admin")return reply.code(403).send({error:"Tenant administrator required"});
   const templateId=req.params.templateId;
   const packageInfo=templateCatalog.find(item=>item.id===templateId);
   if(!packageInfo)return reply.code(404).send({error:"Template package not found"});
   const saved=await templatePreferences.findOne({tenantId});
   const active=packageInfo.target==="public"?saved?.public??templateDefaults.public:saved?.dashboard??templateDefaults.dashboard;
   if(active===templateId)return reply.code(409).send({error:"Deactivate this template before uninstalling it"});
   await templatePreferences.updateOne({tenantId},{$pull:{installedTemplates:templateId},$set:{updatedAt:new Date()}});
   const updated=await templatePreferences.findOne({tenantId});
   const installedTemplates=getInstalledTemplates(updated);
   broadcastTemplateUpdate(tenantId,{type:"installed",installedTemplates});
   return {tenantId,installedTemplates};
  });
  ctx.server.get("/templates/preferences",async(req,reply)=>{
   const tenantContext=await readTemplateTenant(req,reply);if(!tenantContext)return;
   const tenantId=tenantContext.tenantId;
   const saved=await templatePreferences.findOne({tenantId});
   return {tenantId,selection:{public:saved?.public??templateDefaults.public,dashboard:saved?.dashboard??templateDefaults.dashboard},installedTemplates:getInstalledTemplates(saved)};
  });
  ctx.server.put<{Body:{public?:string;dashboard?:string}}>("/templates/preferences",async(req,reply)=>{
   const tenantContext=await readTemplateTenant(req,reply);if(!tenantContext)return;
   const tenantId=tenantContext.tenantId;
   if(tenantContext.role!=="owner"&&tenantContext.role!=="admin")return reply.code(403).send({error:"Tenant administrator required"});
   const body=req.body??{};
   const current=await templatePreferences.findOne({tenantId});
   const installed=new Set(getInstalledTemplates(current));
   if(body.public!==undefined&&(!(allowedTemplates.public as readonly string[]).includes(body.public)||!installed.has(body.public)))return reply.code(400).send({error:"Public template is not installed for this tenant"});
   if(body.dashboard!==undefined&&(!(allowedTemplates.dashboard as readonly string[]).includes(body.dashboard)||!installed.has(body.dashboard)))return reply.code(400).send({error:"Dashboard template is not installed for this tenant"});
   if(body.public===undefined&&body.dashboard===undefined)return reply.code(400).send({error:"At least one template selection is required"});
   const selection={public:body.public??current?.public??templateDefaults.public,dashboard:body.dashboard??current?.dashboard??templateDefaults.dashboard};
   await templatePreferences.updateOne({tenantId},{$set:{...selection,updatedAt:new Date()}},{upsert:true});
   broadcastTemplateUpdate(tenantId,{type:"preferences",selection});
   return {tenantId,selection};
  });
  ctx.server.get("/templates/theme",async(req,reply)=>{
   const tenantContext=await readTemplateTenant(req,reply);if(!tenantContext)return;
   const tenantId=tenantContext.tenantId;
   const saved=await templatePreferences.findOne({tenantId});
   return {tenantId,tokens:{...defaultThemeTokens,...(saved?.themeTokens??{})},customized:Boolean(saved?.themeTokens)};
  });
  ctx.server.put<{Body:{tokens?:Record<string,string>}}>("/templates/theme",async(req,reply)=>{
   const tenantContext=await readTemplateTenant(req,reply);if(!tenantContext)return;
   const tenantId=tenantContext.tenantId;
   if(tenantContext.role!=="owner"&&tenantContext.role!=="admin")return reply.code(403).send({error:"Tenant administrator required"});
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
   const host=String(req.hostname??"").toLowerCase().replace(/:\d+$/,"");
   const tenant=await tenants.findOne({domains:host});
   const tenantId=tenant?.id??defaultTenantId;
   const now=Date.now();
   for(const [key,value] of templateStreamTickets){if(value.expiresAt<now)templateStreamTickets.delete(key);}
   const ticket=randomBytes(24).toString("base64url");
   templateStreamTickets.set(ticket,{tenantId,expiresAt:now+30_000});
   return {ticket,expiresIn:30};
  });
  ctx.server.post("/templates/stream-ticket",async(req,reply)=>{
   const tenantContext=await readTemplateTenant(req,reply);if(!tenantContext)return;
   const tenantId=tenantContext.tenantId;
   const claims=req.user as import("../../core/tenant-context.js").TenantClaims;
   if(claims.client!=="dashboard")return reply.code(403).send({error:"Dashboard client required"});
   const now=Date.now();
   for(const [key,value] of templateStreamTickets){if(value.expiresAt<now)templateStreamTickets.delete(key);}
   const ticket=randomBytes(24).toString("base64url");
   templateStreamTickets.set(ticket,{tenantId,expiresAt:now+30_000,claims:req.user as import("../../core/tenant-context.js").TenantClaims});
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
   raw.write("event: template-update\ndata: "+JSON.stringify({type:"snapshot",selection:{public:saved?.public??templateDefaults.public,dashboard:saved?.dashboard??templateDefaults.dashboard},tokens:{...defaultThemeTokens,...(saved?.themeTokens??{})},customized:Boolean(saved?.themeTokens),installedTemplates:getInstalledTemplates(saved)})+"\n\n");
   const subscriber={response:raw,...(record.claims?{claims:record.claims}:{})};
   const clients=templateSubscribers.get(record.tenantId)??new Set<typeof subscriber>();
   clients.add(subscriber);templateSubscribers.set(record.tenantId,clients);
   const closeSubscriber=()=>{clients.delete(subscriber);if(!clients.size)templateSubscribers.delete(record.tenantId);};
   const heartbeat=setInterval(async()=>{
    if(raw.destroyed){clearInterval(heartbeat);closeSubscriber();return;}
    if(record.claims){
     try{const current=await resolveTenantContext(db,record.claims,{},resourceIdSecret);if(!current){clearInterval(heartbeat);raw.end();closeSubscriber();return;}}
     catch{clearInterval(heartbeat);raw.end();closeSubscriber();return;}
    }
    if(!raw.destroyed)raw.write(": keep-alive\n\n");
   },5_000);
   raw.on("close",()=>{clearInterval(heartbeat);closeSubscriber();});
   return reply;
  });
  ctx.server.addHook("onClose",async()=>{await mongo.close();});
  ctx.logger.info("Auth plugin initialized",{clients:validClients,persistence:"mongodb",refreshRotation:true,platformSuperadminBootstrap:Boolean(adminEmail&&adminPassword)});
 }
};