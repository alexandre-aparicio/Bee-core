import type { BeePlugin } from "../../core/types.js";
import type { Document, Db } from "mongodb";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { TenantCollection } from "../../core/tenant-collection.js";
import { resolveTenantContext, hasTenantPermission, type TenantContext } from "../../core/tenant-context.js";
import { hasPluginEntitlement, isPluginInstalled } from "../../core/plugin-entitlements.js";
import { maskResourceId, unmaskResourceId } from "../../core/session-id.js";
import { evaluateResourceAccess } from "../../core/resource-access.js";
import { FilesStorageAdapter } from "./files-storage.adapter.js";

type Folder = Document & { id:string; tenantId:string; name:string; parentId:string|null; createdBy:string; createdAt:Date; updatedAt:Date };
type BeeDocument = Document & { id:string; tenantId:string; fileId:string; folderId:string|null; title:string; description:string; tags:string[]; visibility:"private"|"public"; publicId:string|null; publishedAt:Date|null; createdBy:string; createdAt:Date; updatedAt:Date };
const MAX_DEPTH=32;
const clean=(value:unknown,max=160)=>typeof value==="string"?value.trim().replace(/[\u0000-\u001f\u007f]/g,"").slice(0,max):"";
const validPublicId=(value:unknown)=>typeof value==="string"&&/^[A-Za-z0-9_-]{40,100}$/.test(value)?value:"";

