import type { BeePlugin } from "../../core/types.js";
import { type Collection, type Db } from "mongodb";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { COMPANY_ROLE_PERMISSIONS, resolveTenantContext, type TenantContext } from "../../core/tenant-context.js";
import { getTenantUserLimit } from "../../core/plugin-entitlements.js";
import { normalizeCustomRoleName, normalizeTenantCustomRolePermissions, normalizeRestrictionPermissions, type CustomRolePolicy } from "../../core/role-policy.js";
import { CORE_PERMISSION_CATALOG } from "../../core/permission-catalog.js";
import { appendTenantAuditEvent, ensureTenantAuditIndexes, AUDIT_ACTIONS, type TenantAuditEvent } from "../../core/audit-log.js";
import { normalizeTenantSlug, slugifyTenantName, tenantSlugFromHost } from "../../core/tenant-domain.js";
import { maskResourceId, maskTenantId, unmaskResourceId, unmaskTenantId } from "../../core/session-id.js";

type CompanyProfile={legalName?:string;taxId?:string;email?:string;phone?:string;website?:string;addressLine1?:string;addressLine2?:string;city?:string;region?:string;postalCode?:string;country?:string;industry?:string;description?:string};
type Company = { id:string; name:string; slug?:string; kind?:"super"|"tenant"; domains?:string[]; profile?:CompanyProfile; settings?:{defaultLanguage?:"en"|"es"}; createdAt:Date; status?:"active"|"suspended" };
type Membership = { id:string; userId:string; tenantId:string; role:"super_admin"|"owner"|"admin"|"manager"|"member"|"guest"|"custom"; customRoleId?:string; restrictionRoleIds?:string[]; status:"active"|"invited"|"suspended"; createdAt:Date; updatedAt:Date };
type Claims = { sub?:string; email?:string; roles?:string[]; client?:"backend"|"dashboard"|"public"; tenantRef?:string; sid?:string; aud?:string };
type CreateCompanyBody = { name?:string; slug?:string };
type Invitation = { id:string; tenantId:string; email:string; role:"admin"|"manager"|"member"|"guest"|"custom"; customRoleId?:string; restrictionRoleIds?:string[]; tokenHash:string; createdBy:string; createdAt:Date; expiresAt:Date; acceptedAt:Date|null; cancelledAt:Date|null };

