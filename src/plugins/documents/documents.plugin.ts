import type { BeePlugin } from "../../core/types.js";
import type { Db } from "mongodb";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { DocumentsStorageAdapter } from "./documents-storage.adapter.js";
import { registerDocumentsRoutes } from "./documents.controller.js";
import { createDocumentsServices } from "./documents.service.js";
import { DocumentsRepository } from "./documents.repository.js";

export const documentsPlugin:BeePlugin={
 manifest:{name:"documents",version:"0.1.0",description:"Tenant document library, folder ACLs and controlled public delivery",dependencies:["auth","organizations"],scope:"tenant",activationPolicy:"automatic",frontend:{routes:[{path:"/dashboard/documents",component:"documents"}]}},
 async initialize(ctx){
  const db:Db=ctx.mongoClient.db(String(ctx.config.mongoDbName??"bee_core"));
  const secret=String(ctx.config.sessionIdSecret??ctx.config.jwtSecret??"");
  if(secret.length<32)throw new Error("Documents requires a session resource ID secret.");
  const root=path.resolve(String(ctx.config.documentsStoragePath??"/data/bee-documents"));
  await mkdir(root,{recursive:true,mode:0o700});
  if(!ctx.server.hasContentTypeParser("application/octet-stream"))ctx.server.addContentTypeParser("application/octet-stream",{parseAs:"buffer",bodyLimit:10*1024*1024},(_request:any,body:any,done:any)=>done(null,body));
  const storage=new DocumentsStorageAdapter(db,root);
  await storage.initialize();
  const repository=new DocumentsRepository(db);
  await repository.initializeIndexes();
  const serviceDeps=createDocumentsServices({db,secret,storage,repository});
  registerDocumentsRoutes(ctx,{...serviceDeps,repository});
  ctx.logger.info("Documents plugin initialized: independent tenant storage, folders, ACLs and public delivery ready.");
 }
};
