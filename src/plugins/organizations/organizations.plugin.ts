import type { BeePlugin } from "../../core/types.js";
import { MongoClient, type Collection, type Db } from "mongodb";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { COMPANY_ROLE_PERMISSIONS, resolveTenantContext } from "../../core/tenant-context.js";
import { getTenantUserLimit } from "../../core/plugin-entitlements.js";
import { normalizeCustomRoleName, normalizeTenantCustomRolePermissions, permissionsForCustomRole, type CustomRolePolicy } from "../../core/role-policy.js";

type Company = { id:string; name:string; domains?:string[]; createdAt:Date; status?:"active"|"suspended" };
type Membership = { id:string; userId:string; tenantId:string; role:"owner"|"admin"|"manager"|"member"|"custom"; customRoleId?:string; status:"active"|"invited"|"suspended"; createdAt:Date; updatedAt:Date };
type Claims = { sub?:string; email?:string; roles?:string[]; client?:"backend"|"dashboard"|"public"; tenantId?:string; sid?:string; aud?:string };
type CreateCompanyBody = { name?:string };
type Invitation = { id:string; tenantId:string; email:string; role:"admin"|"manager"|"member"; tokenHash:string; createdBy:string; createdAt:Date; expiresAt:Date; acceptedAt:Date|null; cancelledAt:Date|null };
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
  const invitations:Collection<Invitation>=db.collection("company_invitations");
  const customRoles:Collection<CustomRolePolicy>=db.collection("company_roles");
  await Promise.all([
   memberships.createIndex({id:1},{unique:true,name:"memberships_id_unique"}),
   memberships.createIndex({userId:1,tenantId:1},{unique:true,name:"memberships_user_company_unique"}),
   memberships.createIndex({tenantId:1,status:1},{name:"memberships_company_status"}),
   memberships.createIndex({userId:1,status:1},{name:"memberships_user_status"}),
   customRoles.createIndex({id:1},{unique:true,name:"company_roles_id_unique"}),
   customRoles.createIndex({tenantId:1,name:1},{unique:true,name:"company_roles_tenant_name_unique"}),
   invitations.createIndex({tokenHash:1},{unique:true,name:"company_invitation_token_unique"}),
   invitations.createIndex({tenantId:1,email:1,acceptedAt:1,cancelledAt:1},{name:"company_invitations_tenant_email"}),
   invitations.createIndex({tenantId:1,email:1},{unique:true,partialFilterExpression:{acceptedAt:null,cancelledAt:null},name:"company_invitation_one_pending_per_email"})
  ]);
  // Backfill the current single-tenant model into explicit memberships.
  for await(const user of users.find({tenantId:{$exists:true,$ne:""}}).sort({createdAt:1,id:1})){
   const tenantId=String(user.tenantId);
   const company=await companies.findOne({id:tenantId});
   if(!company)continue;
   const legacyRoles=user.roles??[];
   const hasOwner=await memberships.findOne({tenantId,role:"owner",status:"active"},{projection:{_id:1}});
   const role:Membership["role"]=legacyRoles.includes("admin")?(hasOwner?"admin":"owner"):legacyRoles.includes("service")?"manager":"member";
   await memberships.updateOne({userId:user.id,tenantId},{$setOnInsert:{id:randomUUID(),userId:user.id,tenantId,role,status:"active",createdAt:new Date(),updatedAt:new Date()}},{upsert:true});
  }
  // Normalize duplicate owners from early builds before enforcing one active owner per company.
  for await(const company of companies.find({}, {projection:{id:1}})){
   const owners=await memberships.find({tenantId:company.id,role:"owner",status:"active"}).sort({createdAt:1,id:1}).toArray();
   for(const duplicate of owners.slice(1))await memberships.updateOne({id:duplicate.id},{$set:{role:"admin",updatedAt:new Date()}});
  }
  await memberships.createIndex({tenantId:1},{unique:true,partialFilterExpression:{role:"owner",status:"active"},name:"memberships_one_active_owner_per_company"});
  const authenticate=async(req:any,reply:any,options:{allowSuspendedCompany?:boolean}={}):Promise<{claims:Claims;user:{id:string;email:string;enabled:boolean;tenantId?:string}|null}|null>=>{
   try{
    await req.jwtVerify();
    const claims=req.user as Claims;
    const tenantContext=await resolveTenantContext(db,claims,options);
    if(!tenantContext){reply.code(401).send({error:"Unauthorized or active company session required"});return null;}
    const user=await users.findOne({id:tenantContext.userId,enabled:true});
    if(!user){reply.code(401).send({error:"Unauthorized"});return null;}
    return {claims,user};
   }catch{reply.code(401).send({error:"Unauthorized"});return null;}
  };
  const rolePermissions=COMPANY_ROLE_PERMISSIONS;
  const requireCompanyPermission=async(auth:{claims:Claims;user:{id:string;email:string;enabled:boolean;tenantId?:string}|null},companyId:string,permission:string,reply:any)=>{
   const activeTenantId=String(auth.claims.tenantId??auth.user!.tenantId??"");
   if(companyId!==activeTenantId){reply.code(403).send({error:"Switch to this company before accessing its resources"});return null;}
   const actor=await memberships.findOne({userId:auth.user!.id,tenantId:companyId,status:"active"});
   let effectivePermissions:readonly string[]=[];
   if(actor?.role==="custom"&&actor.customRoleId){const custom=await customRoles.findOne({id:actor.customRoleId,tenantId:companyId});if(custom){try{effectivePermissions=permissionsForCustomRole(custom);}catch{}}}
   else if(actor&&actor.role!=="custom")effectivePermissions=rolePermissions[actor.role];
   if(!actor||!effectivePermissions.includes(permission)){reply.code(403).send({error:"Company permission required: "+permission});return null;}
   return actor;
  };
  const requireCompanyAdmin=(auth:{claims:Claims;user:{id:string;email:string;enabled:boolean;tenantId?:string}|null},companyId:string,reply:any)=>requireCompanyPermission(auth,companyId,"members.manage",reply);
  // Custom company roles: tenant-scoped, owner-managed and permission-validated.
  const ownerOnly=async(auth:{claims:Claims;user:{id:string;email:string;enabled:boolean;tenantId?:string}|null},companyId:string,reply:any)=>{
   const actor=await requireCompanyPermission(auth,companyId,"members.manage",reply);
   if(!actor)return null;
   if(actor.role!=="owner"){reply.code(403).send({error:"Only the company owner can manage custom roles"});return null;}
   return actor;
  };
  ctx.server.get<{Params:{companyId:string}}>("/companies/:companyId/roles",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const actor=await requireCompanyPermission(auth,req.params.companyId,"members.read",reply);if(!actor)return;
   const rows=await customRoles.find({tenantId:req.params.companyId}).sort({name:1}).toArray();
   return {roles:rows.map(({id,name,description,permissions,createdAt,updatedAt})=>({id,name,description,permissions,createdAt,updatedAt}))};
  });
  ctx.server.post<{Params:{companyId:string};Body:{name?:string;description?:string;permissions?:unknown}}>("/companies/:companyId/roles",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const actor=await ownerOnly(auth,req.params.companyId,reply);if(!actor)return;
   let name:string,permissions:string[];
   try{name=normalizeCustomRoleName(req.body?.name);permissions=normalizeTenantCustomRolePermissions(req.body?.permissions);}catch(error){return reply.code(400).send({error:error instanceof Error?error.message:"Invalid custom role"});}
   const description=String(req.body?.description??"").trim().slice(0,240);
   const now=new Date(),role:CustomRolePolicy={id:randomUUID(),tenantId:req.params.companyId,name,description,permissions,createdBy:auth.user!.id,updatedBy:auth.user!.id,createdAt:now,updatedAt:now};
   try{await customRoles.insertOne(role);}catch{return reply.code(409).send({error:"A custom role with this name already exists"});}
   return reply.code(201).send({role:{id:role.id,name,description,permissions}});
  });
  ctx.server.put<{Params:{companyId:string;roleId:string};Body:{name?:string;description?:string;permissions?:unknown}}>("/companies/:companyId/roles/:roleId",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const actor=await ownerOnly(auth,req.params.companyId,reply);if(!actor)return;
   let name:string,permissions:string[];
   try{name=normalizeCustomRoleName(req.body?.name);permissions=normalizeCustomRolePermissions(req.body?.permissions);}catch(error){return reply.code(400).send({error:error instanceof Error?error.message:"Invalid custom role"});}
   const description=String(req.body?.description??"").trim().slice(0,240);
   const result=await customRoles.updateOne({id:req.params.roleId,tenantId:req.params.companyId},{$set:{name,description,permissions,updatedBy:auth.user!.id,updatedAt:new Date()}});
   if(!result.matchedCount)return reply.code(404).send({error:"Custom role not found"});
   return {role:{id:req.params.roleId,name,description,permissions}};
  });
  ctx.server.delete<{Params:{companyId:string;roleId:string}}>("/companies/:companyId/roles/:roleId",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const actor=await ownerOnly(auth,req.params.companyId,reply);if(!actor)return;
   const assigned=await memberships.countDocuments({tenantId:req.params.companyId,customRoleId:req.params.roleId});
   if(assigned)return reply.code(409).send({error:"Custom role is assigned to active members"});
   const result=await customRoles.deleteOne({id:req.params.roleId,tenantId:req.params.companyId});
   if(!result.deletedCount)return reply.code(404).send({error:"Custom role not found"});
   return {success:true};
  });
  ctx.server.post<{Params:{companyId:string};Body:{email?:string;role?:"admin"|"manager"|"member"}}>("/companies/:companyId/invitations",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const actor=await requireCompanyPermission(auth,req.params.companyId,"members.invite",reply);if(!actor)return;
   const email=String(req.body?.email??"").trim().toLowerCase(),role=req.body?.role??"member";
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!["admin","manager","member"].includes(role))return reply.code(400).send({error:"A valid email and membership role are required"});
   if(role==="admin"&&actor.role!=="owner")return reply.code(403).send({error:"Only the company owner can invite administrators"});
   const existingMembership=await memberships.findOne({tenantId:req.params.companyId,userId:(await users.findOne({email,enabled:true}))?.id,status:"active"});
   if(existingMembership)return reply.code(409).send({error:"User is already a company member"});
   const invitationNow=new Date();
   await invitations.updateMany({tenantId:req.params.companyId,email,acceptedAt:null,cancelledAt:null,expiresAt:{$lte:invitationNow}},{$set:{cancelledAt:invitationNow}});
   const pending=await invitations.findOne({tenantId:req.params.companyId,email,acceptedAt:null,cancelledAt:null,expiresAt:{$gt:new Date()}});
   if(pending)return reply.code(409).send({error:"An active invitation already exists for this email"});
   const userLimit=await getTenantUserLimit(db,req.params.companyId);
   if(userLimit!==null){
    const [activeMembers,pendingInvitations]=await Promise.all([
     memberships.countDocuments({tenantId:req.params.companyId,status:"active"}),
     invitations.countDocuments({tenantId:req.params.companyId,acceptedAt:null,cancelledAt:null,expiresAt:{$gt:new Date()}})
    ]);
    if(activeMembers+pendingInvitations>=userLimit)return reply.code(409).send({error:"Company user limit reached for the current plan"});
   }
   const token=randomBytes(32).toString("base64url"),now=new Date(),invitation:Invitation={id:randomUUID(),tenantId:req.params.companyId,email,role,tokenHash:createHash("sha256").update(token).digest("hex"),createdBy:auth.user!.id,createdAt:now,expiresAt:new Date(now.getTime()+7*24*60*60*1000),acceptedAt:null,cancelledAt:null};
   await invitations.insertOne(invitation);
   return reply.code(201).send({invitation:{id:invitation.id,email,role,expiresAt:invitation.expiresAt},acceptanceToken:token});
  });
  ctx.server.get<{Params:{companyId:string}}>("/companies/:companyId/invitations",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const actor=await requireCompanyAdmin(auth,req.params.companyId,reply);if(!actor)return;
   const rows=await invitations.find({tenantId:req.params.companyId}).sort({createdAt:-1}).toArray();
   return {invitations:rows.map(row=>({id:row.id,email:row.email,role:row.role,createdAt:row.createdAt,expiresAt:row.expiresAt,acceptedAt:row.acceptedAt,cancelledAt:row.cancelledAt,status:row.acceptedAt?"accepted":row.cancelledAt?"cancelled":row.expiresAt<=new Date()?"expired":"pending"}))};
  });
  ctx.server.delete<{Params:{companyId:string;invitationId:string}}>("/companies/:companyId/invitations/:invitationId",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const actor=await requireCompanyAdmin(auth,req.params.companyId,reply);if(!actor)return;
   const result=await invitations.updateOne({id:req.params.invitationId,tenantId:req.params.companyId,acceptedAt:null,cancelledAt:null},{$set:{cancelledAt:new Date()}});
   if(!result.matchedCount)return reply.code(404).send({error:"Pending invitation not found"});
   return {success:true,status:"cancelled"};
  });
  ctx.server.post<{Body:{token?:string}}>("/invitations/accept",async(req,reply)=>{
   const auth=await authenticate(req,reply,{allowSuspendedCompany:true});if(!auth)return;
   const token=String(req.body?.token??"");
   if(token.length<32)return reply.code(400).send({error:"A valid invitation token is required"});
   const tokenHash=createHash("sha256").update(token).digest("hex"),now=new Date();
   const invitation=await invitations.findOne({tokenHash,acceptedAt:null,cancelledAt:null,expiresAt:{$gt:now}});
   if(!invitation)return reply.code(404).send({error:"Invitation is invalid, expired or already used"});
   if(invitation.email!==auth.user!.email.toLowerCase())return reply.code(403).send({error:"Invitation email does not match the signed-in account"});
   const company=await companies.findOne({id:invitation.tenantId,status:{$ne:"suspended"}});
   if(!company)return reply.code(404).send({error:"Company is unavailable"});
   const existing=await memberships.findOne({userId:auth.user!.id,tenantId:invitation.tenantId});
   if(existing?.status==="active")return reply.code(409).send({error:"This account is already an active member of the company"});
   if(!existing||existing.status==="suspended"||existing.status==="invited"){
    const userLimit=await getTenantUserLimit(db,invitation.tenantId);
    if(userLimit!==null&&await memberships.countDocuments({tenantId:invitation.tenantId,status:"active"})>=userLimit)return reply.code(409).send({error:"Company user limit reached for the current plan"});
   }
   const consumed=await invitations.updateOne({id:invitation.id,acceptedAt:null,cancelledAt:null,expiresAt:{$gt:now}},{$set:{acceptedAt:now}});
   if(!consumed.modifiedCount)return reply.code(409).send({error:"Invitation has already been used"});
   if(existing)await memberships.updateOne({id:existing.id},{$set:{role:invitation.role,status:"active",updatedAt:now}});
   else await memberships.insertOne({id:randomUUID(),userId:auth.user!.id,tenantId:invitation.tenantId,role:invitation.role,status:"active",createdAt:now,updatedAt:now});
   return {success:true,company:{id:company.id,name:company.name},membership:{role:invitation.role,status:"active"}};
  });
  ctx.server.get<{Params:{companyId:string}}>("/companies/:companyId/memberships",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const companyId=req.params.companyId;
   const actor=await requireCompanyPermission(auth,companyId,"members.read",reply);if(!actor)return;
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
   const userLimit=await getTenantUserLimit(db,req.params.companyId);
   if(userLimit!==null){
    const [activeMembers,pendingInvitations]=await Promise.all([
     memberships.countDocuments({tenantId:req.params.companyId,status:"active"}),
     invitations.countDocuments({tenantId:req.params.companyId,acceptedAt:null,cancelledAt:null,expiresAt:{$gt:new Date()}})
    ]);
    if(activeMembers+pendingInvitations>=userLimit)return reply.code(409).send({error:"Company user limit reached for the current plan"});
   }
   const now=new Date();
   if(existing)await memberships.updateOne({id:existing.id},{$set:{role,status:"active",updatedAt:now}});
   else await memberships.insertOne({id:randomUUID(),userId:target.id,tenantId:req.params.companyId,role,status:"active",createdAt:now,updatedAt:now});
   return reply.code(201).send({membership:{userId:target.id,email:target.email,role,status:"active"}});
  });
  ctx.server.put<{Params:{companyId:string;userId:string};Body:{role?:"admin"|"manager"|"member";customRoleId?:string}}>("/companies/:companyId/memberships/:userId",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const actor=await requireCompanyAdmin(auth,req.params.companyId,reply);if(!actor)return;
   const target=await memberships.findOne({userId:req.params.userId,tenantId:req.params.companyId,status:"active"});
   if(!target)return reply.code(404).send({error:"Company membership not found"});
   if(target.role==="owner")return reply.code(409).send({error:"The company owner role cannot be changed here"});
   if(actor.role==="admin"&&target.role==="admin")return reply.code(403).send({error:"Administrators cannot change other administrator roles"});
   const customRoleId=String(req.body?.customRoleId??"").trim();
   let update:any;
   if(customRoleId){
    if(actor.role!=="owner")return reply.code(403).send({error:"Only the company owner can assign custom roles"});
    const customRole=await customRoles.findOne({id:customRoleId,tenantId:req.params.companyId});
    if(!customRole)return reply.code(404).send({error:"Custom role not found"});
    update={$set:{role:"custom",customRoleId,updatedAt:new Date()}};
   }else{
    const role=req.body?.role;
    if(!role||!["admin","manager","member"].includes(role))return reply.code(400).send({error:"A built-in membership role or customRoleId is required"});
    if(role==="admin"&&actor.role!=="owner")return reply.code(403).send({error:"Only the company owner can assign administrators"});
    update={$set:{role,updatedAt:new Date()},$unset:{customRoleId:""}};
   }
   await memberships.updateOne({id:target.id},update);
   await db.collection("refresh_sessions").updateMany({userId:target.userId,tenantId:req.params.companyId,revokedAt:null},{$set:{revokedAt:new Date()}});
   return {membership:{userId:target.userId,role:update.$set.role,customRoleId:update.$set.customRoleId??null,status:"active"},sessionsRevoked:true};
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
   const auth=await authenticate(req,reply,{allowSuspendedCompany:true});if(!auth)return;
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
   const auth=await authenticate(req,reply,{allowSuspendedCompany:true});if(!auth)return;
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
  ctx.server.get("/companies/active/permissions",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const tenantId=String(auth.claims.tenantId??auth.user!.tenantId??"");
   const membership=await memberships.findOne({userId:auth.user!.id,tenantId,status:"active"});
   if(!membership)return reply.code(403).send({error:"Active company membership required"});
   if(membership.role==="custom"&&membership.customRoleId){
    const custom=await customRoles.findOne({id:membership.customRoleId,tenantId});
    if(!custom)return reply.code(403).send({error:"Assigned custom role is unavailable"});
    return {tenantId,role:membership.role,customRoleId:membership.customRoleId,permissions:permissionsForCustomRole(custom)};
   }
   return {tenantId,role:membership.role,permissions:rolePermissions[membership.role as keyof typeof rolePermissions]};
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
