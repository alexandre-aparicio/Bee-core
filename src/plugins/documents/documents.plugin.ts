import type { BeePlugin } from "../../core/types.js";
import type { Document, Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { TenantCollection } from "../../core/tenant-collection.js";
import { resolveTenantContext, hasTenantPermission, type TenantContext } from "../../core/tenant-context.js";
import { hasPluginEntitlement, isPluginInstalled } from "../../core/plugin-entitlements.js";
import { maskResourceId, unmaskResourceId } from "../../core/session-id.js";
import { evaluateResourceAccess } from "../../core/resource-access.js";
import { FilesStorageAdapter } from "./files-storage.adapter.js";
import { registerDocumentsRoutes } from "./documents.controller.js";

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
   documentCollection.createIndex({publicId:1},{unique:true,partialFilterExpression:{publicId:{$type:"string"}},name:"tenant_documents_public_id_unique"})
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
  const userRef=(id:string,tenant:TenantContext)=>maskResourceId(id,"user",{sessionId:tenant.sessionId,expiresAt:tenant.sessionExpiresAt},secret);
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
  const present=async(item:BeeDocument,tenant:TenantContext)=>{
   const [file,uploader]=await Promise.all([
    storage.getMetadata(tenant.tenantId,item.fileId),
    db.collection<{id:string;email:string}>("users").findOne({id:item.createdBy},{projection:{id:1,email:1}})
   ]);
   const parents=await ancestors(tenant.tenantId,item.folderId);
   const canMove=await canAccess(tenant,"document",item.id,"write",parents);
   return {
    id:ref(item.id,"document",tenant),title:item.title,description:item.description,tags:item.tags,
    folderId:item.folderId?ref(item.folderId,"folder",tenant):null,canMove,visibility:item.visibility,publishedAt:item.publishedAt,
    publicUrl:item.visibility==="public"&&item.publicId?"/api/public/documents/"+item.publicId:null,
    downloadUrl:"/api/documents/"+ref(item.id,"document",tenant)+"/download",
    originalName:file?.originalName??item.title,fileContentType:file?.contentType??"application/octet-stream",
    fileSize:file?.size??0,uploadedBy:{email:uploader?.email??"Unknown user"},
    uploadedAt:file?.createdAt??item.createdAt,createdAt:item.createdAt,updatedAt:item.updatedAt
   };
  };

  const sharePolicy=async(tenant:TenantContext,folderId:string)=>policies.findOne({tenantId:tenant.tenantId,pluginId:"documents",resourceType:"folder",resourceId:folderId});
  const policies=db.collection<any>("resource_access_policies");
  const ownedFolder=async(tenant:TenantContext,folderId:string)=>folders(tenant.tenantId).findOne({id:folderId,createdBy:tenant.userId});
  registerDocumentsRoutes(ctx,{db,secret,storage,folderCollection,documentCollection,authenticate,folders,docs,ref,userRef,unref,ancestors,canAccess,present,sharePolicy,policies,ownedFolder,MAX_DEPTH,clean,validPublicId});
  ctx.logger.info("Documents plugin initialized: tenant folders, document metadata, ACLs and public delivery ready.");
 }
};
