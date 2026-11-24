import type { BeePlugin } from "../../core/types.js";
import type { Db } from "mongodb";

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { FilesStorageAdapter } from "./files-storage.adapter.js";
import { registerDocumentsRoutes } from "./documents.controller.js";
import { createDocumentsServices, type Folder, type BeeDocument } from "./documents.service.js";
import { DocumentsRepository } from "./documents.repository.js";

export const documentsPlugin:BeePlugin={
 manifest:{name:"documents",version:"0.1.0",description:"Tenant document library, folder ACLs and controlled public delivery",dependencies:["auth","organizations","files"],scope:"tenant",activationPolicy:"automatic",frontend:{routes:[{path:"/dashboard/documents",component:"documents"}]}},
 async initialize(ctx){
  const db:Db=ctx.mongoClient.db(String(ctx.config.mongoDbName??"bee_core"));
  const secret=String(ctx.config.sessionIdSecret??"");
  if(secret.length<32)throw new Error("Documents requires the session resource ID secret.");
  const root=path.resolve(String(ctx.config.fileStoragePath??"/data/bee-files"));
  await mkdir(root,{recursive:true});
  const storage=new FilesStorageAdapter(db,root);
  const repository=new DocumentsRepository(db);
  await repository.initializeIndexes();
  const serviceDeps=createDocumentsServices({db,secret,storage,repository});
  registerDocumentsRoutes(ctx,{...serviceDeps,repository});
  ctx.logger.info("Documents plugin initialized: tenant folders, document metadata, ACLs and public delivery ready.");
 }
};
