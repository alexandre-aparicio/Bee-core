import type { BeePlugin } from "../../core/types.js";
import type { Db } from "mongodb";

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { FilesStorageAdapter } from "./files-storage.adapter.js";
import { registerDocumentsRoutes } from "./documents.controller.js";
import { createDocumentsServices, type Folder, type BeeDocument } from "./documents.service.js";

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
  const serviceDeps=createDocumentsServices({db,secret,storage,folderCollection,documentCollection});
  registerDocumentsRoutes(ctx,serviceDeps);
  ctx.logger.info("Documents plugin initialized: tenant folders, document metadata, ACLs and public delivery ready.");
 }
};
