import type { BeePlugin } from "../../core/types.js";
import { MongoClient, type Collection, type Db } from "mongodb";
import { randomUUID } from "node:crypto";

type Company = { id:string; name:string; domains?:string[]; createdAt:Date; status?:"active"|"suspended" };
type Membership = { id:string; userId:string; tenantId:string; role:"owner"|"admin"|"manager"|"member"; status:"active"|"invited"|"suspended"; createdAt:Date; updatedAt:Date };
type Claims = { sub?:string; email?:string; roles?:string[]; client?:"backend"|"dashboard"|"public"; tenantId?:string; sid?:string; aud?:string };
type CreateCompanyBody = { name?:string };

export const organizationsPlugin:BeePlugin={
 manifest:{name:"organizations",version:"0.1.0",description:"Company records, user memberships and active-company session context",dependencies:["auth"]},
 async initialize(ctx){
  const mongoUri=String(ctx.config.mongoUri??""),dbName=String(ctx.config.mongoDbName??"bee_core");
  const mongo=new MongoClient(mongoUri,{maxPoolSize:10,serverSelectionTimeoutMS:10000});
  await mongo.connect();
  const db:Db=mongo.db(dbName);
  const users=db.collection<{id:string;email:string;enabled:boolean;tenantId?:string;roles?:string[]}>("users");
  const companies:Collection<Company>=db.collection("tenants");
  const memberships:Collection<Membership>=db.collection("memberships");
  await Promise.all([
   memberships.createIndex({id:1},{unique:true,name:"memberships_id_unique"}),
   memberships.createIndex({userId:1,tenantId:1},{unique:true,name:"memberships_user_company_unique"}),
   memberships.createIndex({tenantId:1,status:1},{name:"memberships_company_status"}),
   memberships.createIndex({userId:1,status:1},{name:"memberships_user_status"})
  ]);
  // Backfill the current single-tenant model into explicit memberships.
  for await(const user of users.find({tenantId:{$exists:true,$ne:""}})){
   const tenantId=String(user.tenantId);
   const company=await companies.findOne({id:tenantId});
   if(!company)continue;
   const legacyRoles=user.roles??[];
   const role:Membership["role"]=legacyRoles.includes("admin")?"owner":legacyRoles.includes("service")?"manager":"member";
   await memberships.updateOne({userId:user.id,tenantId},{$setOnInsert:{id:randomUUID(),userId:user.id,tenantId,role,status:"active",createdAt:new Date(),updatedAt:new Date()}},{upsert:true});
  }
  const authenticate=async(req:any,reply:any):Promise<{claims:Claims;user:{id:string;email:string;enabled:boolean}|null}|null>=>{
   try{
    await req.jwtVerify();
    const claims=req.user as Claims;
    if(claims.aud!=="bee-core"||!claims.sub){reply.code(401).send({error:"Unauthorized"});return null;}
    const user=await users.findOne({id:claims.sub,enabled:true});
    if(!user){reply.code(401).send({error:"Unauthorized"});return null;}
    return {claims,user};
   }catch{reply.code(401).send({error:"Unauthorized"});return null;}
  };
  ctx.server.get("/companies",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const rows=await memberships.find({userId:auth.user!.id,status:"active"}).toArray();
   const result=[];
   for(const membership of rows){
    const company=await companies.findOne({id:membership.tenantId});
    if(company)result.push({id:company.id,name:company.name,status:company.status??"active",role:membership.role,active:membership.tenantId===(auth.claims.tenantId??auth.user!.tenantId)});
   }
   return {companies:result};
  });
  ctx.server.post<{Body:CreateCompanyBody}>("/companies",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const name=String(req.body?.name??"").trim();
   if(name.length<2||name.length>120)return reply.code(400).send({error:"Company name must contain between 2 and 120 characters"});
   const id=randomUUID(),now=new Date();
   const company:Company={id,name,createdAt:now,status:"active"};
   const membership:Membership={id:randomUUID(),userId:auth.user!.id,tenantId:id,role:"owner",status:"active",createdAt:now,updatedAt:now};
   await db.collection("tenants").insertOne(company);
   try{await memberships.insertOne(membership);}
   catch(error){await companies.deleteOne({id});throw error;}
   return reply.code(201).send({company:{id,name,status:"active"},membership:{role:"owner",status:"active"},next:"POST /companies/"+id+"/activate to switch the current session"});
  });
  ctx.server.post<{Params:{companyId:string}}>("/companies/:companyId/activate",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const {claims,user}=auth;
   if(!claims.sid||!claims.client)return reply.code(401).send({error:"Session cannot change company context"});
   const membership=await memberships.findOne({userId:user!.id,tenantId:req.params.companyId,status:"active"});
   if(!membership)return reply.code(403).send({error:"Active membership required for this company"});
   const company=await companies.findOne({id:req.params.companyId,status:{$ne:"suspended"}});
   if(!company)return reply.code(404).send({error:"Company not found or suspended"});
   const session=await db.collection("refresh_sessions").findOneAndUpdate({id:claims.sid,userId:user!.id,revokedAt:null,expiresAt:{$gt:new Date()}},{$set:{tenantId:company.id}},{returnDocument:"after"});
   if(!session)return reply.code(401).send({error:"Session expired or revoked"});
   const role: string=membership.role;
   const roles=role==="owner"||role==="admin"?["admin"]:["user"];
   const accessToken=ctx.server.jwt.sign({sub:user!.id,email:user!.email,roles,tenantId:company.id,client:claims.client,aud:"bee-core",sid:claims.sid});
   return {accessToken,tokenType:"Bearer",expiresIn:1200,tenantId:company.id,company:{id:company.id,name:company.name},membership:{role:membership.role}};
  });
  ctx.server.get("/companies/active",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const tenantId=String(auth.claims.tenantId??auth.user!.tenantId??"");
   const membership=await memberships.findOne({userId:auth.user!.id,tenantId,status:"active"});
   if(!membership)return reply.code(403).send({error:"Active company membership required"});
   const company=await companies.findOne({id:tenantId});
   if(!company)return reply.code(404).send({error:"Company not found"});
   return {company:{id:company.id,name:company.name,status:company.status??"active"},membership:{role:membership.role}};
  });
  ctx.logger.info("Organizations plugin initialized: company memberships backfilled and indexed.");
 },
 async stop(){/* Mongo client is short-lived at process scope; connections close on process shutdown. */}
};