export const organizationsPlugin:BeePlugin={
 manifest:{name:"organizations",version:"0.1.0",description:"Company records, user memberships and active-company session context",dependencies:["auth"]},
 async initialize(ctx){
  const dbName=String(ctx.config.mongoDbName??"bee_core");
  const db:Db=ctx.mongoClient.db(dbName);
  const sessionIdSecret=String(ctx.config.sessionIdSecret ?? ctx.config.jwtSecret ?? "");
  if(sessionIdSecret.length<32)throw new Error("Organizations: JWT_SECRET must contain at least 32 characters.");
  const sessionOf=(auth:{tenantContext:TenantContext})=>({sessionId:auth.tenantContext.sessionId,expiresAt:auth.tenantContext.sessionExpiresAt});
  const mask=(auth:{tenantContext:TenantContext},id:string,type:import("../../core/session-id.js").SessionResourceType)=>maskResourceId(id,type,sessionOf(auth),sessionIdSecret);
  const unmask=(auth:{tenantContext:TenantContext},id:string,type:import("../../core/session-id.js").SessionResourceType)=>unmaskResourceId(id,type,sessionOf(auth),sessionIdSecret);
  const maskAuditMetadata=(auth:{tenantContext:TenantContext},value:unknown,depth=0):unknown=>{
   if(depth>6||value===null||typeof value!=="object")return value;
   if(Array.isArray(value))return value.map(item=>maskAuditMetadata(auth,item,depth+1));
   const identifierTypes:Record<string,import("../../core/session-id.js").SessionResourceType>={tenantId:"tenant",companyId:"tenant",pluginId:"plugin",userId:"user",actorId:"user",jobId:"job",invitationId:"invitation",roleId:"role",membershipId:"membership",fileId:"file",noteId:"note"};
   const result:Record<string,unknown>={};
   for(const [key,item] of Object.entries(value as Record<string,unknown>)){
    const type=identifierTypes[key];
    if(type&&typeof item==="string"){try{result[key]=mask(auth,item,type);}catch{result[key]="[redacted]";}}
    else result[key]=maskAuditMetadata(auth,item,depth+1);
   }
   return result;
  };
  const auditEvents:Collection<TenantAuditEvent>=db.collection("tenant_audit_events");
  await ensureTenantAuditIndexes(auditEvents);
  const auditOrganizationEvent=async(event:{tenantId:string;actorId:string;action:TenantAuditEvent["action"];outcome:TenantAuditEvent["outcome"];resourceType?:string;resourceId?:string;metadata?:TenantAuditEvent["metadata"]})=>{try{const record:import("../../core/audit-log.js").AuditEventInput={id:randomUUID(),occurredAt:new Date(),tenantId:event.tenantId,actorId:event.actorId,action:event.action,outcome:event.outcome,resourceType:event.resourceType,resourceId:event.resourceId,metadata:event.metadata};await appendTenantAuditEvent(auditEvents,record);}catch(error){ctx.logger.error("Organization audit event write failed",{action:event.action,tenantId:event.tenantId,error});}};
  const users=db.collection<{id:string;email:string;enabled:boolean;tenantId?:string;roles?:string[]}>("users");
  const companies:Collection<Company>=db.collection("tenants");
  const memberships:Collection<Membership>=db.collection("memberships");
  const invitations:Collection<Invitation>=db.collection("company_invitations");
  const customRoles:Collection<CustomRolePolicy>=db.collection("company_roles");
  const permissionPolicies=db.collection<{id:string;tenantAssignablePermissions:string[]}>("platform_permission_policies");
  const getTenantAssignablePermissions=async():Promise<string[]>=>{
   const policy=await permissionPolicies.findOne({id:"global"},{projection:{tenantAssignablePermissions:1}});
   return policy?.tenantAssignablePermissions??CORE_PERMISSION_CATALOG.filter(item=>item.customRoleAssignable).map(item=>item.key);
  };
  // Backfill stable public subdomain slugs for tenants created before host routing existed.
  const usedTenantSlugs=new Set<string>();
  for await(const tenant of companies.find({}).sort({createdAt:1,id:1})){
   let slug="";
   try{slug=tenant.slug?normalizeTenantSlug(tenant.slug):slugifyTenantName(tenant.name);}catch{slug="";}
   if(!slug||usedTenantSlugs.has(slug))slug="tenant-"+tenant.id.replace(/[^a-z0-9]/gi,"").slice(0,12).toLowerCase();
   let candidate=slug,suffix=tenant.id.replace(/[^a-z0-9]/gi,"").slice(0,8).toLowerCase();
   while(usedTenantSlugs.has(candidate))candidate=(slug.slice(0,39)+"-"+suffix).slice(0,48);
   usedTenantSlugs.add(candidate);
   if(tenant.slug!==candidate)await companies.updateOne({id:tenant.id},{$set:{slug:candidate}});
  }
  await companies.createIndex({slug:1},{unique:true,sparse:true,name:"tenants_slug_unique"});
  const publicBaseDomain=String(ctx.config.publicBaseDomain??"beecore.beeprojects.net").trim().toLowerCase().replace(/^\.+|\.+$/g,"");
  // Resolve from the preserved Host header; arbitrary X-Forwarded-Host is not trusted.
  ctx.server.get("/public/tenant",async(req,reply)=>{
   const hostname=String(req.hostname??"").trim().toLowerCase().replace(/\.$/,"");
   if(hostname===publicBaseDomain)return {kind:"corporate"};
   const slug=tenantSlugFromHost(hostname,publicBaseDomain);
   let tenant:Company|null=null;
   if(slug)tenant=await companies.findOne({slug});
   else if(!hostname.endsWith("."+publicBaseDomain))tenant=await companies.findOne({domains:hostname});
   if(!tenant||(tenant.status??"active")!=="active")return reply.code(404).send({error:"Public tenant not found"});
   return {kind:"tenant",tenant:{id:tenant.slug??null,name:tenant.name,slug:tenant.slug??null}};
  });
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
  const authenticate=async(req:any,reply:any,options:{allowSuspendedCompany?:boolean}={}):Promise<{claims:Claims;tenantContext:TenantContext;user:{id:string;email:string;enabled:boolean;tenantId?:string}|null}|null>=>{
   try{
    await req.jwtVerify();
    const claims=req.user as Claims;
    const tenantContext=await resolveTenantContext(db,claims,options,sessionIdSecret);
    if(!tenantContext){reply.code(401).send({error:"Unauthorized or active company session required"});return null;}
    if(tenantContext.client!=="dashboard"){reply.code(403).send({error:"Company administration requires a dashboard session"});return null;}
    try {
     if(req.params?.companyId)req.params.companyId=unmaskTenantId(String(req.params.companyId),sessionOf({tenantContext}),sessionIdSecret);
     if(req.params?.roleId)req.params.roleId=unmaskResourceId(String(req.params.roleId),"role",sessionOf({tenantContext}),sessionIdSecret);
     if(req.params?.invitationId)req.params.invitationId=unmaskResourceId(String(req.params.invitationId),"invitation",sessionOf({tenantContext}),sessionIdSecret);
     if(req.params?.userId)req.params.userId=unmaskResourceId(String(req.params.userId),"user",sessionOf({tenantContext}),sessionIdSecret);
     if(typeof req.body?.customRoleId==="string"&&req.body.customRoleId.trim())req.body.customRoleId=unmaskResourceId(req.body.customRoleId.trim(),"role",sessionOf({tenantContext}),sessionIdSecret);
     if(Array.isArray(req.body?.restrictionRoleIds))req.body.restrictionRoleIds=req.body.restrictionRoleIds.map((id:unknown)=>unmaskResourceId(String(id),"role",sessionOf({tenantContext}),sessionIdSecret));
    } catch { reply.code(404).send({error:"Resource not found"});return null; }
    const user=await users.findOne({id:tenantContext.userId,enabled:true});
    if(!user){reply.code(401).send({error:"Unauthorized"});return null;}
    return {claims,tenantContext,user};
   }catch{reply.code(401).send({error:"Unauthorized"});return null;}
  };
  const rolePermissions=COMPANY_ROLE_PERMISSIONS;
  const requireCompanyPermission=async(auth:{claims:Claims;tenantContext:TenantContext;user:{id:string;email:string;enabled:boolean;tenantId?:string}|null},companyId:string,permission:string,reply:any)=>{
   const activeTenantId=auth.tenantContext.tenantId;
   if(companyId!==activeTenantId){reply.code(403).send({error:"Switch to this company before accessing its resources"});return null;}
   const actor=await memberships.findOne({userId:auth.user!.id,tenantId:companyId,status:"active"});
   const effectivePermissions=auth.tenantContext.permissions;
   if(!actor||!effectivePermissions.includes(permission)){
    if(auth.user&&activeTenantId&&companyId===activeTenantId)await auditOrganizationEvent({tenantId:activeTenantId,actorId:auth.user.id,action:"permission.denied",outcome:"denied",resourceType:"permission",metadata:{permission}});
    reply.code(403).send({error:"Company permission required: "+permission});return null;
   }
   return actor;
  };
  const requireCompanyAdmin=(auth:{claims:Claims;tenantContext:TenantContext;user:{id:string;email:string;enabled:boolean;tenantId?:string}|null},companyId:string,reply:any)=>requireCompanyPermission(auth,companyId,"members.manage",reply);
  // Custom company roles: tenant-scoped, owner-managed and permission-validated.
  const ownerOnly=async(auth:{claims:Claims;tenantContext:TenantContext;user:{id:string;email:string;enabled:boolean;tenantId?:string}|null},companyId:string,reply:any)=>{
   const actor=await requireCompanyPermission(auth,companyId,"members.manage",reply);
   if(!actor)return null;
   const superOrganization=actor.role==="super_admin"?await companies.findOne({id:companyId,kind:"super"}):null;
   if(actor.role!=="owner"&&!superOrganization){reply.code(403).send({error:"Only the company owner or Super Organization super_admin can manage custom roles"});return null;}
   return actor;
  };
  ctx.server.get<{Params:{companyId:string}}>("/companies/:companyId/roles",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const actor=await requireCompanyPermission(auth,req.params.companyId,"members.read",reply);if(!actor)return;
   const rows=await customRoles.find({tenantId:req.params.companyId}).sort({name:1}).toArray();
   const company=await companies.findOne({id:req.params.companyId});
   const roleKeys=company?.kind==="super"?["super_admin","owner","admin","manager","member","guest"] as const:["owner","admin","manager","member","guest"] as const;
   const roleLabels:Record<string,string>={super_admin:"Super Admin",owner:"Owner",admin:"Admin",manager:"Manager",member:"Member",guest:"Guest"};
   const roleDescriptions:Record<string,string>={super_admin:"Protected global platform authority; cannot be restricted or delegated.",owner:"Full administration of this organization; protected against accidental lockout.",admin:"Delegated organization administration.",manager:"Operational management without ownership privileges.",member:"Standard organization access.",guest:"Minimal read-only access; default access is limited to viewing plugins."};
   const systemRoles=roleKeys.map(key=>({key,label:roleLabels[key],protected:key==="super_admin"||key==="owner",description:roleDescriptions[key],permissions:COMPANY_ROLE_PERMISSIONS[key]}));
   return {roles:rows.map(({id,name,description,permissions,mode,createdAt,updatedAt})=>({id:mask(auth,id,"role"),name,description,permissions,mode:mode??"grant",createdAt,updatedAt})),systemRoles,permissionCatalog:CORE_PERMISSION_CATALOG,tenantAssignablePermissions:await getTenantAssignablePermissions()};
  });
  ctx.server.post<{Params:{companyId:string};Body:{name?:string;description?:string;permissions?:unknown;mode?:"grant"|"restriction"}}>("/companies/:companyId/roles",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const actor=await ownerOnly(auth,req.params.companyId,reply);if(!actor)return;
   let name:string,permissions:string[];
   const mode=req.body?.mode==="restriction"?"restriction":"grant";
   try{name=normalizeCustomRoleName(req.body?.name);permissions=mode==="restriction"?normalizeRestrictionPermissions(req.body?.permissions):normalizeTenantCustomRolePermissions(req.body?.permissions,await getTenantAssignablePermissions());}catch(error){return reply.code(400).send({error:error instanceof Error?error.message:"Invalid custom role"});}
   const description=String(req.body?.description??"").trim().slice(0,240);
   const now=new Date(),role:CustomRolePolicy={id:randomUUID(),tenantId:req.params.companyId,name,description,permissions,mode,createdBy:auth.user!.id,updatedBy:auth.user!.id,createdAt:now,updatedAt:now};
   try{await customRoles.insertOne(role);}catch{return reply.code(409).send({error:"A custom role with this name already exists"});}
   await auditOrganizationEvent({tenantId:req.params.companyId,actorId:auth.user!.id,action:"role.created",outcome:"success",resourceType:"role",resourceId:role.id,metadata:{name,mode}});
   return reply.code(201).send({role:{id:mask(auth,role.id,"role"),name,description,permissions,mode}});
  });
  ctx.server.put<{Params:{companyId:string;roleId:string};Body:{name?:string;description?:string;permissions?:unknown;mode?:"grant"|"restriction"}}>("/companies/:companyId/roles/:roleId",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const actor=await ownerOnly(auth,req.params.companyId,reply);if(!actor)return;
   const existing=await customRoles.findOne({id:req.params.roleId,tenantId:req.params.companyId});
   if(!existing)return reply.code(404).send({error:"Custom role not found"});
   const mode=req.body?.mode==="restriction"?"restriction":req.body?.mode==="grant"?"grant":existing.mode??"grant";
   let name:string,permissions:string[];
   try{name=normalizeCustomRoleName(req.body?.name);permissions=mode==="restriction"?normalizeRestrictionPermissions(req.body?.permissions):normalizeTenantCustomRolePermissions(req.body?.permissions,await getTenantAssignablePermissions());}catch(error){return reply.code(400).send({error:error instanceof Error?error.message:"Invalid custom role"});}
   const description=String(req.body?.description??"").trim().slice(0,240);
   if(mode!== (existing.mode??"grant")){
    const assigned=await memberships.countDocuments({tenantId:req.params.companyId,$or:[{customRoleId:req.params.roleId},{restrictionRoleIds:req.params.roleId}]});
    const pendingInvitations=await invitations.countDocuments({tenantId:req.params.companyId,acceptedAt:null,cancelledAt:null,expiresAt:{$gt:new Date()},$or:[{customRoleId:req.params.roleId},{restrictionRoleIds:req.params.roleId}]});
    if(assigned||pendingInvitations)return reply.code(409).send({error:"A role cannot change between grant and restriction mode while assigned to members or pending invitations."});
   }
   const result=await customRoles.updateOne({id:req.params.roleId,tenantId:req.params.companyId},{$set:{name,description,permissions,mode,updatedBy:auth.user!.id,updatedAt:new Date()}});
   if(!result.matchedCount)return reply.code(404).send({error:"Custom role not found"});
   await auditOrganizationEvent({tenantId:req.params.companyId,actorId:auth.user!.id,action:"role.updated",outcome:"success",resourceType:"role",resourceId:req.params.roleId,metadata:{name,mode}});
   return {role:{id:mask(auth,req.params.roleId,"role"),name,description,permissions,mode}};
  });
  ctx.server.delete<{Params:{companyId:string;roleId:string}}>("/companies/:companyId/roles/:roleId",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const actor=await ownerOnly(auth,req.params.companyId,reply);if(!actor)return;
   const assigned=await memberships.countDocuments({tenantId:req.params.companyId,$or:[{customRoleId:req.params.roleId},{restrictionRoleIds:req.params.roleId}]});
   const pendingInvitations=await invitations.countDocuments({tenantId:req.params.companyId,acceptedAt:null,cancelledAt:null,expiresAt:{$gt:new Date()},$or:[{customRoleId:req.params.roleId},{restrictionRoleIds:req.params.roleId}]});
   if(assigned||pendingInvitations)return reply.code(409).send({error:"Custom role is assigned to members or pending invitations"});
   const result=await customRoles.deleteOne({id:req.params.roleId,tenantId:req.params.companyId});
   if(!result.deletedCount)return reply.code(404).send({error:"Custom role not found"});
   await auditOrganizationEvent({tenantId:req.params.companyId,actorId:auth.user!.id,action:"role.deleted",outcome:"success",resourceType:"role",resourceId:req.params.roleId});
   return {success:true};
  });
  ctx.server.post<{Params:{companyId:string};Body:{email?:string;role?:"admin"|"manager"|"member"|"guest"|"custom";customRoleId?:string;restrictionRoleIds?:string[]}}>("/companies/:companyId/invitations",async(req,reply)=>{
    const auth=await authenticate(req,reply);if(!auth)return;
    const actor=await requireCompanyPermission(auth,req.params.companyId,"members.invite",reply);if(!actor)return;
    const email=String(req.body?.email??"").trim().toLowerCase(),role=req.body?.role??"member",customRoleId=String(req.body?.customRoleId??"").trim(),restrictionRoleIds=Array.isArray(req.body?.restrictionRoleIds)?[...new Set(req.body.restrictionRoleIds.map(id=>String(id)))]:[];
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!["admin","manager","member","guest","custom"].includes(role))return reply.code(400).send({error:"A valid email and membership role are required"});
    if(role==="custom"&&!customRoleId)return reply.code(400).send({error:"Select a primary custom grant role"});
    if(role!=="custom"&&customRoleId)return reply.code(400).send({error:"A custom role ID is only valid with role=custom"});
    if((role==="custom"||restrictionRoleIds.length)&&!await ownerOnly(auth,req.params.companyId,reply))return;
    if(role==="custom"){
     const customRole=await customRoles.findOne({id:customRoleId,tenantId:req.params.companyId,mode:"grant"});
     if(!customRole)return reply.code(400).send({error:"The primary custom role must be a grant role in this organization"});
    }
    if(restrictionRoleIds.length){
     if(restrictionRoleIds.length>10)return reply.code(400).send({error:"A maximum of 10 restriction roles can be assigned"});
     const restrictions=await customRoles.find({id:{$in:restrictionRoleIds},tenantId:req.params.companyId,mode:"restriction"}).toArray();
     if(restrictions.length!==restrictionRoleIds.length)return reply.code(400).send({error:"Every additional role must be a restriction role in this organization"});
    }
    if(role==="admin"&&actor.role!=="owner"&&!(actor.role==="super_admin"&&await companies.findOne({id:req.params.companyId,kind:"super"})))return reply.code(403).send({error:"Only the company owner or Super Organization super_admin can invite administrators"});
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
   const token=randomBytes(32).toString("base64url"),now=new Date(),invitation:Invitation={id:randomUUID(),tenantId:req.params.companyId,email,role,...(customRoleId?{customRoleId}:{}),...(restrictionRoleIds.length?{restrictionRoleIds}:{}),tokenHash:createHash("sha256").update(token).digest("hex"),createdBy:auth.user!.id,createdAt:now,expiresAt:new Date(now.getTime()+7*24*60*60*1000),acceptedAt:null,cancelledAt:null};
   await invitations.insertOne(invitation);
   await auditOrganizationEvent({tenantId:invitation.tenantId,actorId:auth.user!.id,action:"member.invited",outcome:"success",resourceType:"invitation",resourceId:invitation.id,metadata:{role:invitation.role,phase:"created"}});
   return reply.code(201).send({invitation:{id:mask(auth,invitation.id,"invitation"),email,role,expiresAt:invitation.expiresAt},acceptanceToken:token});
  });
  ctx.server.get<{Params:{companyId:string}}>("/companies/:companyId/invitations",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const actor=await requireCompanyPermission(auth,req.params.companyId,"members.invite",reply);if(!actor)return;
   const rows=await invitations.find({tenantId:req.params.companyId}).sort({createdAt:-1}).toArray();
   return {invitations:rows.map(row=>({id:mask(auth,row.id,"invitation"),email:row.email,role:row.role,customRoleId:row.customRoleId?mask(auth,row.customRoleId,"role"):null,restrictionRoleIds:(row.restrictionRoleIds??[]).map(id=>mask(auth,id,"role")),createdAt:row.createdAt,expiresAt:row.expiresAt,acceptedAt:row.acceptedAt,cancelledAt:row.cancelledAt,status:row.acceptedAt?"accepted":row.cancelledAt?"cancelled":row.expiresAt<=new Date()?"expired":"pending"}))};
  });
  ctx.server.delete<{Params:{companyId:string;invitationId:string}}>("/companies/:companyId/invitations/:invitationId",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const actor=await requireCompanyPermission(auth,req.params.companyId,"members.invite",reply);if(!actor)return;
   const result=await invitations.updateOne({id:req.params.invitationId,tenantId:req.params.companyId,acceptedAt:null,cancelledAt:null},{$set:{cancelledAt:new Date()}});
   if(!result.matchedCount)return reply.code(404).send({error:"Pending invitation not found"});
   await auditOrganizationEvent({tenantId:req.params.companyId,actorId:auth.user!.id,action:"invitation.cancelled",outcome:"success",resourceType:"invitation",resourceId:req.params.invitationId});
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
    if(existing&&(existing.role==="owner"||existing.role==="super_admin"))return reply.code(409).send({error:"Protected organization memberships cannot be changed through an invitation"});
   if(!existing||existing.status==="suspended"||existing.status==="invited"){
    const userLimit=await getTenantUserLimit(db,invitation.tenantId);
    if(userLimit!==null&&await memberships.countDocuments({tenantId:invitation.tenantId,status:"active"})>=userLimit)return reply.code(409).send({error:"Company user limit reached for the current plan"});
   }
   const consumed=await invitations.updateOne({id:invitation.id,acceptedAt:null,cancelledAt:null,expiresAt:{$gt:now}},{$set:{acceptedAt:now}});
   if(!consumed.modifiedCount)return reply.code(409).send({error:"Invitation has already been used"});
   const membershipSet:any={role:invitation.role,status:"active",restrictionRoleIds:invitation.restrictionRoleIds??[],updatedAt:now};
    const membershipUnset:any={};
    if(invitation.customRoleId)membershipSet.customRoleId=invitation.customRoleId;else membershipUnset.customRoleId="";
    if(existing)await memberships.updateOne({id:existing.id},{$set:membershipSet,...(Object.keys(membershipUnset).length?{$unset:membershipUnset}:{})});
    else await memberships.insertOne({id:randomUUID(),userId:auth.user!.id,tenantId:invitation.tenantId,role:invitation.role,...(invitation.customRoleId?{customRoleId:invitation.customRoleId}:{}),restrictionRoleIds:invitation.restrictionRoleIds??[],status:"active",createdAt:now,updatedAt:now});
    await auditOrganizationEvent({tenantId:invitation.tenantId,actorId:auth.user!.id,action:"member.invited",outcome:"success",resourceType:"membership",resourceId:auth.user!.id,metadata:{role:invitation.role,restrictionRoleCount:(invitation.restrictionRoleIds??[]).length,phase:"accepted"}});
    return {success:true,company:{id:mask(auth,company.id,"tenant"),name:company.name},membership:{role:invitation.role,customRoleId:invitation.customRoleId?mask(auth,invitation.customRoleId,"role"):null,restrictionRoleIds:(invitation.restrictionRoleIds??[]).map(id=>mask(auth,id,"role")),status:"active"}};
  });
  ctx.server.get<{Params:{companyId:string}}>("/companies/:companyId/memberships",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const companyId=req.params.companyId;
   const actor=await requireCompanyPermission(auth,companyId,"members.read",reply);if(!actor)return;
   const rows=await memberships.find({tenantId:companyId}).toArray();
   const company=await companies.findOne({id:companyId});
   const activeOwner=await memberships.findOne({tenantId:companyId,role:"owner",status:"active"});
   const canAssignOwner=company?.kind==="super"&&actor.role==="super_admin"&&!activeOwner;
   const memberUsers=await users.find({id:{$in:rows.map(row=>row.userId)}}).project({id:1,email:1}).toArray();
   const emails=new Map(memberUsers.map(user=>[user.id,user.email]));
   return {canAssignOwner,memberships:rows.map(row=>({userId:mask(auth,row.userId,"user"),email:emails.get(row.userId)??null,role:row.role,customRoleId:row.customRoleId?mask(auth,row.customRoleId,"role"):null,restrictionRoleIds:(row.restrictionRoleIds??[]).map(id=>mask(auth,id,"role")),status:row.status,createdAt:row.createdAt}))};
  });
  ctx.server.post<{Params:{companyId:string};Body:{email?:string;role?:"admin"|"manager"|"member"|"guest"}}>("/companies/:companyId/memberships",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const actor=await requireCompanyPermission(auth,req.params.companyId,"members.invite",reply);if(!actor)return;
   const email=String(req.body?.email??"").trim().toLowerCase(),role=req.body?.role??"member";
   if(!email||!["admin","manager","member","guest"].includes(role))return reply.code(400).send({error:"A valid email and role are required"});
   if(role==="admin"&&actor.role!=="owner"&&!(actor.role==="super_admin"&&await companies.findOne({id:req.params.companyId,kind:"super"})))return reply.code(403).send({error:"Only the company owner or Super Organization super_admin can assign administrators"});
   const target=await users.findOne({email,enabled:true});
   const existing=await memberships.findOne({userId:target?.id??"__unknown_account__",tenantId:req.params.companyId});
   const userLimit=await getTenantUserLimit(db,req.params.companyId);
   const [activeMembers,pendingInvitations]=await Promise.all([
    memberships.countDocuments({tenantId:req.params.companyId,status:"active"}),
    invitations.countDocuments({tenantId:req.params.companyId,acceptedAt:null,cancelledAt:null,expiresAt:{$gt:new Date()}})
   ]);
   const underLimit=userLimit===null||activeMembers+pendingInvitations<userLimit;
   if(target&&existing?.status!=="active"&&underLimit){
    const now=new Date();
    if(existing)await memberships.updateOne({id:existing.id},{$set:{role,status:"active",updatedAt:now}});
    else await memberships.insertOne({id:randomUUID(),userId:target.id,tenantId:req.params.companyId,role,status:"active",createdAt:now,updatedAt:now});
    await auditOrganizationEvent({tenantId:req.params.companyId,actorId:auth.user!.id,action:"member.added",outcome:"success",resourceType:"membership",resourceId:target.id,metadata:{role}});
   }
   // Unknown, disabled, already-active and over-limit addresses receive the same response.
   return reply.code(202).send({success:true,message:"The membership request has been accepted for processing."});
  });
  ctx.server.put<{Params:{companyId:string;userId:string};Body:{role?:"owner"|"admin"|"manager"|"member"|"guest";customRoleId?:string;restrictionRoleIds?:string[]}}>("/companies/:companyId/memberships/:userId",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const actor=await requireCompanyAdmin(auth,req.params.companyId,reply);if(!actor)return;
   const target=await memberships.findOne({userId:req.params.userId,tenantId:req.params.companyId,status:"active"});
   if(!target)return reply.code(404).send({error:"Company membership not found"});
   if(target.role==="owner"||target.role==="super_admin")return reply.code(409).send({error:"The company owner and Super Admin roles are protected"});
   if(actor.role==="admin"&&target.role==="admin")return reply.code(403).send({error:"Administrators cannot change other administrator roles"});
   const body=req.body??{};
   const hasRestrictions=Object.prototype.hasOwnProperty.call(body,"restrictionRoleIds");
   let nextRole:Membership["role"]=target.role;
   let nextCustomRoleId=target.customRoleId;
   if(body.customRoleId){
    if(actor.role!=="owner"&&!(actor.role==="super_admin"&&await companies.findOne({id:req.params.companyId,kind:"super"})))return reply.code(403).send({error:"Only the company owner or Super Organization super_admin can assign custom roles"});
    const customRole=await customRoles.findOne({id:body.customRoleId,tenantId:req.params.companyId});
    if(!customRole)return reply.code(404).send({error:"Custom role not found"});
    if(customRole.mode==="restriction")return reply.code(400).send({error:"Restriction roles must be assigned as additional restrictions, not as the primary role"});
    nextRole="custom";nextCustomRoleId=customRole.id;
   }else if(body.role){
    if(!["owner","admin","manager","member","guest"].includes(body.role))return reply.code(400).send({error:"A built-in membership role or customRoleId is required"});
    if(body.role==="owner"){
     const superOrganization=await companies.findOne({id:req.params.companyId,kind:"super"});
     if(actor.role!=="super_admin"||!superOrganization)return reply.code(403).send({error:"Only a Super Organization super_admin can appoint its owner"});
     const existingOwner=await memberships.findOne({tenantId:req.params.companyId,role:"owner",status:"active"});
     if(existingOwner&&existingOwner.userId!==target.userId)return reply.code(409).send({error:"A Super Organization owner already exists; ownership transfer requires a separate protected workflow"});
    }
    if(body.role==="admin"&&actor.role!=="owner"&&!(actor.role==="super_admin"&&await companies.findOne({id:req.params.companyId,kind:"super"})))return reply.code(403).send({error:"Only the company owner or Super Organization super_admin can assign administrators"});
    nextRole=body.role;nextCustomRoleId=undefined;
   }
   let restrictionRoleIds=nextRole==="owner"?[]:target.restrictionRoleIds??[];
   if(hasRestrictions){
    if(actor.role!=="owner"&&!(actor.role==="super_admin"&&await companies.findOne({id:req.params.companyId,kind:"super"})))return reply.code(403).send({error:"Only the owner or Super Organization super_admin can assign restriction roles"});
    if(nextRole==="owner")return reply.code(409).send({error:"Owner memberships cannot receive restriction roles"});
    if(!Array.isArray(body.restrictionRoleIds)||body.restrictionRoleIds.length>10||body.restrictionRoleIds.some(id=>typeof id!=="string"))return reply.code(400).send({error:"restrictionRoleIds must be an array of up to 10 role IDs"});
    restrictionRoleIds=[...new Set(body.restrictionRoleIds)];
    if(restrictionRoleIds.length){
     const restrictions=await customRoles.find({id:{$in:restrictionRoleIds},tenantId:req.params.companyId,mode:"restriction"}).toArray();
     if(restrictions.length!==restrictionRoleIds.length)return reply.code(400).send({error:"Every assigned role must be a restriction role in this organization"});
    }
   }
   const now=new Date(),set:any={role:nextRole,restrictionRoleIds,updatedAt:now},unset:any={};
   if(nextCustomRoleId)set.customRoleId=nextCustomRoleId;else unset.customRoleId="";
   await memberships.updateOne({id:target.id},{$set:set,...(Object.keys(unset).length?{$unset:unset}:{})});
   await auditOrganizationEvent({tenantId:req.params.companyId,actorId:auth.user!.id,action:"member.role_changed",outcome:"success",resourceType:"membership",resourceId:target.userId,metadata:{previousRole:target.role,newRole:nextRole,restrictionRoleIds:restrictionRoleIds.length}});
   await db.collection("refresh_sessions").updateMany({userId:target.userId,tenantId:req.params.companyId,revokedAt:null},{$set:{revokedAt:now}});
   return {membership:{userId:mask(auth,target.userId,"user"),role:nextRole,customRoleId:nextCustomRoleId?mask(auth,nextCustomRoleId,"role"):null,restrictionRoleIds:restrictionRoleIds.map(id=>mask(auth,id,"role")),status:"active"},sessionsRevoked:true};
  });
  ctx.server.delete<{Params:{companyId:string;userId:string}}>("/companies/:companyId/memberships/:userId",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const actor=await requireCompanyAdmin(auth,req.params.companyId,reply);if(!actor)return;
   const target=await memberships.findOne({userId:req.params.userId,tenantId:req.params.companyId,status:"active"});
   if(!target)return reply.code(404).send({error:"Company membership not found"});
   if(target.role==="owner"||target.role==="super_admin")return reply.code(409).send({error:"The company owner and Super Admin memberships cannot be removed here"});
   if(actor.role==="admin"&&target.role==="admin")return reply.code(403).send({error:"Administrators cannot remove other administrators"});
   await memberships.updateOne({id:target.id},{$set:{status:"suspended",updatedAt:new Date()}});
   await auditOrganizationEvent({tenantId:req.params.companyId,actorId:auth.user!.id,action:"member.suspended",outcome:"success",resourceType:"membership",resourceId:target.userId});
   await db.collection("refresh_sessions").updateMany({userId:target.userId,tenantId:req.params.companyId,revokedAt:null},{$set:{revokedAt:new Date()}});
   return {success:true,status:"suspended"};
  });
  ctx.server.patch<{Params:{companyId:string;userId:string};Body:{status?:"active"|"suspended"}}>("/companies/:companyId/memberships/:userId/status",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const actor=await requireCompanyAdmin(auth,req.params.companyId,reply);if(!actor)return;
   const status=req.body?.status;
   if(status!=="active"&&status!=="suspended")return reply.code(400).send({error:"status must be active or suspended"});
   const target=await memberships.findOne({userId:req.params.userId,tenantId:req.params.companyId,status:{$in:["active","suspended"]}});
   if(!target)return reply.code(404).send({error:"Company membership not found"});
   if(target.role==="owner"||target.role==="super_admin")return reply.code(409).send({error:"The company owner and Super Admin memberships cannot be changed here"});
   if(actor.role==="admin"&&target.role==="admin")return reply.code(403).send({error:"Administrators cannot change other administrators"});
   if(target.status===status)return {success:true,status,unchanged:true};
   const now=new Date();
   await memberships.updateOne({id:target.id},{$set:{status,updatedAt:now}});
   await db.collection("refresh_sessions").updateMany({userId:target.userId,tenantId:req.params.companyId,revokedAt:null},{$set:{revokedAt:now}});
   await auditOrganizationEvent({tenantId:req.params.companyId,actorId:auth.user!.id,action:status==="suspended"?"member.suspended":"member.activated",outcome:"success",resourceType:"membership",resourceId:target.userId});
   return {success:true,status,sessionsRevoked:true};
  });
  ctx.server.get<{Params:{companyId:string};Querystring:{page?:string;limit?:string;action?:string}}>("/companies/:companyId/audit-events",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const companyId=req.params.companyId;
   const actor=await requireCompanyPermission(auth,companyId,"members.read",reply);if(!actor)return;
   if(actor.role!=="owner"&&actor.role!=="admin"&&actor.role!=="super_admin"){
    await auditOrganizationEvent({tenantId:companyId,actorId:auth.user!.id,action:"permission.denied",outcome:"denied",resourceType:"permission",metadata:{permission:"audit.read"}});
    return reply.code(403).send({error:"Only company owners and administrators can read audit events"});
   }
   const page=Number(req.query.page??1),limit=Number(req.query.limit??25),action=String(req.query.action??"").trim();
   if(!Number.isSafeInteger(page)||page<1||page>10000||!Number.isSafeInteger(limit)||limit<1||limit>100)return reply.code(400).send({error:"Page must be between 1 and 10000 and limit must be between 1 and 100"});
   const allowedActions:readonly string[]=AUDIT_ACTIONS;
   if(action&&!allowedActions.includes(action))return reply.code(400).send({error:"Unsupported audit action filter"});
   const filter:import("mongodb").Filter<TenantAuditEvent>={tenantId:companyId};
   if(action)filter.action=action as TenantAuditEvent["action"];
   const rows=await auditEvents.find(filter,{projection:{_id:0,tenantId:0}}).sort({occurredAt:-1,id:-1}).skip((page-1)*limit).limit(limit+1).toArray();
   const hasMore=rows.length>limit;
   const events=rows.slice(0,limit).map(({id,actorId,action:recordAction,outcome,resourceType,resourceId,metadata,occurredAt})=>({id:mask(auth,id,"audit-event"),actorId:mask(auth,actorId,"user"),action:recordAction,outcome,resourceType,resourceId:resourceId?mask(auth,resourceId,resourceType==="plugin"?"plugin":resourceType==="role"?"role":resourceType==="invitation"?"invitation":resourceType==="membership"?"membership":resourceType==="user"?"user":resourceType==="tenant"?"tenant":resourceType==="file"?"file":resourceType==="note"?"note":resourceType==="job"?"job":"audit-event"):undefined,metadata:maskAuditMetadata(auth,metadata),occurredAt}));
   return {events,page,limit,hasMore};
  });
  ctx.server.get<{Params:{companyId:string}}>("/companies/:companyId/profile",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const actor=await requireCompanyPermission(auth,req.params.companyId,"members.read",reply);if(!actor)return;
   const company=await companies.findOne({id:req.params.companyId});
   if(!company)return reply.code(404).send({error:"Company not found"});
   return {name:company.name,profile:company.profile??{}};
  });
  ctx.server.patch<{Params:{companyId:string};Body:{name?:string;profile?:CompanyProfile}&CompanyProfile}>("/companies/:companyId/profile",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const actor=await requireCompanyPermission(auth,req.params.companyId,"members.manage",reply);if(!actor)return;
   const company=await companies.findOne({id:req.params.companyId});
   if(!company)return reply.code(404).send({error:"Company not found"});
   const bodyProfile=req.body?.profile??req.body;
   const nextName=String(req.body?.name??company.name).trim();
   if(nextName.length<2||nextName.length>120)return reply.code(400).send({error:"Company name must contain between 2 and 120 characters"});
   if(nextName!==company.name&&await companies.findOne({name:nextName,id:{$ne:company.id}},{projection:{_id:1}}))return reply.code(409).send({error:"A company with this name already exists"});
   const fields: (keyof CompanyProfile)[]=["legalName","taxId","email","phone","website","addressLine1","addressLine2","city","region","postalCode","country","industry","description"];
   const profile:CompanyProfile={...(company.profile??{})};
   for(const field of fields){const value=bodyProfile?.[field];if(value!==undefined)profile[field]=String(value??"").trim().slice(0,field==="description"?1000:field==="addressLine1"||field==="addressLine2"?180:field==="website"?240:field==="email"?160:field==="legalName"?160:120);}
   if(profile.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email))return reply.code(400).send({error:"Enter a valid company email address"});
   if(profile.website){try{const parsed=new URL(profile.website);if(!["http:","https:"].includes(parsed.protocol))throw new Error();}catch{return reply.code(400).send({error:"Website must be a valid http or https URL"});}}
   await companies.updateOne({id:company.id},{$set:{profile}});
   return {profile};
  });
  ctx.server.get("/companies",async(req,reply)=>{
   const auth=await authenticate(req,reply,{allowSuspendedCompany:true});if(!auth)return;
   const rows=await memberships.find({userId:auth.user!.id,status:"active"}).toArray();
   const result=[];
   for(const membership of rows){
    const company=await companies.findOne({id:membership.tenantId});
    if(company)result.push({id:mask(auth,company.id,"tenant"),name:company.name,status:company.status??"active",role:membership.role,active:membership.tenantId===auth.tenantContext.tenantId});
   }
   return {companies:result};
  });
  ctx.server.post<{Body:CreateCompanyBody}>("/companies",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const name=String(req.body?.name??"").trim();
   if(name.length<2||name.length>120)return reply.code(400).send({error:"Company name must contain between 2 and 120 characters"});
   let slug:string;
   try{slug=normalizeTenantSlug(req.body?.slug||slugifyTenantName(name));}catch(error){return reply.code(400).send({error:error instanceof Error?error.message:"Invalid tenant slug"});}
   if(await companies.findOne({slug},{projection:{_id:1}}))return reply.code(409).send({error:"This tenant slug is already in use"});
   const id=randomUUID(),now=new Date();
   const company:Company={id,name,slug,kind:"tenant",createdAt:now,status:"active",settings:{defaultLanguage:"en"}};
   const membership:Membership={id:randomUUID(),userId:auth.user!.id,tenantId:id,role:"owner",status:"active",createdAt:now,updatedAt:now};
   await db.collection("tenants").insertOne(company);
   try{await memberships.insertOne(membership);}
   catch(error){await companies.deleteOne({id});throw error;}
   return reply.code(201).send({company:{id:mask(auth,id,"tenant"),name,slug,status:"active"},membership:{role:"owner",status:"active"},next:"POST /companies/"+mask(auth,id,"tenant")+"/activate to switch the current session"});
  });
  ctx.server.post<{Params:{companyId:string}}>("/companies/:companyId/activate",async(req,reply)=>{
   const auth=await authenticate(req,reply,{allowSuspendedCompany:true});if(!auth)return;
   const {claims,user}=auth;
   if(!claims.sid||!claims.client)return reply.code(401).send({error:"Session cannot change company context"});
   const membership=await memberships.findOne({userId:user!.id,tenantId:req.params.companyId,status:"active"});
   if(!membership)return reply.code(403).send({error:"Active membership required for this company"});
   const company=await companies.findOne({id:req.params.companyId,status:{$ne:"suspended"}});
   if(!company)return reply.code(404).send({error:"Company not found or suspended"});
   const currentTenantId=auth.tenantContext.tenantId;
   const session=await db.collection("refresh_sessions").findOneAndUpdate({id:claims.sid,userId:user!.id,tenantId:currentTenantId,revokedAt:null,expiresAt:{$gt:new Date()}},{$set:{tenantId:company.id}},{returnDocument:"after"});
   if(!session)return reply.code(401).send({error:"Session expired or revoked"});
   const role: string=membership.role;
   const roles=role==="owner"||role==="admin"?["admin"]:["user"];
   const tenantRef=maskTenantId(company.id,{sessionId:auth.tenantContext.sessionId,expiresAt:auth.tenantContext.sessionExpiresAt},sessionIdSecret);
    const accessToken=ctx.server.jwt.sign({sub:maskResourceId(user!.id,"user",{sessionId:auth.tenantContext.sessionId,expiresAt:auth.tenantContext.sessionExpiresAt},sessionIdSecret),email:user!.email,roles,tenantRef,client:claims.client,aud:"bee-core",sid:claims.sid});
   return {accessToken,tokenType:"Bearer",expiresIn:1200,tenantId:tenantRef,company:{id:tenantRef,name:company.name},membership:{role:membership.role}};
  });
  ctx.server.get("/companies/active/permissions",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const tenantId=auth.tenantContext.tenantId;
   const membership=await memberships.findOne({userId:auth.user!.id,tenantId,status:"active"});
   if(!membership)return reply.code(403).send({error:"Active company membership required"});
   return {tenantId:mask(auth,tenantId,"tenant"),role:membership.role,customRoleId:membership.customRoleId?mask(auth,membership.customRoleId,"role"):null,restrictionRoleIds:(membership.restrictionRoleIds??[]).map(id=>mask(auth,id,"role")),permissions:auth.tenantContext.permissions};
  });
  ctx.server.get("/companies/active",async(req,reply)=>{
   const auth=await authenticate(req,reply);if(!auth)return;
   const tenantId=auth.tenantContext.tenantId;
   const membership=await memberships.findOne({userId:auth.user!.id,tenantId,status:"active"});
   if(!membership)return reply.code(403).send({error:"Active company membership required"});
   const company=await companies.findOne({id:tenantId});
   if(!company)return reply.code(404).send({error:"Company not found"});
   return {company:{id:mask(auth,company.id,"tenant"),name:company.name,status:company.status??"active"},membership:{role:membership.role}};
  });
  ctx.logger.info("Organizations plugin initialized: company memberships backfilled and indexed.");
 },
};
