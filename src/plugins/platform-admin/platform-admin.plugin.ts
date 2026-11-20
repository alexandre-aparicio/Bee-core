import type { BeePlugin } from "../../core/types.js";
import bcrypt from "bcryptjs";
import { MongoClient, type Db } from "mongodb";
import { randomUUID } from "node:crypto";

type Company={id:string;name:string;createdAt:Date;status:"active"|"suspended"};
type User={id:string;email:string;passwordHash:string;roles:string[];platformRole?:string;enabled:boolean;allowedClients:string[];tenantId?:string;createdAt:Date;updatedAt:Date};
type Membership={id:string;userId:string;tenantId:string;role:"owner"|"admin"|"manager"|"member";status:"active";createdAt:Date;updatedAt:Date};
type Claims={sub?:string;sid?:string;client?:string;aud?:string;platformRole?:string};
export const platformAdminPlugin:BeePlugin={
 manifest:{name:"platform-admin",version:"0.1.0",description:"Platform-wide administration for the bootstrap superadministrator",dependencies:["auth","organizations"]},
 async initialize(ctx){
  const mongo=new MongoClient(String(ctx.config.mongoUri??""),{maxPoolSize:8,serverSelectionTimeoutMS:10000});
  await mongo.connect();const db:Db=mongo.db(String(ctx.config.mongoDbName??"bee_core"));
  const users=db.collection<User>("users"),sessions=db.collection("refresh_sessions"),companies=db.collection<Company>("tenants"),memberships=db.collection<Membership>("memberships");
  const guard=async(req:any,reply:any):Promise<User|null>=>{
   try{await req.jwtVerify();const claims=req.user as Claims;
    if(claims.aud!=="bee-core"||claims.client!=="dashboard"||!claims.sub||!claims.sid)return reply.code(401).send({error:"Platform admin session required"}),null;
    const session=await sessions.findOne({id:claims.sid,userId:claims.sub,client:"dashboard",revokedAt:null,expiresAt:{$gt:new Date()}});
    const user=await users.findOne({id:claims.sub,enabled:true,platformRole:"superadmin"});
    if(!session||!user)return reply.code(403).send({error:"Platform superadministrator required"}),null;
    return user;
   }catch{return reply.code(401).send({error:"Unauthorized"}),null;}
  };
  ctx.server.get("/platform/me",async(req,reply)=>{const user=await guard(req,reply);if(!user)return;return {platformAdmin:true,role:user.platformRole,email:user.email};});
  ctx.server.get("/platform/companies",async(req,reply)=>{const user=await guard(req,reply);if(!user)return;const list=await companies.find({}).sort({createdAt:-1}).toArray();return {companies:await Promise.all(list.map(async c=>({id:c.id,name:c.name,status:c.status??"active",createdAt:c.createdAt,membersCount:await memberships.countDocuments({tenantId:c.id,status:"active"})}))) };});
  ctx.server.post<{Body:{name?:string;ownerEmail?:string;ownerPassword?:string}}>("/platform/companies",async(req,reply)=>{
   const actor=await guard(req,reply);if(!actor)return;
   const name=String(req.body?.name??"").trim();const ownerEmail=String(req.body?.ownerEmail??"").trim().toLowerCase();
   if(name.length<2||name.length>120||!ownerEmail||!/^\S+@\S+\.\S+$/.test(ownerEmail))return reply.code(400).send({error:"Company name and valid owner email are required"});
   const now=new Date(),tenantId=randomUUID();
   const company:Company={id:tenantId,name,createdAt:now,status:"active"};
   let owner=await users.findOne({email:ownerEmail});
   if(!owner){const password=String(req.body?.ownerPassword??"");if(password.length<12)return reply.code(400).send({error:"For a new owner, ownerPassword must contain at least 12 characters"});
    owner={id:randomUUID(),email:ownerEmail,passwordHash:await bcrypt.hash(password,12),roles:["user"],enabled:true,allowedClients:["dashboard","public"],tenantId,createdAt:now,updatedAt:now};
    await users.insertOne(owner);
   }
   if(!owner.enabled)return reply.code(409).send({error:"Owner account is disabled"});
   await companies.insertOne(company);
   await memberships.updateOne({userId:owner.id,tenantId},{$setOnInsert:{id:randomUUID(),userId:owner.id,tenantId,role:"owner",status:"active",createdAt:now,updatedAt:now}},{upsert:true});
   return reply.code(201).send({company:{id:company.id,name:company.name,status:company.status,createdAt:company.createdAt},owner:{id:owner.id,email:owner.email}});
  });
  ctx.server.patch<{Params:{companyId:string};Body:{status?:"active"|"suspended"}}>("/platform/companies/:companyId",async(req,reply)=>{
   const actor=await guard(req,reply);if(!actor)return;const status=req.body?.status;
   if(status!=="active"&&status!=="suspended")return reply.code(400).send({error:"status must be active or suspended"});
   const result=await companies.updateOne({id:req.params.companyId},{$set:{status}});
   if(!result.matchedCount)return reply.code(404).send({error:"Company not found"});
   return {success:true,companyId:req.params.companyId,status};
  });
  ctx.server.addHook("onClose",async()=>mongo.close());
  ctx.logger.info("Platform admin plugin initialized",{platformRole:"superadmin"});
 }
};
