import { randomBytes, randomUUID } from "node:crypto";
import { hasTenantPermission } from "../../core/tenant-context.js";
import { evaluateResourceAccess } from "../../core/resource-access.js";
import { unmaskResourceId } from "../../core/session-id.js";
import type { Folder, BeeDocument } from "./documents.service.js";

/** Documents endpoint operation handlers; route mounting stays in the controller. */
export function createDocumentsHandlers(deps:any) {
 const {db,secret,storage,repository,authenticate,folders,docs,ref,userRef,unref,ancestors,canAccess,present,sharePolicy,policies,ownedFolder,MAX_DEPTH,clean,validPublicId,normalizeTags}=deps;
 return {
  shareTargets: async(req:any,reply:any)=>{
   const tenant=await authenticate(req,reply);if(!tenant)return;
   if(!hasTenantPermission(tenant,"members.read"))return reply.code(403).send({error:"Organization member read permission required"},
  folderSharesGet: async(req:any,reply:any)=>{
   const tenant=await authenticate(req,reply);if(!tenant)return;
   let id:string;try{id=unref(req.params.folderId,"folder",tenant);},
  folderSharesPut: async(req:any,reply:any)=>{
   const tenant=await authenticate(req,reply);if(!tenant)return;
   let id:string;try{id=unref(req.params.folderId,"folder",tenant);},
  foldersGet: async(req:any,reply:any)=>{
   const tenant=await authenticate(req,reply);if(!tenant)return;
   const rows=await folders(tenant.tenantId).find({},
  foldersPost: async(req,reply)=>{
   const tenant=await authenticate(req,reply);if(!tenant)return;
   if(!hasTenantPermission(tenant,"documents.write"))return reply.code(403).send({error:"Documents write permission required"},
  documentLocation: async(req,reply)=>{
   const tenant=await authenticate(req,reply);if(!tenant)return;
   if(!hasTenantPermission(tenant,"documents.write"))return reply.code(403).send({error:"Documents write permission required"},
  folderLocation: async(req,reply)=>{
   const tenant=await authenticate(req,reply);if(!tenant)return;
   if(!hasTenantPermission(tenant,"documents.write"))return reply.code(403).send({error:"Documents write permission required"},
  documentsGet: async(req:any,reply:any)=>{
   const tenant=await authenticate(req,reply);if(!tenant)return;
   let folderId:string|null=null;const folderRef=clean(req.query?.folderId,2048);
   if(folderRef){try{folderId=unref(folderRef,"folder",tenant);}catch{return reply.code(404).send({error:"Folder not found"});}
    const parents=await ancestors(tenant.tenantId,folderId);if(!await canAccess(tenant,"folder",folderId,"read",parents.slice(1)))return reply.code(404).send({error:"Folder not found"});},
  documentsPost: async(req,reply)=>{
   const tenant=await authenticate(req,reply);if(!tenant)return;
   if(!hasTenantPermission(tenant,"documents.write"))return reply.code(403).send({error:"Documents write permission required"},
  publication: async(req,reply)=>{
   const tenant=await authenticate(req,reply);if(!tenant)return;
   if(!hasTenantPermission(tenant,"documents.write"))return reply.code(403).send({error:"Documents write permission required"},
  download: async(req,reply)=>{
   const tenant=await authenticate(req,reply);if(!tenant)return;
   let id:string;try{id=unref(req.params.documentId,"document",tenant);},
  publicDownload: async(req,reply)=>{
   const publicId=validPublicId(req.params.publicId);if(!publicId)return reply.code(404).send({error:"Document not found"},
 };
}
