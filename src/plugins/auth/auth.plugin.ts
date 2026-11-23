import type { BeePlugin } from "../../core/types.js";
import bcrypt from "bcryptjs";
import { type Collection, type Db } from "mongodb";
import { createHash, createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { createTotpSecret, provisioningUri, verifyTotp } from "../../core/totp.js";
import { resolveTenantContext } from "../../core/tenant-context.js";
import { maskTenantId, maskUserId, unmaskUserId } from "../../core/session-id.js";
import { tenantSlugFromHost } from "../../core/tenant-domain.js";
import { appendTenantAuditEvent, ensureTenantAuditIndexes, type TenantAuditEvent } from "../../core/audit-log.js";
import { BoundedTicketStore, realtimeConnectionLimiterFor } from "../../core/realtime-limits.js";

type ClientType = "backend" | "dashboard" | "public";
type Role = "admin" | "user" | "service";
type UserRecord = { id:string; email:string; passwordHash:string; roles:Role[]; platformRole?: "superadmin"; enabled:boolean; allowedClients:ClientType[]; tenantId?:string; mfaSecretEnc?:string; mfaPendingSecretEnc?:string; mfaPendingExpiresAt?:Date; mfaLastStep?:number; mfaRecoveryHashes?:string[]; createdAt:Date; updatedAt:Date };
type InvitationRecord = { id:string; tenantId:string; email:string; role:"admin"|"manager"|"member"|"guest"|"custom"; customRoleId?:string; restrictionRoleIds?:string[]; tokenHash:string; expiresAt:Date; acceptedAt:Date|null; cancelledAt:Date|null };
type RefreshSession = { id:string; userId:string; tokenHash:string; usedTokenHashes?:string[]; client:ClientType; tenantId?:string; expiresAt:Date; absoluteExpiresAt?:Date; revokedAt:Date|null; mfaVerifiedAt?:Date; createdAt:Date };
type LoginBody = { email?:string; password?:string; client?:ClientType; mfaCode?:string };
type RefreshBody = { refreshToken?:string };
type JwtPayload = { sub:string; email:string; roles:Role[]; platformRole?:"superadmin"; tenantRef:string; client:ClientType; aud:"bee-core"; iss:"bee-core"; sid:string };
type JwtClaims = JwtPayload & { exp:number; iat:number };
const validClients:ClientType[]=["backend","dashboard","public"];
const publicUser=(u:UserRecord,sessionId:string,expiresAt:Date,secret:string)=>({id:maskUserId(u.id,{sessionId,expiresAt},secret),email:u.email,roles:u.roles,allowedClients:u.allowedClients,tenantId:maskTenantId(u.tenantId??"default",{sessionId,expiresAt},secret),...(u.platformRole?{platformRole:u.platformRole}:{})});
const clientFrom=(v:unknown):ClientType|null=>validClients.includes(v as ClientType)?v as ClientType:null;
const hashToken=(t:string)=>createHash("sha256").update(t).digest("hex");
const makeRefreshToken=()=>randomBytes(48).toString("base64url");
const refreshExpiry=()=>new Date(Date.now()+7*24*60*60*1000);
const absoluteSessionExpiry=()=>new Date(Date.now()+30*24*60*60*1000);
const readCookie=(req:any,name:string):string=>{const header=String(req.headers?.cookie??"");for(const part of header.split(";")){const [key,...rest]=part.trim().split("=");if(key===name)return decodeURIComponent(rest.join("="));}return "";};
const isSameOrigin=(req:any):boolean=>{const origin=String(req.headers?.origin??"");if(!origin)return true;try{return new URL(origin).host===String(req.headers?.host??"");}catch{return false;}};
const writeRefreshCookie=(reply:any,token:string,secure:boolean)=>reply.header("Set-Cookie",`bee_refresh=${encodeURIComponent(token)}; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=604800${secure?"; Secure":""}`);
const clearRefreshCookie=(reply:any,secure:boolean)=>reply.header("Set-Cookie",`bee_refresh=; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=0${secure?"; Secure":""}`);

const mfaKeyFrom=(value:unknown):Buffer|null=>{const raw=String(value??"").trim();if(!raw)return null;const key=Buffer.from(raw,"base64");return key.length===32?key:null;};
const encryptMfaSecret=(secret:string,key:Buffer):string=>{const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key,iv),encrypted=Buffer.concat([cipher.update(secret,"utf8"),cipher.final()]);return [iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),encrypted.toString("base64url")].join(".");};
const decryptMfaSecret=(value:string,key:Buffer):string=>{const [iv,tag,data]=value.split(".");if(!iv||!tag||!data)throw new Error("Invalid encrypted MFA secret");const decipher=createDecipheriv("aes-256-gcm",key,Buffer.from(iv,"base64url"));decipher.setAuthTag(Buffer.from(tag,"base64url"));return Buffer.concat([decipher.update(Buffer.from(data,"base64url")),decipher.final()]).toString("utf8");};