export const documentsPlugin:BeePlugin={
 manifest:{name:"documents",version:"0.1.0",description:"Tenant document library, folder ACLs and controlled public delivery",dependencies:["auth","organizations","files"]},
 async initialize(ctx){
  const db:Db=ctx.mongoClient.db(String(ctx.config.mongoDbName??"bee_core"));
  const secret=String(ctx.config.sessionIdSecret??"");
  if(secret.length<32)throw new Error("Documents requires the session resource ID secret.");
  const root=path.resolve(String(ctx.config.fileStoragePath??"/data/bee-files"));
  await mkdir(root,{recursive:true});
  const storage=new FilesStorageAdapter(db,root);
  const folderCollection=db.collection<Folder>("tenant_document_folders");
  const documentCollection=db.collection<BeeDocument>("tenant_documents");
  await Promise.all([
   folderCollection.createIndex({tenantId:1,id:1},{unique:true,name:"tenant_document_folders_tenant_id_unique"}),
   folderCollection.createIndex({tenantId:1,parentId:1,name:1},{name:"tenant_document_folders_parent_name"}),
   documentCollection.createIndex({tenantId:1,id:1},{unique:true,name:"tenant_documents_tenant_id_unique"}),
   documentCollection.createIndex({tenantId:1,folderId:1,updatedAt:-1},{name:"tenant_documents_folder_updated"}),
   documentCollection.createIndex({publicId:1},{unique:true,sparse:true,name:"tenant_documents_public_id_unique"})
  ]);
  const authenticate=async(req:any,reply:any):Promise<TenantContext|null>=>{
   try{
    await req.jwtVerify();
    const tenant=await resolveTenantContext(db,req.user,{},secret);
    if(!tenant||tenant.client!=="dashboard"){reply.code(401).send({error:"Dashboard session required"});return null;}
    if(!hasTenantPermission(tenant,"documents.read")){reply.code(403).send({error:"Documents read permission required"});return null;}
    if(!await hasPluginEntitlement(db,tenant.tenantId,"documents")||!await isPluginInstalled(db,tenant.tenantId,"documents")){reply.code(403).send({error:"Documents is not entitled or installed"});return null;}
    return tenant;
   }catch{reply.code(401).send({error:"Unauthorized"});return null;}
  };
  const folders=(tenantId:string)=>new TenantCollection<Folder>(folderCollection,tenantId);
  const docs=(tenantId:string)=>new TenantCollection<BeeDocument>(documentCollection,tenantId);
  const ref=(id:string,type:"folder"|"document",tenant:TenantContext)=>maskResourceId(id,type,{sessionId:tenant.sessionId,expiresAt:tenant.sessionExpiresAt},secret);
  const unref=(value:string,type:"folder"|"document",tenant:TenantContext)=>{
   const id=unmaskResourceId(value,type,{sessionId:tenant.sessionId,expiresAt:tenant.sessionExpiresAt},secret);
   if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error("Invalid resource reference");
   return id;
  };
  const ancestors=async(tenantId:string,folderId:string|null):Promise<Folder[]>=>{
   const result:Folder[]=[];const seen=new Set<string>();let current=folderId;
   while(current){if(seen.has(current)||result.length>=MAX_DEPTH)throw new Error("Invalid folder hierarchy");seen.add(current);const folder=await folders(tenantId).findOne({id:current});if(!folder)throw new Error("Folder not found");result.push(folder);current=folder.parentId;}
   return result;
  };
  const canAccess=async(tenant:TenantContext,type:"folder"|"document",id:string,permission:"read"|"write"|"delete",parents:Folder[])=>{
   const decision=await evaluateResourceAccess(db,{tenantId:tenant.tenantId,userId:tenant.userId,pluginId:"documents",resourceType:type,resourceId:id,permission,ancestorResources:parents.map(f=>({resourceType:"folder",resourceId:f.id}))});
   return decision!==false;
  };
  const present=(item:BeeDocument,tenant:TenantContext)=>({id:ref(item.id,"document",tenant),title:item.title,description:item.description,tags:item.tags,folderId:item.folderId?ref(item.folderId,"folder",tenant):null,visibility:item.visibility,publishedAt:item.publishedAt,publicUrl:item.visibility==="public"&&item.publicId?"/api/public/documents/"+item.publicId:null,createdAt:item.createdAt,updatedAt:item.updatedAt});

  ctx.server.get("/documents/folders",async(req:any,reply:any)=>{
   const tenant=await authenticate(req,reply);if(!tenant)return;
   const rows=await folders(tenant.tenantId).find({}).sort({name:1}).limit(500).toArray();const visible=[];
   for(const folder of rows){const parents=await ancestors(tenant.tenantId,folder.parentId);if(await canAccess(tenant,"folder",folder.id,"read",parents))visible.push({id:ref(folder.id,"folder",tenant),name:folder.name,parentId:folder.parentId?ref(folder.parentId,"folder",tenant):null,createdAt:folder.createdAt,updatedAt:folder.updatedAt});}
   return {folders:visible};
  });
  ctx.server.post<{Body:{name?:unknown;parentId?:unknown}}>("/documents/folders",async(req,reply)=>{
   const tenant=await authenticate(req,reply);if(!tenant)return;
   if(!hasTenantPermission(tenant,"documents.write"))return reply.code(403).send({error:"Documents write permission required"});
   const name=clean(req.body?.name,120);if(!name)return reply.code(400).send({error:"Folder name required"});
   let parentId:string|null=null;let parents:Folder[]=[];
   if(req.body?.parentId){try{parentId=unref(String(req.body.parentId),"folder",tenant);parents=await ancestors(tenant.tenantId,parentId);}catch{return reply.code(404).send({error:"Parent folder not found"});}
    if(!await canAccess(tenant,"folder",parentId,"write",parents.slice(1)))return reply.code(404).send({error:"Parent folder not found"});}
   const now=new Date();const row:Folder={id:randomUUID(),tenantId:tenant.tenantId,name,parentId,createdBy:tenant.userId,createdAt:now,updatedAt:now};
   await folders(tenant.tenantId).insertOne(row);
   return reply.code(201).send({folder:{id:ref(row.id,"folder",tenant),name,parentId:parentId?ref(parentId,"folder",tenant):null,createdAt:now}});
  });
  ctx.server.get("/documents",async(req:any,reply:any)=>{
   const tenant=await authenticate(req,reply);if(!tenant)return;
   let folderId:string|null=null;const folderRef=clean(req.query?.folderId,2048);
   if(folderRef){try{folderId=unref(folderRef,"folder",tenant);}catch{return reply.code(404).send({error:"Folder not found"});}
    const parents=await ancestors(tenant.tenantId,folderId);if(!await canAccess(tenant,"folder",folderId,"read",parents.slice(1)))return reply.code(404).send({error:"Folder not found"});}
   const rows=await docs(tenant.tenantId).find(folderId?{folderId}:{}).sort({updatedAt:-1}).limit(200).toArray();const visible=[];
   for(const item of rows){const parents=await ancestors(tenant.tenantId,item.folderId);if(await canAccess(tenant,"document",item.id,"read",parents))visible.push(present(item,tenant));}
   return {documents:visible};
  });
  ctx.server.post<{Body:{fileId?:unknown;folderId?:unknown;title?:unknown;description?:unknown;tags?:unknown}}>("/documents",async(req,reply)=>{
   const tenant=await authenticate(req,reply);if(!tenant)return;
   if(!hasTenantPermission(tenant,"documents.write"))return reply.code(403).send({error:"Documents write permission required"});
   let fileId:string;try{fileId=unmaskResourceId(String(req.body?.fileId??""),"file",{sessionId:tenant.sessionId,expiresAt:tenant.sessionExpiresAt},secret);}catch{return reply.code(400).send({error:"A valid uploaded Files reference is required"});}
   const file=await storage.getMetadata(tenant.tenantId,fileId);if(!file)return reply.code(404).send({error:"Stored file not found"});
   let folderId:string|null=null;let parents:Folder[]=[];
   if(req.body?.folderId){try{folderId=unref(String(req.body.folderId),"folder",tenant);parents=await ancestors(tenant.tenantId,folderId);}catch{return reply.code(404).send({error:"Folder not found"});}
    if(!await canAccess(tenant,"folder",folderId,"write",parents.slice(1)))return reply.code(404).send({error:"Folder not found"});}
   const now=new Date();const title=clean(req.body?.title,180)||file.originalName;
   const tags=Array.isArray(req.body?.tags)?[...new Set(req.body.tags.map((v:unknown)=>clean(v,40)).filter(Boolean))].slice(0,20):[];
   const item:BeeDocument={id:randomUUID(),tenantId:tenant.tenantId,fileId,folderId,title,description:clean(req.body?.description,2000),tags,visibility:"private",publicId:null,publishedAt:null,createdBy:tenant.userId,createdAt:now,updatedAt:now};
   await docs(tenant.tenantId).insertOne(item);return reply.code(201).send({document:present(item,tenant)});
  });
  ctx.server.put<{Params:{documentId:string};Body:{published?:unknown}}>("/documents/:documentId/publication",async(req,reply)=>{
   const tenant=await authenticate(req,reply);if(!tenant)return;
   if(!hasTenantPermission(tenant,"documents.write"))return reply.code(403).send({error:"Documents write permission required"});
   let id:string;try{id=unref(req.params.documentId,"document",tenant);}catch{return reply.code(404).send({error:"Document not found"});}
   const item=await docs(tenant.tenantId).findOne({id});if(!item)return reply.code(404).send({error:"Document not found"});
   const parents=await ancestors(tenant.tenantId,item.folderId);if(!await canAccess(tenant,"document",id,"write",parents))return reply.code(404).send({error:"Document not found"});
   if(typeof req.body?.published!=="boolean")return reply.code(400).send({error:"published must be boolean"});
   const published=req.body.published;const publicId=published?(item.visibility==="public"?item.publicId:randomBytes(32).toString("base64url")):null;const now=new Date();
   await docs(tenant.tenantId).updateOne({id},{$set:{visibility:published?"public":"private",publicId,publishedAt:published?(item.publishedAt??now):null,updatedAt:now}});
   const updated=await docs(tenant.tenantId).findOne({id});return {document:updated?present(updated,tenant):null};
  });
  ctx.server.get<{Params:{publicId:string}}>("/public/documents/:publicId",async(req,reply)=>{
   const publicId=validPublicId(req.params.publicId);if(!publicId)return reply.code(404).send({error:"Document not found"});
   const item=await documentCollection.findOne({publicId,visibility:"public",publishedAt:{$ne:null}});if(!item)return reply.code(404).send({error:"Document not found"});
   const file=await storage.getMetadata(item.tenantId,item.fileId);if(!file)return reply.code(404).send({error:"Document content not found"});
   let data:Buffer;try{data=await storage.read(item.tenantId,file);}catch{return reply.code(404).send({error:"Document content not found"});}
   reply.header("content-type",file.contentType);reply.header("content-length",String(data.length));
   reply.header("content-disposition","attachment; filename=\""+file.originalName.replace(/["\\\\\\r\\n]/g,"_")+"\"");
   reply.header("cache-control","private, no-store");reply.header("x-content-type-options","nosniff");return reply.send(data);
  });
  ctx.logger.info("Documents plugin initialized: tenant folders, document metadata, ACLs and public delivery ready.");
 }
};
