import { documentsRoutes } from "./documents.routes.js";
import { createDocumentsHandlers } from "./documents.handlers.js";

/** Thin module controller: mounts the endpoint handlers on the shared API runtime. */
export function registerDocumentsRoutes(ctx:any,deps:any):void {
 const handlers=createDocumentsHandlers(deps);\n ctx.server.post(documentsRoutes.upload,handlers.uploadFile);
 ctx.server.get(documentsRoutes.shareTargets,handlers.shareTargets);
 ctx.server.get(documentsRoutes.folderShares,handlers.folderSharesGet);
 ctx.server.put(documentsRoutes.folderShares,handlers.folderSharesPut);
 ctx.server.get(documentsRoutes.folders,handlers.foldersGet);
 ctx.server.post(documentsRoutes.folders,handlers.foldersPost);
 ctx.server.patch(documentsRoutes.documentFolderLocation,handlers.documentLocation);
 ctx.server.patch(documentsRoutes.folderLocation,handlers.folderLocation);
 ctx.server.get(documentsRoutes.documents,handlers.documentsGet);
 ctx.server.post(documentsRoutes.documents,handlers.documentsPost);
 ctx.server.put(documentsRoutes.publication,handlers.publication);
 ctx.server.get(documentsRoutes.download,handlers.download);
 ctx.server.get(documentsRoutes.publicDownload,handlers.publicDownload);
}