export const authPlugin:BeePlugin={
 manifest:{name:"auth",version:"0.3.0",description:"Persistent authentication for backend, dashboard and public frontend clients"},
 async initialize(ctx){
  const dbName=String(ctx.config.mongoDbName??"bee_core");
  const db:Db=ctx.mongoClient.db(dbName);
  const mfaEncryptionKey=mfaKeyFrom(ctx.config.authMfaEncryptionKey);
  const sessionIdSecret=String(ctx.config.sessionIdSecret ?? ctx.config.jwtSecret ?? "");
  if(sessionIdSecret.length<32)throw new Error("Auth: JWT_SECRET must contain at least 32 characters for session-bound resource references.");
  const auditEvents:Collection<TenantAuditEvent>=db.collection("tenant_audit_events");
  await ensureTenantAuditIndexes(auditEvents);
  const auditAuthEvent=async(event:{tenantId:string;actorId:string;action:TenantAuditEvent["action"];outcome:TenantAuditEvent["outcome"];metadata?:TenantAuditEvent["metadata"]})=>{try{await appendTenantAuditEvent(auditEvents,{tenantId:event.tenantId,actorId:event.actorId,action:event.action,outcome:event.outcome,metadata:event.metadata,id:randomUUID(),occurredAt:new Date()});}catch(error){ctx.logger.error("Auth audit event write failed",{action:event.action,tenantId:event.tenantId,error});}};
  const users:Collection<UserRecord>=db.collection("users"),sessions:Collection<RefreshSession>=db.collection("refresh_sessions");
  const templatePreferences=db.collection<{tenantId?:string;userId?:string;public:string;dashboard:string;themeTokens?:Record<string,string>;installedTemplates?:string[];updatedAt:Date}>("template_preferences");
  type TemplateStreamTicket={tenantId:string;ip:string;userId?:string;claims?:import("../../core/tenant-context.js").TenantClaims};
  type TemplateSubscriber={response:import("node:http").ServerResponse;ip:string;userId?:string;claims?:import("../../core/tenant-context.js").TenantClaims;release:()=>void};
  const templateStreamTickets=new BoundedTicketStore<TemplateStreamTicket>(5_000,30_000);
  const templateConnections=realtimeConnectionLimiterFor(ctx.server);
  const templateSubscribers=new Map<string,Set<TemplateSubscriber>>();
  const broadcastTemplateUpdate=(tenantId:string,payload:unknown)=>{const clients=templateSubscribers.get(tenantId);if(!clients)return;const event=`event: template-update\ndata: ${JSON.stringify(payload)}\n\n`;for(const client of clients){if(client.response.destroyed){clients.delete(client);client.release();continue;}client.response.write(event);}if(!clients.size)templateSubscribers.delete(tenantId);};
  const defaultTenantId=String(ctx.config.defaultTenantId??"default").trim()||"default";
  const tenants=db.collection<{id:string;name:string;slug?:string;kind?:"super"|"tenant";domains?:string[];createdAt:Date}>("tenants");
  await Promise.all([
   users.createIndex({email:1},{unique:true,name:"users_email_unique"}),
   users.createIndex({id:1},{unique:true,name:"users_id_unique"}),
   sessions.createIndex({tokenHash:1},{unique:true,name:"refresh_token_hash_unique"}),
   sessions.createIndex({userId:1},{name:"refresh_sessions_user"}),
   sessions.createIndex({usedTokenHashes:1},{name:"refresh_sessions_used_token_hash"}),
   sessions.createIndex({expiresAt:1},{expireAfterSeconds:0,name:"refresh_sessions_ttl"}),
   tenants.createIndex({id:1},{unique:true,name:"tenants_id_unique"}),
   tenants.createIndex({domains:1},{unique:true,sparse:true,name:"tenants_domains_unique"})
  ]);
  await sessions.updateMany({absoluteExpiresAt:{$exists:false}},{$set:{absoluteExpiresAt:absoluteSessionExpiry()}});
   await tenants.updateOne({id:defaultTenantId},{$setOnInsert:{id:defaultTenantId,name:defaultTenantId,kind:"tenant",createdAt:new Date()}},{upsert:true});
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

  // Public invitation preview and account creation. Tokens are submitted in request bodies.
  const invitations:Collection<InvitationRecord>=db.collection("company_invitations");
  ctx.server.post<{Body:{token?:string}}>("/auth/invitations/preview",async(req,reply)=>{
   const token=String(req.body?.token??"").trim();
   if(token.length<32)return reply.code(400).send({error:"A valid invitation link is required"});
   const tokenHash=hashToken(token),now=new Date();
   const invitation=await invitations.findOne({tokenHash,acceptedAt:null,cancelledAt:null,expiresAt:{$gt:now}});
   if(!invitation)return reply.code(404).send({error:"This invitation link is invalid, expired or already used"});
   const company=await tenants.findOne({id:invitation.tenantId});
   if(!company||((company as any).status==="suspended"))return reply.code(404).send({error:"The invited organization is unavailable"});
   const customRoles=db.collection<{id:string;tenantId:string;name:string;mode:string}>("company_roles");
   const primaryRole=invitation.customRoleId?await customRoles.findOne({id:invitation.customRoleId,tenantId:invitation.tenantId,mode:"grant"}):null;
   const restrictionIds=invitation.restrictionRoleIds??[];
   const restrictions=restrictionIds.length?await customRoles.find({id:{$in:restrictionIds},tenantId:invitation.tenantId,mode:"restriction"}).toArray():[];
   const roleLabel=invitation.role==="custom"?(primaryRole?.name??"Custom role"):invitation.role.replace(/^./,value=>value.toUpperCase());
   return {invitation:{email:invitation.email,companyName:company.name,role:roleLabel,restrictions:restrictions.map(item=>item.name),expiresAt:invitation.expiresAt}};
  });
  ctx.server.post<{Body:{token?:string;password?:string}}>("/auth/invitations/register",async(req,reply)=>{
   const token=String(req.body?.token??"").trim(),password=String(req.body?.password??"");
   if(token.length<32)return reply.code(400).send({error:"A valid invitation link is required"});
   if(password.length<12)return reply.code(400).send({error:"Your password must contain at least 12 characters"});
   const now=new Date(),tokenHash=hashToken(token);
   const invitation=await invitations.findOne({tokenHash,acceptedAt:null,cancelledAt:null,expiresAt:{$gt:now}});
   if(!invitation)return reply.code(404).send({error:"This invitation link is invalid, expired or already used"});
   const company=await tenants.findOne({id:invitation.tenantId});
   if(!company||((company as any).status==="suspended"))return reply.code(404).send({error:"The invited organization is unavailable"});
   const existingUser=await users.findOne({email:invitation.email});
   if(existingUser)return reply.code(409).send({error:"An account already exists for this email. Choose the sign-in option instead.",accountExists:true});
   if(invitation.role==="custom"&&!invitation.customRoleId)return reply.code(409).send({error:"The invitation has an invalid primary role"});
   const memberships=db.collection<any>("memberships"),userId=randomUUID();
   const user:UserRecord={id:userId,email:invitation.email,passwordHash:await bcrypt.hash(password,12),roles:["user"],enabled:true,allowedClients:["dashboard","backend","public"],tenantId:invitation.tenantId,createdAt:now,updatedAt:now};
   try{await users.insertOne(user);}
   catch(error){if((error as {code?:number})?.code===11000)return reply.code(409).send({error:"An account already exists for this email. Choose the sign-in option instead.",accountExists:true});throw error;}
   const consumed=await invitations.updateOne({id:invitation.id,tokenHash,acceptedAt:null,cancelledAt:null,expiresAt:{$gt:now}},{$set:{acceptedAt:now}});
   if(!consumed.modifiedCount){await users.deleteOne({id:userId});return reply.code(409).send({error:"This invitation has already been used or cancelled"});}
   try{
    await memberships.insertOne({id:randomUUID(),userId,tenantId:invitation.tenantId,role:invitation.role,...(invitation.customRoleId?{customRoleId:invitation.customRoleId}:{}),restrictionRoleIds:invitation.restrictionRoleIds??[],status:"active",createdAt:now,updatedAt:now});
   }catch(error){
    await invitations.updateOne({id:invitation.id,acceptedAt:now},{$set:{acceptedAt:null}});
    await users.deleteOne({id:userId});
    if((error as {code?:number})?.code===11000)return reply.code(409).send({error:"This account already has a membership in the invited organization. Sign in to accept the invitation."});
    throw error;
   }
   await auditAuthEvent({tenantId:invitation.tenantId,actorId:userId,action:"member.invited",outcome:"success",metadata:{role:invitation.role,restrictionRoleCount:(invitation.restrictionRoleIds??[]).length,phase:"registered_and_accepted"}});
   return reply.code(201).send({success:true,company:{name:company.name},membership:{role:invitation.role,status:"active"}});
  });

  const adminEmail=String(ctx.config.authAdminEmail??"").trim().toLowerCase(),adminPassword=String(ctx.config.authAdminPassword??"");
  if(adminEmail&&adminPassword){
   if(adminPassword.length<12)throw new Error("Auth: bootstrap admin password must be at least 12 characters.");
   await users.updateOne({email:adminEmail},{$setOnInsert:{id:"bootstrap-admin",email:adminEmail,passwordHash:await bcrypt.hash(adminPassword,12),roles:["admin"],enabled:true,allowedClients:validClients,tenantId:defaultTenantId,createdAt:new Date(),updatedAt:new Date()}},{upsert:true});
   ctx.logger.info("Auth bootstrap administrator ensured (existing account credentials are not overwritten).");
  }
  const issue=(u:Pick<UserRecord,"id"|"email"|"roles"|"tenantId"|"platformRole">,client:ClientType,tenantId:string,sessionId:string,expiresAt:Date):string=>{const payload:JwtPayload={sub:maskUserId(u.id,{sessionId,expiresAt},sessionIdSecret),email:u.email,roles:u.roles,...(u.platformRole?{platformRole:u.platformRole}:{}),tenantRef:maskTenantId(tenantId,{sessionId,expiresAt},sessionIdSecret),client,aud:"bee-core",iss:"bee-core",sid:sessionId};return ctx.server.jwt.sign(payload);};
  const dummyPasswordHash=await bcrypt.hash(randomBytes(32).toString("hex"),12);
  ctx.server.post<{Body:LoginBody}>("/auth/login",async(req,reply)=>{
   const email=String(req.body?.email??"").trim().toLowerCase(),password=String(req.body?.password??""),client=clientFrom(req.body?.client);
   if(!email||!password||!client)return reply.code(400).send({error:"email, password and valid client required"});
   const u=await users.findOne({email,enabled:true});
   // Always perform a bcrypt comparison to reduce account-enumeration timing differences.
   const passwordMatches=await bcrypt.compare(password,u?.passwordHash??dummyPasswordHash);
   if(!u||!passwordMatches)return reply.code(401).send({error:"Invalid credentials"});
   if(!u.allowedClients.includes(client))return reply.code(403).send({error:"Client access denied"});
   if(!u.tenantId){u.tenantId=defaultTenantId;await users.updateOne({id:u.id},{$set:{tenantId:defaultTenantId,updatedAt:new Date()}});}
   const tenantId=u.tenantId??defaultTenantId;
   const membership=await db.collection("memberships").findOne({userId:u.id,tenantId,status:"active"});
   if(!membership)return reply.code(403).send({error:"No active company membership"});
   const tenant=await tenants.findOne({id:tenantId});
   const isSuperAdmin=membership.role==="super_admin"&&tenant?.kind==="super";
   if(membership.role==="super_admin"&&!isSuperAdmin)return reply.code(403).send({error:"Super Admin membership is only valid in the Super Organization"});
   let mfaVerifiedAt:Date|undefined;
   if(isSuperAdmin&&u.mfaSecretEnc){
    const code=String(req.body?.mfaCode??"");
    if(!mfaEncryptionKey)return reply.code(503).send({error:"Superadministrator MFA encryption is not configured"});
    let secret:string;try{secret=decryptMfaSecret(u.mfaSecretEnc,mfaEncryptionKey);}catch(error){ctx.logger.error("Could not decrypt superadministrator MFA secret",{userId:u.id,error});return reply.code(503).send({error:"MFA configuration unavailable"});}
    const step=verifyTotp(secret,code);
    if(step!==null){
     const consumed=await users.updateOne({id:u.id,mfaSecretEnc:u.mfaSecretEnc,$or:[{mfaLastStep:{$lt:step}},{mfaLastStep:{$exists:false}}]},{$set:{mfaLastStep:step}});
     if(!consumed.modifiedCount)return reply.code(401).send({error:"Authenticator code has already been used",mfaRequired:true});
    }else{
     const recoveryHash=hashToken(code.trim().toUpperCase());
     const consumed=await users.updateOne({id:u.id,mfaRecoveryHashes:recoveryHash},{$pull:{mfaRecoveryHashes:recoveryHash}});
     if(!consumed.modifiedCount)return reply.code(401).send({error:"A valid authenticator or unused recovery code is required",mfaRequired:true});
     ctx.logger.info("Superadministrator used a one-time MFA recovery code",{userId:u.id});
    }
    mfaVerifiedAt=new Date();
   }
   const membershipRole=String(membership.role??"member"),effectiveRoles:Role[]=isSuperAdmin||membershipRole==="owner"||membershipRole==="admin"?["admin"]:["user"];
   const sessionId=randomUUID(),expiresAt=refreshExpiry(),absoluteExpiresAt=absoluteSessionExpiry(),accessToken=issue({...u,roles:effectiveRoles,...(isSuperAdmin?{platformRole:"superadmin" as const}:{})},client,tenantId,sessionId,expiresAt),refreshToken=makeRefreshToken();
   await sessions.insertOne({id:sessionId,userId:u.id,tokenHash:hashToken(refreshToken),client,tenantId,expiresAt,absoluteExpiresAt,revokedAt:null,...(mfaVerifiedAt?{mfaVerifiedAt}:{}),createdAt:new Date()});
   await ctx.events.emit("auth.login",{userId:u.id,client,at:new Date().toISOString()});
   await auditAuthEvent({tenantId,actorId:u.id,action:"auth.login",outcome:"success",metadata:{client}});
   const secureCookie=String(ctx.config.environment??"")!=="development";
   if(client==="dashboard")writeRefreshCookie(reply,refreshToken,secureCookie);
   return {accessToken,...(client==="dashboard"?{}:{refreshToken}),tokenType:"Bearer",expiresIn:1200,refreshExpiresIn:604800,user:publicUser({...u,roles:effectiveRoles,...(isSuperAdmin?{platformRole:"superadmin" as const}:{})},sessionId,expiresAt,sessionIdSecret),client,tenantId:maskTenantId(tenantId,{sessionId,expiresAt},sessionIdSecret), ...(isSuperAdmin?{platformRole:"superadmin"}:{}),...(isSuperAdmin&&!u.mfaSecretEnc?{mfaSetupRequired:true}:{})};
  });
  const resolveMfaAdmin=async(req:any,reply:any):Promise<{user:UserRecord;session:RefreshSession}|null>=>{
   try{await req.jwtVerify();}catch{return reply.code(401).send({error:"Unauthorized"}),null;}
   const claims=req.user as Partial<JwtClaims>;
   if(claims.aud!=="bee-core"||claims.client!=="dashboard"||!claims.sub||!claims.sid)return reply.code(401).send({error:"Dashboard superadministrator session required"}),null;
   const session=await sessions.findOne({id:claims.sid,client:"dashboard",revokedAt:null,expiresAt:{$gt:new Date()}});
   if(!session)return reply.code(401).send({error:"Session expired"}),null;
   let userId="";try{userId=unmaskUserId(claims.sub,{sessionId:session.id,expiresAt:session.expiresAt},sessionIdSecret);}catch{return reply.code(401).send({error:"Invalid session"}),null;}
   const user=await users.findOne({id:userId,enabled:true});
   const membership=await db.collection("memberships").findOne({userId,tenantId:session.tenantId,status:"active",role:"super_admin"});
   const superOrganization=await tenants.findOne({id:session.tenantId,kind:"super"});
   if(!user||user.id!==session.userId||!membership||!superOrganization)return reply.code(403).send({error:"Super Organization super_admin membership required"}),null;
   return {user,session};
  };
  ctx.server.post("/auth/mfa/setup",async(req,reply)=>{
   const current=await resolveMfaAdmin(req,reply);if(!current)return;
   if(current.user.mfaSecretEnc)return reply.code(409).send({error:"MFA is already configured"});
   if(!mfaEncryptionKey)return reply.code(503).send({error:"Set AUTH_MFA_ENCRYPTION_KEY to a base64-encoded 32-byte key before configuring MFA"});
   const secret=createTotpSecret(),encrypted=encryptMfaSecret(secret,mfaEncryptionKey);
   await users.updateOne({id:current.user.id},{$set:{mfaPendingSecretEnc:encrypted,mfaPendingExpiresAt:new Date(Date.now()+10*60*1000)}});
   return {secret,provisioningUri:provisioningUri(secret,current.user.email),expiresIn:600};
  });
  ctx.server.post<{Body:{code?:string}}>("/auth/mfa/confirm",async(req,reply)=>{
   const current=await resolveMfaAdmin(req,reply);if(!current)return;
   if(!mfaEncryptionKey)return reply.code(503).send({error:"MFA encryption is not configured"});
   if(!current.user.mfaPendingSecretEnc||!current.user.mfaPendingExpiresAt||current.user.mfaPendingExpiresAt<=new Date())return reply.code(409).send({error:"Start MFA setup again"});
   let secret:string;try{secret=decryptMfaSecret(current.user.mfaPendingSecretEnc,mfaEncryptionKey);}catch{return reply.code(503).send({error:"MFA configuration unavailable"});}
   const step=verifyTotp(secret,String(req.body?.code??""));
   if(step===null)return reply.code(401).send({error:"Invalid authenticator code"});
   const recoveryCodes=Array.from({length:10},()=>randomBytes(9).toString("base64url").toUpperCase());
   const saved=await users.updateOne({id:current.user.id,mfaPendingSecretEnc:current.user.mfaPendingSecretEnc,mfaPendingExpiresAt:{$gt:new Date()}},{$set:{mfaSecretEnc:current.user.mfaPendingSecretEnc,mfaLastStep:step,mfaRecoveryHashes:recoveryCodes.map(code=>hashToken(code))},$unset:{mfaPendingSecretEnc:"",mfaPendingExpiresAt:""}});
   if(!saved.modifiedCount)return reply.code(409).send({error:"MFA setup expired; start again"});
   const verifiedAt=new Date();
   await sessions.updateOne({id:current.session.id,userId:current.user.id,revokedAt:null},{$set:{mfaVerifiedAt:verifiedAt}});
   const tenantId=current.session.tenantId??current.user.tenantId??defaultTenantId;
   const membership=await db.collection("memberships").findOne({userId:current.user.id,tenantId,status:"active"});
   const role=String(membership?.role??"member"),roles:Role[]=role==="super_admin"||role==="owner"||role==="admin"?["admin"]:["user"];
   await auditAuthEvent({tenantId,actorId:current.user.id,action:"auth.mfa.enrolled",outcome:"success",metadata:{client:"dashboard"}});
   return {success:true,accessToken:issue({...current.user,roles,platformRole:"superadmin"}, "dashboard",tenantId,current.session.id,current.session.expiresAt),expiresIn:1200,platformRole:"superadmin",recoveryCodes};
  });
  ctx.server.post<{Body:RefreshBody}>("/auth/refresh",async(req,reply)=>{
   if(!isSameOrigin(req))return reply.code(403).send({error:"Cross-origin refresh request rejected"});
   const raw=String(req.body?.refreshToken??(readCookie(req,"bee_refresh")||""));if(raw.length<40)return reply.code(401).send({error:"Refresh session required"});
   const now=new Date(),rawHash=hashToken(raw),next=makeRefreshToken(),secureCookie=String(ctx.config.environment??"")!=="development";
   const session=await sessions.findOneAndUpdate({tokenHash:rawHash,revokedAt:null,expiresAt:{$gt:now},absoluteExpiresAt:{$gt:now}},{$set:{tokenHash:hashToken(next),expiresAt:refreshExpiry()},$push:{usedTokenHashes:{$each:[rawHash],$slice:-4096}}},{returnDocument:"after"});
   if(!session){
    const reused=await sessions.findOne({usedTokenHashes:rawHash});
    if(reused){
     const revokedAt=new Date();
     const revoked=await sessions.updateOne({id:reused.id,revokedAt:null},{$set:{revokedAt}});
     if(revoked.modifiedCount&&reused.tenantId)await auditAuthEvent({tenantId:reused.tenantId,actorId:reused.userId,action:"auth.refresh.reuse",outcome:"denied",metadata:{client:reused.client,reason:"rotated_token_reuse"}});
     if(reused.client==="dashboard")clearRefreshCookie(reply,secureCookie);
     return reply.code(401).send({error:"Refresh token reuse detected; session revoked"});
    }
    return reply.code(401).send({error:"Invalid or expired refresh token"});
   }
   const u=await users.findOne({id:session.userId,enabled:true});
   if(!u||!u.allowedClients.includes(session.client)){await sessions.updateOne({id:session.id},{$set:{revokedAt:new Date()}});return reply.code(401).send({error:"Invalid or expired refresh token"});}
   const activeTenantId=session.tenantId??u.tenantId??defaultTenantId;
   const membership=await db.collection("memberships").findOne({userId:u.id,tenantId:activeTenantId,status:"active"});
   if(!membership){await sessions.updateOne({id:session.id},{$set:{revokedAt:new Date()}});return reply.code(401).send({error:"Company membership is no longer active"});}
   const role=String(membership.role??"member"),isSuperAdmin=role==="super_admin"&&(await tenants.findOne({id:activeTenantId,kind:"super"}))!==null,roles:Role[]=isSuperAdmin||role==="owner"||role==="admin"?["admin"]:["user"];
   const sessionUser={...u,roles,...(isSuperAdmin?{platformRole:"superadmin" as const}:{})};
   const accessToken=issue(sessionUser,session.client,activeTenantId,session.id,session.expiresAt);
   if(session.client==="dashboard"){writeRefreshCookie(reply,next,secureCookie);return {accessToken,tokenType:"Bearer",expiresIn:1200,refreshExpiresIn:604800,client:session.client,tenantId:maskTenantId(activeTenantId,{sessionId:session.id,expiresAt:session.expiresAt},sessionIdSecret),user:publicUser(sessionUser,session.id,session.expiresAt,sessionIdSecret),...(isSuperAdmin?{platformRole:"superadmin"}:{})};}
   return {accessToken,refreshToken:next,tokenType:"Bearer",expiresIn:1200,refreshExpiresIn:604800,client:session.client,tenantId:maskTenantId(activeTenantId,{sessionId:session.id,expiresAt:session.expiresAt},sessionIdSecret),user:publicUser(sessionUser,session.id,session.expiresAt,sessionIdSecret),...(isSuperAdmin?{platformRole:"superadmin"}:{})};
  });
  ctx.server.get("/auth/me",async(req,reply)=>{try{await req.jwtVerify();const c=req.user as Partial<JwtClaims>;const tenantContext=await resolveTenantContext(db,c,{},sessionIdSecret);if(!tenantContext)return reply.code(401).send({error:"Unauthorized or active company session required"});const sessionContext={sessionId:tenantContext.sessionId,expiresAt:tenantContext.sessionExpiresAt};return {authenticated:true,user:{id:maskUserId(tenantContext.userId,sessionContext,sessionIdSecret),email:tenantContext.email,roles:c.roles},client:tenantContext.client,tenantId:maskTenantId(tenantContext.tenantId,sessionContext,sessionIdSecret),platformRole:tenantContext.role==="super_admin"?"superadmin":null};}catch{return reply.code(401).send({error:"Unauthorized"});}});
  ctx.server.post<{Body:RefreshBody}>("/auth/logout",async(req,reply)=>{const secureCookie=String(ctx.config.environment??"")!=="development";if(!isSameOrigin(req))return reply.code(403).send({error:"Cross-origin logout request rejected"});const cookieToken=readCookie(req,"bee_refresh");clearRefreshCookie(reply,secureCookie);try{await req.jwtVerify();const claims=req.user as Partial<JwtClaims>;if(claims.aud!=="bee-core"||!claims.sub||!claims.sid)return reply.code(401).send({error:"Unauthorized"});const session=await sessions.findOne({id:claims.sid});if(!session)return {success:true,message:"Session is already unavailable."};let userId:string;try{userId=unmaskUserId(claims.sub,{sessionId:session.id,expiresAt:session.expiresAt},sessionIdSecret)===session.userId?session.userId:"";}catch{return reply.code(401).send({error:"Unauthorized"});}if(!userId)return reply.code(401).send({error:"Unauthorized"});const raw=String(req.body?.refreshToken??"");if(raw)await sessions.updateOne({id:session.id,tokenHash:hashToken(raw),userId,revokedAt:null},{$set:{revokedAt:new Date()}});await sessions.updateOne({id:session.id,userId,revokedAt:null},{$set:{revokedAt:new Date()}});if(session.tenantId)await auditAuthEvent({tenantId:session.tenantId,actorId:userId,action:"auth.logout",outcome:"success",metadata:{refreshTokenProvided:Boolean(raw||cookieToken)}});return {success:true,message:"Refresh session revoked."};}catch{if(cookieToken.length>=40){await sessions.updateOne({tokenHash:hashToken(cookieToken),revokedAt:null},{$set:{revokedAt:new Date()}});return {success:true,message:"Refresh session revoked."};}return reply.code(401).send({error:"Unauthorized"});}});

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
    const tenantContext=await resolveTenantContext(db,req.user as Partial<JwtClaims>,{},sessionIdSecret);
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
   return {tenantId:tenant?.slug??"default",selection:{public:saved?.public??templateDefaults.public,dashboard:saved?.dashboard??templateDefaults.dashboard},tokens:{...defaultThemeTokens,...(saved?.themeTokens??{})},customized:Boolean(saved?.themeTokens),installedTemplates:getInstalledTemplates(saved)};
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
   return {tenantId:maskTenantId(tenantId,{sessionId:tenantContext.sessionId,expiresAt:tenantContext.sessionExpiresAt},sessionIdSecret),domains:normalized};
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
   return {tenantId:maskTenantId(tenantId,{sessionId:tenantContext.sessionId,expiresAt:tenantContext.sessionExpiresAt},sessionIdSecret),installedTemplates:getInstalledTemplates(saved)};
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
   return {tenantId:maskTenantId(tenantId,{sessionId:tenantContext.sessionId,expiresAt:tenantContext.sessionExpiresAt},sessionIdSecret),installedTemplates};
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
   return {tenantId:maskTenantId(tenantId,{sessionId:tenantContext.sessionId,expiresAt:tenantContext.sessionExpiresAt},sessionIdSecret),installedTemplates};
  });
  ctx.server.get("/templates/preferences",async(req,reply)=>{
   const tenantContext=await readTemplateTenant(req,reply);if(!tenantContext)return;
   const tenantId=tenantContext.tenantId;
   const saved=await templatePreferences.findOne({tenantId});
   return {tenantId:maskTenantId(tenantId,{sessionId:tenantContext.sessionId,expiresAt:tenantContext.sessionExpiresAt},sessionIdSecret),selection:{public:saved?.public??templateDefaults.public,dashboard:saved?.dashboard??templateDefaults.dashboard},installedTemplates:getInstalledTemplates(saved)};
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
   return {tenantId:maskTenantId(tenantId,{sessionId:tenantContext.sessionId,expiresAt:tenantContext.sessionExpiresAt},sessionIdSecret),selection};
  });
  ctx.server.get("/templates/theme",async(req,reply)=>{
   const tenantContext=await readTemplateTenant(req,reply);if(!tenantContext)return;
   const tenantId=tenantContext.tenantId;
   const saved=await templatePreferences.findOne({tenantId});
   return {tenantId:maskTenantId(tenantId,{sessionId:tenantContext.sessionId,expiresAt:tenantContext.sessionExpiresAt},sessionIdSecret),tokens:{...defaultThemeTokens,...(saved?.themeTokens??{})},customized:Boolean(saved?.themeTokens)};
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
   return {tenantId:maskTenantId(tenantId,{sessionId:tenantContext.sessionId,expiresAt:tenantContext.sessionExpiresAt},sessionIdSecret),tokens,customized:true};
  });
  ctx.server.post("/templates/public-stream-ticket",async(req,reply)=>{
   const host=String(req.hostname??"").toLowerCase().replace(/:\\d+$/,"");
   const tenant=await tenants.findOne({domains:host});
   const tenantId=tenant?.id??defaultTenantId;
   const issued=templateStreamTickets.issue({tenantId,ip:req.ip});
   if(!issued)return reply.code(429).send({error:"Too many pending stream tickets"});
   return issued;
  });
  ctx.server.post("/templates/stream-ticket",async(req,reply)=>{
   const tenantContext=await readTemplateTenant(req,reply);if(!tenantContext)return;
   const tenantId=tenantContext.tenantId;
   const claims=req.user as import("../../core/tenant-context.js").TenantClaims;
   if(claims.client!=="dashboard")return reply.code(403).send({error:"Dashboard client required"});
   const issued=templateStreamTickets.issue({tenantId,ip:req.ip,userId:tenantContext.userId,claims:req.user as import("../../core/tenant-context.js").TenantClaims});
   if(!issued)return reply.code(429).send({error:"Too many pending stream tickets"});
   return issued;
  });
  ctx.server.get<{Querystring:{ticket?:string}}>("/templates/events",async(req,reply)=>{
   const ticket=String(req.query.ticket??"");
   const record=templateStreamTickets.consume(ticket);
   if(!record||record.ip!==req.ip)return reply.code(401).send({error:"Invalid stream ticket"});
   const saved=await templatePreferences.findOne({tenantId:record.tenantId});
   const release=templateConnections.tryAcquire(record.ip,record.userId);
   if(!release)return reply.code(429).send({error:"Realtime connection limit reached"});
   const raw=reply.raw;
   reply.hijack();
   raw.writeHead(200,{"content-type":"text/event-stream","cache-control":"no-cache, no-transform","connection":"keep-alive","x-accel-buffering":"no"});
   raw.write("event: template-update\ndata: "+JSON.stringify({type:"snapshot",selection:{public:saved?.public??templateDefaults.public,dashboard:saved?.dashboard??templateDefaults.dashboard},tokens:{...defaultThemeTokens,...(saved?.themeTokens??{})},customized:Boolean(saved?.themeTokens),installedTemplates:getInstalledTemplates(saved)})+"\n\n");
   const subscriber:TemplateSubscriber={response:raw,ip:record.ip,...(record.userId?{userId:record.userId}:{}),...(record.claims?{claims:record.claims}:{}),release};
   const clients=templateSubscribers.get(record.tenantId)??new Set<TemplateSubscriber>();
   clients.add(subscriber);templateSubscribers.set(record.tenantId,clients);
   const closeSubscriber=()=>{clients.delete(subscriber);if(!clients.size)templateSubscribers.delete(record.tenantId);release();};
   const heartbeat=setInterval(async()=>{
    if(raw.destroyed){clearInterval(heartbeat);closeSubscriber();return;}
    if(record.claims){
     try{const current=await resolveTenantContext(db,record.claims,{},sessionIdSecret);if(!current){clearInterval(heartbeat);raw.end();closeSubscriber();return;}}
     catch{clearInterval(heartbeat);raw.end();closeSubscriber();return;}
    }
    if(!raw.destroyed)raw.write(": keep-alive\n\n");
   },5_000);
   raw.on("close",()=>{clearInterval(heartbeat);closeSubscriber();});
   return reply;
  });
  ctx.server.addHook("onClose",async()=>{for(const subscribers of templateSubscribers.values())for(const subscriber of subscribers){subscriber.release();if(!subscriber.response.destroyed)subscriber.response.end();}templateSubscribers.clear();templateStreamTickets.clear();});
  ctx.logger.info("Auth plugin initialized",{clients:validClients,persistence:"mongodb",refreshRotation:true,platformSuperadminBootstrap:Boolean(adminEmail&&adminPassword)});
 }
};