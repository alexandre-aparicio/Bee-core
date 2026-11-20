import type { BeePlugin } from "../../core/types.js";
import { MongoClient, type Collection, type Db } from "mongodb";
import { randomUUID } from "node:crypto";

type Company = { id:string; name:string; domains?:string[]; createdAt:Date; status?:"active"|"suspended" };
type Membership = { id:string; userId:string; tenantId:string; role:"owner"|"admin"|"manager"|"member"; status:"active"|"invited"|"suspended"; createdAt:Date; updatedAt:Date };
type Claims = { sub?:string; email?:string; roles?:string[]; client?:"backend"|"dashboard"|"public"; tenantId?:string; sid?:string; aud?:string };
type CreateCompanyBody = { name?:string };
let mongoClient:MongoClient|undefined;

export const organizationsPlugin:BeePlugin={
 manifest:{name:"organizations",version:"0.1.0",description:"Company records, user memberships and active-company session context",dependencies:["auth"]},
 async initialize(ctx){
  const mongoUri=String(ctx.config.mongoUri??""),dbName=String(ctx.config.mongoDbName??"bee_core");
  mongoClient=new MongoClient(mongoUri,{maxPoolSize:10,serverSelectionTimeoutMS:10000});
  await mongoClient.connect();
  const db:Db=mongoClient.db(dbName);
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
  const authenticate=async(req:any,reply:any):Promise<{claims:Claims;user:{id:string;email:string;enabled:boolean;tenantId?:string}|null}|null>=>{
   try{
    await req.jwtVerify();
    const claims=req.user as Claims;
    if(claims.aud!=="bee-core"||!claims.sub){reply.code(401).send({error:"Unauthorized"});return null;}
    const user=await users.findOne({id:claims.sub,enabled:true});
    if(!user){reply.code(401).send({error:"Unauthorized"});return null;}
    return {claims,user};
   }catch{reply.code(401).send({error:"Unauthorized"});return null;}
  };
  const requireCompanyAdmin=async(auth:{claims:Claims;user:{id:string;email:string;enabled:boolean;tenantId?:string}|null},companyId:string,reply:any)=>{
   const activeTenantId=String(auth.claims.tenantId??auth.user!.tenantId??"");
   if(companyId!==activeTenantId){reply.code(403).send({error:"Switch to this company before managing its members"});return null;}
   const actor=await memberships.findOne({userId:auth.user!.id,tenantId:companyId,status:"active"});
   if(!actor||!(actor.role==="owner"||actor.role==="admin")){reply.code(403).send({error:"Company administrator role required"});return null;}
   return actor;
  };
  ctx.server.get<{Params:{companyId:string}}>("/companies/:companyId/memberships",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const companyId=req.params.companyId;
   const actor=await memberships.findOne({userId:auth.user!.id,tenantId:companyId,status:"active"});
   if(!actor)return reply.code(403).send({error:"Company membership required"});
   const rows=await memberships.find({tenantId:companyId}).toArray();
   const memberUsers=await users.find({id:{$in:rows.map(row=>row.userId)}}).project({id:1,email:1}).toArray();
   const emails=new Map(memberUsers.map(user=>[user.id,user.email]));
   return {memberships:rows.map(row=>({userId:row.userId,email:emails.get(row.userId)??null,role:row.role,status:row.status,createdAt:row.createdAt}))};
  });
  ctx.server.post<{Params:{companyId:string};Body:{email?:string;role?:"admin"|"manager"|"member"}}>("/companies/:companyId/memberships",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const actor=await requireCompanyAdmin(auth,req.params.companyId,reply);if(!actor)return;
   const email=String(req.body?.email??"").trim().toLowerCase(),role=req.body?.role??"member";
   if(!email||!["admin","manager","member"].includes(role))return reply.code(400).send({error:"A valid email and role are required"});
   if(role==="admin"&&actor.role!=="owner")return reply.code(403).send({error:"Only the company owner can assign administrators"});
   const target=await users.findOne({email,enabled:true});
   if(!target)return reply.code(404).send({error:"An existing enabled user is required"});
   const existing=await memberships.findOne({userId:target.id,tenantId:req.params.companyId});
   if(existing?.status==="active")return reply.code(409).send({error:"User is already a company member"});
   const now=new Date();
   if(existing)await memberships.updateOne({id:existing.id},{$set:{role,status:"active",updatedAt:now}});
   else await memberships.insertOne({id:randomUUID(),userId:target.id,tenantId:req.params.companyId,role,status:"active",createdAt:now,updatedAt:now});
   return reply.code(201).send({membership:{userId:target.id,email:target.email,role,status:"active"}});
  });
  ctx.server.put<{Params:{companyId:string;userId:string};Body:{role?:"admin"|"manager"|"member"}}>("/companies/:companyId/memberships/:userId",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const actor=await requireCompanyAdmin(auth,req.params.companyId,reply);if(!actor)return;
   const role=req.body?.role;
   if(!role||!["admin","manager","member"].includes(role))return reply.code(400).send({error:"A valid membership role is required"});
   if(role==="admin"&&actor.role!=="owner")return reply.code(403).send({error:"Only the company owner can assign administrators"});
   const target=await memberships.findOne({userId:req.params.userId,tenantId:req.params.companyId,status:"active"});
   if(!target)return reply.code(404).send({error:"Company membership not found"});
   if(target.role==="owner")return reply.code(409).send({error:"The company owner role cannot be changed here"});
   await memberships.updateOne({id:target.id},{$set:{role,updatedAt:new Date()}});
   return {membership:{userId:target.userId,role,status:"active"}};
  });
  ctx.server.delete<{Params:{companyId:string;userId:string}}>("/companies/:companyId/memberships/:userId",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const actor=await requireCompanyAdmin(auth,req.params.companyId,reply);if(!actor)return;
   const target=await memberships.findOne({userId:req.params.userId,tenantId:req.params.companyId,status:"active"});
   if(!target)return reply.code(404).send({error:"Company membership not found"});
   if(target.role==="owner")return reply.code(409).send({error:"The company owner cannot be removed"});
   if(actor.role==="admin"&&target.role==="admin")return reply.code(403).send({error:"Administrators cannot remove other administrators"});
   await memberships.updateOne({id:target.id},{$set:{status:"suspended",updatedAt:new Date()}});
   await db.collection("refresh_sessions").updateMany({userId:target.userId,tenantId:req.params.companyId,revokedAt:null},{$set:{revokedAt:new Date()}});
   return {success:true,status:"suspended"};
  });
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
   const currentTenantId=String(claims.tenantId??user!.tenantId??"");
   const session=await db.collection("refresh_sessions").findOneAndUpdate({id:claims.sid,userId:user!.id,tenantId:currentTenantId,revokedAt:null,expiresAt:{$gt:new Date()}},{$set:{tenantId:company.id}},{returnDocument:"after"});
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
 async stop(){await mongoClient?.close();mongoClient=undefined;}
};
