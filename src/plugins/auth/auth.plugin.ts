import type { BeePlugin } from "../../core/types.js";
import jwt from "@fastify/jwt";
import bcrypt from "bcryptjs";
import { MongoClient, type Collection, type Db } from "mongodb";
import { createHash, randomBytes, randomUUID } from "node:crypto";

type ClientType = "backend" | "dashboard" | "public";
type Role = "admin" | "user" | "service";
type UserRecord = { id:string; email:string; passwordHash:string; roles:Role[]; enabled:boolean; allowedClients:ClientType[]; createdAt:Date; updatedAt:Date };
type RefreshSession = { id:string; userId:string; tokenHash:string; client:ClientType; expiresAt:Date; revokedAt:Date|null; createdAt:Date };
type LoginBody = { email?:string; password?:string; client?:ClientType };
type RefreshBody = { refreshToken?:string };
const validClients:ClientType[]=["backend","dashboard","public"];
const publicUser=(u:UserRecord)=>({id:u.id,email:u.email,roles:u.roles,allowedClients:u.allowedClients});
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
  await Promise.all([
   users.createIndex({email:1},{unique:true,name:"users_email_unique"}),\n   users.createIndex({id:1},{unique:true,name:"users_id_unique"}),
   sessions.createIndex({tokenHash:1},{unique:true,name:"refresh_token_hash_unique"}),
   sessions.createIndex({userId:1},{name:"refresh_sessions_user"}),
   sessions.createIndex({expiresAt:1},{expireAfterSeconds:0,name:"refresh_sessions_ttl"})
  ]);
  const adminEmail=String(ctx.config.authAdminEmail??"").trim().toLowerCase(),adminPassword=String(ctx.config.authAdminPassword??"");
  if(adminEmail&&adminPassword){
   if(adminPassword.length<12)throw new Error("Auth: bootstrap admin password must be at least 12 characters.");
   await users.updateOne({email:adminEmail},{$setOnInsert:{id:"bootstrap-admin",email:adminEmail,passwordHash:await bcrypt.hash(adminPassword,12),roles:["admin"],enabled:true,allowedClients:validClients,createdAt:new Date(),updatedAt:new Date()}},{upsert:true});
   ctx.logger.info("Auth bootstrap administrator ensured (existing account credentials are not overwritten).");
  }
  const issue=(u:Pick<UserRecord,"id"|"email"|"roles">,client:ClientType)=>ctx.server.jwt.sign({sub:u.id,email:u.email,roles:u.roles,client,aud:"bee-core"});
  ctx.server.post<{Body:LoginBody}>("/auth/login",async(req,reply)=>{
   const email=String(req.body?.email??"").trim().toLowerCase(),password=String(req.body?.password??""),client=clientFrom(req.body?.client);
   if(!email||!password||!client)return reply.code(400).send({error:"email, password and valid client required"});
   const u=await users.findOne({email,enabled:true});
   if(!u||!await bcrypt.compare(password,u.passwordHash))return reply.code(401).send({error:"Invalid credentials"});
   if(!u.allowedClients.includes(client))return reply.code(403).send({error:"Client access denied"});
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
  ctx.server.addHook("onClose",async()=>{await mongo.close();});
  ctx.logger.info("Auth plugin initialized",{clients:validClients,persistence:"mongodb",refreshRotation:true});
 }
};