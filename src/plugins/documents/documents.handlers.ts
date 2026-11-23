import { randomBytes, randomUUID } from "node:crypto";
import { hasTenantPermission } from "../../core/tenant-context.js";
import { evaluateResourceAccess } from "../../core/resource-access.js";
import { unmaskResourceId } from "../../core/session-id.js";
import type { Folder, BeeDocument } from "./documents.service.js";

/** Documents endpoint operation handlers. They receive Core and repository services
 * through dependency injection; route mounting is kept in the controller. */
export function createDocumentsHandlers(deps:any) {
 const {db,secret,storage,repository,authenticate,folders,docs,ref,userRef,unref,ancestors,canAccess,present,sharePolicy,policies,ownedFolder,MAX_DEPTH,clean,validPublicId,normalizeTags}=deps;
 return {
  shareTargets: async(req:any,reply:any)=>{
   const tenant=await authenticate(req,reply);if(!tenant)return;
   if(!hasTenantPermission(tenant,"members.read"))return reply.code(403).send({error:"Organization member read permission required"});
   const query=clean(req.query?.q,100).toLowerCase();
   const [teamRows,memberships]=await Promise.all([
    repository.companyTeams.find({tenantId:tenant.tenantId,status:"active"}).sort({name:1}).toArray(),
    repository.memberships.find({tenantId:tenant.tenantId,status:"active"}).toArray()
   ]);
   const assignments=await repository.teamAppAssignments.find({tenantId:tenant.tenantId,pluginId:"documents",enabled:true}).toArray();
   const enabled=new Set(assignments.map((item:any)=>item.teamId));
   const teams=teamRows.filter((team:any)=>enabled.has(team.id)&&(!query||team.name.toLowerCase().includes(query))).map((team:any)=>({id:team.id,name:team.name}));
   const userIds=[...new Set(memberships.map((item:any)=>item.userId).filter(id=>id!==tenant.userId))];
   const allUsers:any[]=userIds.length?await repository.users.find({id:{$in:userIds},enabled:true},{projection:{id:1,email:1}}).sort({email:1}).limit(500).toArray():[];
   const users=allUsers.filter((user:any)=>!query||user.email.toLowerCase().includes(query)).slice(0,50);
   return {teams,users:users.map(user=>({id:userRef(user.id,tenant),email:user.email}))};
  },
  folderSharesGet: async(req:any,reply:any)=>{
   const tenant=await authenticate(req,reply);if(!tenant)return;
   let id:string;try{id=unref(req.params.folderId,"folder",tenant);}catch{return reply.code(404).send({error:"Folder not found"});}
   const folder=await ownedFolder(tenant,id);if(!folder)return reply.code(404).send({error:"Folder not found"});
   const policy=await sharePolicy(tenant,id);
   const teamIds=(policy?.teamGrants??[]).filter((grant:any)=>grant.permissions.includes("read")).map((grant:any)=>grant.teamId);
   const userIds=(policy?.userOverrides??[]).filter((item:any)=>item.effect==="allow"&&item.permissions.includes("read")&&item.userId!==tenant.userId).map((item:any)=>item.userId);
   const [teamRows,userRows]:[any[],any[]]=await Promise.all([
    teamIds.length?repository.companyTeams.find({tenantId:tenant.tenantId,id:{$in:teamIds}}).toArray():[],
    userIds.length?repository.users.find({id:{$in:userIds}},{projection:{id:1,email:1}}).toArray():[]
   ]);
   return {teams:teamRows.map((team:any)=>({id:team.id,name:team.name})),users:userRows.map((user:any)=>({id:userRef(user.id,tenant),email:user.email}))};
  },
  folderSharesPut: async(req:any,reply:any)=>{
   const tenant=await authenticate(req,reply);if(!tenant)return;
   let id:string;try{id=unref(req.params.folderId,"folder",tenant);}catch{return reply.code(404).send({error:"Folder not found"});}
   const folder=await ownedFolder(tenant,id);if(!folder)return reply.code(404).send({error:"Folder not found"});
   const rawTeamIds:unknown[]=Array.isArray(req.body?.teamIds)?req.body.teamIds:[];
   const rawUserRefs:unknown[]=Array.isArray(req.body?.userIds)?req.body.userIds:[];
   const teamIds:string[]=[...new Set(rawTeamIds.map((value:unknown)=>clean(value,80)).filter((value:string)=>value.length>0))];
   const userRefs:string[]=[...new Set(rawUserRefs.map((value:unknown)=>String(value??"").trim()).filter((value:string)=>value.length>0))];
   let userIds:string[];try{userIds=userRefs.map(value=>unmaskResourceId(value,"user",{sessionId:tenant.sessionId,expiresAt:tenant.sessionExpiresAt},secret));}catch{return reply.code(400).send({error:"Invalid organization member reference"});}
   const [validTeams,validUsers]=await Promise.all([
    teamIds.length?repository.companyTeams.countDocuments({tenantId:tenant.tenantId,id:{$in:teamIds},status:"active"}):0,
    userIds.length?repository.memberships.countDocuments({tenantId:tenant.tenantId,status:"active",userId:{$in:userIds}}):0
   ]);
   if(validTeams!==teamIds.length)return reply.code(400).send({error:"All selected teams must be active in this organization"});
   if(validUsers!==userIds.length)return reply.code(400).send({error:"All selected users must be active members of this organization"});
   const assigned=teamIds.length?await repository.teamAppAssignments.find({tenantId:tenant.tenantId,pluginId:"documents",enabled:true,teamId:{$in:teamIds}}).toArray():[];
   if(new Set(assigned.map(item=>item.teamId)).size!==teamIds.length)return reply.code(400).send({error:"Every shared team must have Documents enabled"});
   const key={tenantId:tenant.tenantId,pluginId:"documents",resourceType:"folder",resourceId:id};
   const existing=await policies.findOne(key);
   const retainedDenials=(existing?.userOverrides??[]).filter((item:any)=>item.effect==="deny"&&item.userId!==tenant.userId);
   const userOverrides=[{userId:tenant.userId,effect:"allow",permissions:["read","write","delete"]},...retainedDenials,...userIds.filter(userId=>userId!==tenant.userId).map(userId=>({userId,effect:"allow",permissions:["read"]}))];
   const policy={...key,teamGrants:teamIds.map(teamId=>({teamId,permissions:["read"]})),userOverrides,updatedAt:new Date(),updatedBy:tenant.userId};
   await policies.updateOne(key,{$set:policy},{upsert:true});
   return {success:true,teamIds,userIds:userRefs};
  },
  foldersGet: async(req:any,reply:any)=>{
   const tenant=await authenticate(req,reply);if(!tenant)return;
   const rows=await folders(tenant.tenantId).find({}).sort({name:1}).limit(500).toArray();
   const visible:any[]=[];const countByFolder=new Map<string,number>();
   const [documentRows,userRows,folderPolicies]=await Promise.all([
    docs(tenant.tenantId).find({folderId:{$ne:null}}).toArray(),
    repository.users.find({id:{$in:[...new Set(rows.map(folder=>folder.createdBy))]}},{projection:{id:1,email:1}}).toArray(),
    repository.resourcePolicies.find({tenantId:tenant.tenantId,pluginId:"documents",resourceType:"folder"}).toArray()
   ]);
   const usersById=new Map(userRows.map((user:any)=>[user.id,user]));
   const folderOwnerById=new Map(rows.map((folder:any)=>[folder.id,folder.createdBy]));
   const sharedPolicies=folderPolicies.filter((policy:any)=>(policy.teamGrants??[]).some(grant=>grant.permissions?.includes("read"))||(policy.userOverrides??[]).some(grant=>grant.effect==="allow"&&grant.userId!==folderOwnerById.get(policy.resourceId)&&grant.permissions?.includes("read")));
   const sharedFolderIds=new Set(sharedPolicies.map((policy:any)=>policy.resourceId));
   for(const item of documentRows as any[]){
    const parents=await ancestors(tenant.tenantId,item.folderId);
    if(!await canAccess(tenant,"document",item.id,"read",parents))continue;
    for(const parent of parents as Folder[])countByFolder.set(parent.id,(countByFolder.get(parent.id)??0)+1);
   }
   for(const folder of rows as any[]){
    const parents=await ancestors(tenant.tenantId,folder.parentId);
    if(await canAccess(tenant,"folder",folder.id,"read",parents)){
     visible.push({id:ref(folder.id,"folder",tenant),name:folder.name,parentId:folder.parentId?ref(folder.parentId,"folder",tenant):null,
      canManageShares:folder.createdBy===tenant.userId,canMove:await canAccess(tenant,"folder",folder.id,"write",parents),
      documentCount:countByFolder.get(folder.id)??0,uploadedBy:{email:usersById.get(folder.createdBy)?.email??"Unknown user"},
      createdAt:folder.createdAt,updatedAt:folder.updatedAt,
      access:([folder.id,...parents.map(parent=>parent.id)].some(id=>sharedFolderIds.has(id))?"shared":"private")});
    }
   }
   return {folders:visible};
  },
  foldersPost: async(req,reply)=>{
   const tenant=await authenticate(req,reply);if(!tenant)return;
   if(!hasTenantPermission(tenant,"documents.write"))return reply.code(403).send({error:"Documents write permission required"});
   const name=clean(req.body?.name,120);if(!name)return reply.code(400).send({error:"Folder name required"});
   let parentId:string|null=null;let parents:Folder[]=[];
   if(req.body?.parentId){try{parentId=unref(String(req.body.parentId),"folder",tenant);parents=await ancestors(tenant.tenantId,parentId);}catch{return reply.code(404).send({error:"Parent folder not found"});}
    if(!await canAccess(tenant,"folder",parentId,"write",parents.slice(1)))return reply.code(404).send({error:"Parent folder not found"});}
   const now=new Date();const row:Folder={id:randomUUID(),tenantId:tenant.tenantId,name,parentId,createdBy:tenant.userId,createdAt:now,updatedAt:now};
   await folders(tenant.tenantId).insertOne(row);
   const creator=await repository.users.findOne({id:tenant.userId},{projection:{id:1,email:1}});
   return reply.code(201).send({folder:{id:ref(row.id,"folder",tenant),name,parentId:parentId?ref(parentId,"folder",tenant):null,
    uploadedBy:{email:creator?.email??"Unknown user"},createdAt:now,updatedAt:now,access:"private",documentCount:0}});
  },
  documentLocation: async(req,reply)=>{
   const tenant=await authenticate(req,reply);if(!tenant)return;
   if(!hasTenantPermission(tenant,"documents.write"))return reply.code(403).send({error:"Documents write permission required"});
   let id:string;try{id=unref(req.params.documentId,"document",tenant);}catch{return reply.code(404).send({error:"Document not found"});}
   const item=await docs(tenant.tenantId).findOne({id});if(!item)return reply.code(404).send({error:"Document not found"});
   const currentParents=await ancestors(tenant.tenantId,item.folderId);
   if(!await canAccess(tenant,"document",id,"write",currentParents))return reply.code(404).send({error:"Document not found"});
   if(!Object.prototype.hasOwnProperty.call(req.body??{},"folderId"))return reply.code(400).send({error:"folderId is required"});
   let folderId:string|null=null;let targetParents:Folder[]=[];
   if(req.body.folderId!==null){
    try{folderId=unref(String(req.body.folderId),"folder",tenant);targetParents=await ancestors(tenant.tenantId,folderId);}
    catch{return reply.code(404).send({error:"Destination folder not found"});}
    if(!await canAccess(tenant,"folder",folderId,"write",targetParents.slice(1)))return reply.code(404).send({error:"Destination folder not found"});
   }
   if(folderId===item.folderId)return {success:true,unchanged:true};
   const now=new Date();await docs(tenant.tenantId).updateOne({id},{$set:{folderId,updatedAt:now}});
   const updated=await docs(tenant.tenantId).findOne({id});
   return {success:true,document:updated?await present(updated,tenant):null};
  },
  folderLocation: async(req,reply)=>{
   const tenant=await authenticate(req,reply);if(!tenant)return;
   if(!hasTenantPermission(tenant,"documents.write"))return reply.code(403).send({error:"Documents write permission required"});
   let id:string;try{id=unref(req.params.folderId,"folder",tenant);}catch{return reply.code(404).send({error:"Folder not found"});}
   const folder=await folders(tenant.tenantId).findOne({id});if(!folder)return reply.code(404).send({error:"Folder not found"});
   const currentParents=await ancestors(tenant.tenantId,folder.parentId);
   if(!await canAccess(tenant,"folder",id,"write",currentParents))return reply.code(404).send({error:"Folder not found"});
   if(!Object.prototype.hasOwnProperty.call(req.body??{},"parentId"))return reply.code(400).send({error:"parentId is required"});
   let parentId:string|null=null;let targetParents:Folder[]=[];
   if(req.body.parentId!==null){
    try{parentId=unref(String(req.body.parentId),"folder",tenant);targetParents=await ancestors(tenant.tenantId,parentId);}
    catch{return reply.code(404).send({error:"Destination folder not found"});}
    if(targetParents.some(parent=>parent.id===id))return reply.code(400).send({error:"A folder cannot be moved into itself or one of its descendants"});
    const allFolders:any[]=await folders(tenant.tenantId).find({}).toArray();
    const childrenByParent=new Map<string,string[]>();
    for(const child of allFolders){if(child.parentId){const siblings=childrenByParent.get(child.parentId)??[];siblings.push(child.id);childrenByParent.set(child.parentId,siblings);}}
    const queue:Array<{folderId:string;depth:number}>=[{folderId:id,depth:0}];const visited=new Set<string>();let maxDescendantDepth=0;
    while(queue.length){
     const current=queue.shift()!;if(visited.has(current.folderId))return reply.code(400).send({error:"Invalid folder hierarchy"});
     visited.add(current.folderId);maxDescendantDepth=Math.max(maxDescendantDepth,current.depth);
     for(const childId of childrenByParent.get(current.folderId)??[])queue.push({folderId:childId,depth:current.depth+1});
    }
    if(targetParents.length+1+maxDescendantDepth>MAX_DEPTH)return reply.code(400).send({error:"Maximum folder depth exceeded"});
    if(!await canAccess(tenant,"folder",parentId,"write",targetParents.slice(1)))return reply.code(404).send({error:"Destination folder not found"});
   }
   if(parentId===id)return reply.code(400).send({error:"A folder cannot be its own parent"});
   if(parentId===folder.parentId)return {success:true,unchanged:true};
   await folders(tenant.tenantId).updateOne({id},{$set:{parentId,updatedAt:new Date()}});
   return {success:true};
  },
  documentsGet: async(req:any,reply:any)=>{
   const tenant=await authenticate(req,reply);if(!tenant)return;
   let folderId:string|null=null;const folderRef=clean(req.query?.folderId,2048);
   if(folderRef){try{folderId=unref(folderRef,"folder",tenant);}catch{return reply.code(404).send({error:"Folder not found"});}
    const parents=await ancestors(tenant.tenantId,folderId);if(!await canAccess(tenant,"folder",folderId,"read",parents.slice(1)))return reply.code(404).send({error:"Folder not found"});}
   const rows=await docs(tenant.tenantId).find({folderId}).sort({updatedAt:-1}).limit(200).toArray();const visible=[];
   for(const item of rows){const parents=await ancestors(tenant.tenantId,item.folderId);if(await canAccess(tenant,"document",item.id,"read",parents))visible.push(await present(item,tenant));}
   return {documents:visible};
  },
  documentsPost: async(req,reply)=>{
   const tenant=await authenticate(req,reply);if(!tenant)return;
   if(!hasTenantPermission(tenant,"documents.write"))return reply.code(403).send({error:"Documents write permission required"});
   let fileId:string;try{fileId=unmaskResourceId(String(req.body?.fileId??""),"file",{sessionId:tenant.sessionId,expiresAt:tenant.sessionExpiresAt},secret);}catch{return reply.code(400).send({error:"A valid uploaded Files reference is required"});}
   const file=await storage.getMetadata(tenant.tenantId,fileId);if(!file)return reply.code(404).send({error:"Stored file not found"});
   const fileDecision=await evaluateResourceAccess(db,{tenantId:tenant.tenantId,userId:tenant.userId,pluginId:"files",resourceType:"file",resourceId:fileId,permission:"read"});
   if(fileDecision===false)return reply.code(404).send({error:"Stored file not found"});
   let folderId:string|null=null;let parents:Folder[]=[];
   if(req.body?.folderId){try{folderId=unref(String(req.body.folderId),"folder",tenant);parents=await ancestors(tenant.tenantId,folderId);}catch{return reply.code(404).send({error:"Folder not found"});}
    if(!await canAccess(tenant,"folder",folderId,"write",parents.slice(1)))return reply.code(404).send({error:"Folder not found"});}
   const now=new Date();const title=clean(req.body?.title,180)||file.originalName;
   const tags=normalizeTags(req.body?.tags);
   const item:BeeDocument={id:randomUUID(),tenantId:tenant.tenantId,fileId,folderId,title,description:clean(req.body?.description,2000),tags,visibility:"private",publicId:null,publishedAt:null,createdBy:tenant.userId,createdAt:now,updatedAt:now};
   await docs(tenant.tenantId).insertOne(item);return reply.code(201).send({document:await present(item,tenant)});
  },
  publication: async(req,reply)=>{
   const tenant=await authenticate(req,reply);if(!tenant)return;
   if(!hasTenantPermission(tenant,"documents.write"))return reply.code(403).send({error:"Documents write permission required"});
   let id:string;try{id=unref(req.params.documentId,"document",tenant);}catch{return reply.code(404).send({error:"Document not found"});}
   const item=await docs(tenant.tenantId).findOne({id});if(!item)return reply.code(404).send({error:"Document not found"});
   const parents=await ancestors(tenant.tenantId,item.folderId);if(!await canAccess(tenant,"document",id,"write",parents))return reply.code(404).send({error:"Document not found"});
   if(typeof req.body?.published!=="boolean")return reply.code(400).send({error:"published must be boolean"});
   const published=req.body.published;const publicId=published?(item.visibility==="public"?item.publicId:randomBytes(32).toString("base64url")):null;const now=new Date();
   await docs(tenant.tenantId).updateOne({id},{$set:{visibility:published?"public":"private",publicId,publishedAt:published?(item.publishedAt??now):null,updatedAt:now}});
   const updated=await docs(tenant.tenantId).findOne({id});return {document:updated?await present(updated,tenant):null};
  },
  download: async(req,reply)=>{
   const tenant=await authenticate(req,reply);if(!tenant)return;
   let id:string;try{id=unref(req.params.documentId,"document",tenant);}catch{return reply.code(404).send({error:"Document not found"});}
   const item=await docs(tenant.tenantId).findOne({id});if(!item)return reply.code(404).send({error:"Document not found"});
   const parents=await ancestors(tenant.tenantId,item.folderId);
   if(!await canAccess(tenant,"document",id,"read",parents))return reply.code(404).send({error:"Document not found"});
   const file=await storage.getMetadata(tenant.tenantId,item.fileId);if(!file)return reply.code(404).send({error:"Document content not found"});
   const fileDecision=await evaluateResourceAccess(db,{tenantId:tenant.tenantId,userId:tenant.userId,pluginId:"files",resourceType:"file",resourceId:item.fileId,permission:"read"});
   if(fileDecision===false)return reply.code(404).send({error:"Document content not found"});
   let data:Buffer;try{data=await storage.read(tenant.tenantId,file);}catch{return reply.code(404).send({error:"Document content not found"});}
   reply.header("content-type",file.contentType);reply.header("content-length",String(data.length));
   reply.header("content-disposition","attachment; filename=\""+file.originalName.replace(/["\\\\\\r\\n]/g,"_")+"\"");
   reply.header("cache-control","private, no-store");reply.header("x-content-type-options","nosniff");return reply.send(data);
  },
  publicDownload: async(req,reply)=>{
   const publicId=validPublicId(req.params.publicId);if(!publicId)return reply.code(404).send({error:"Document not found"});
   const item=await repository.documentCollection.findOne({publicId,visibility:"public",publishedAt:{$ne:null}});if(!item)return reply.code(404).send({error:"Document not found"});
   const file=await storage.getMetadata(item.tenantId,item.fileId);if(!file)return reply.code(404).send({error:"Document content not found"});
   let data:Buffer;try{data=await storage.read(item.tenantId,file);}catch{return reply.code(404).send({error:"Document content not found"});}
   reply.header("content-type",file.contentType);reply.header("content-length",String(data.length));
   reply.header("content-disposition","attachment; filename=\""+file.originalName.replace(/["\\\\\\r\\n]/g,"_")+"\"");
   reply.header("cache-control","private, no-store");reply.header("x-content-type-options","nosniff");return reply.send(data);
  },
 };
}
