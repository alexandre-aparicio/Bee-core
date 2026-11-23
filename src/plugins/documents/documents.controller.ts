import { documentsRoutes } from "./documents.routes.js";
import { createDocumentsHandlers } from "./documents.handlers.js";

/** Thin module controller: mounts the endpoint handlers on the shared API runtime. */
export function registerDocumentsRoutes(ctx:any,deps:any):void {
 const handlers=createDocumentsHandlers(deps);
 ctx.server.get(documentsRoutes.shareTargets,handlers.shareTargets);
 ctx.server.get<{Params:{folderId:string}}>(documentsRoutes.folderShares,handlers.folderSharesGet);
 ctx.server.put<{Params:{folderId:string};Body:{teamIds?:unknown;userIds?:unknown}}>(documentsRoutes.folderShares,handlers.folderSharesPut);
 ctx.server.get(documentsRoutes.folders,handlers.foldersGet);
 ctx.server.post<{Body:{name?:unknown;parentId?:unknown}}>(documentsRoutes.folders,handlers.foldersPost);
 ctx.server.patch<{Params:{documentId:string};Body:{folderId?:unknown}}>(documentsRoutes.documentFolderLocation,handlers.documentLocation);
 ctx.server.patch<{Params:{folderId:string};Body:{parentId?:unknown}}>(documentsRoutes.folderLocation,handlers.folderLocation);
 ctx.server.get(documentsRoutes.documents,handlers.documentsGet);
 ctx.server.post<{Body:{fileId?:unknown;folderId?:unknown;title?:unknown;description?:unknown;tags?:unknown}}>(documentsRoutes.documents,handlers.documentsPost);
 ctx.server.put<{Params:{documentId:string};Body:{published?:unknown}}>(documentsRoutes.publication,handlers.publication);
 ctx.server.get<{Params:{documentId:string}}>(documentsRoutes.download,handlers.download);
 ctx.server.get<{Params:{publicId:string}}>(documentsRoutes.publicDownload,handlers.publicDownload);
}
