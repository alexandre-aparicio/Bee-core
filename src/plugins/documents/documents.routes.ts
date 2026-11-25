/**
 * Documents API route contract.
 * Paths are module-owned and registered in the existing Fastify runtime.
 * Keep these stable during modularization; consumers should not duplicate them.
 */
export const documentsRoutes = Object.freeze({
  shareTargets: "/documents/share-targets",
  folderShares: "/documents/folders/:folderId/shares",
  folders: "/documents/folders",
  documentFolderLocation: "/documents/:documentId/location",
  folderLocation: "/documents/folders/:folderId/location",
  documents: "/documents",\n  upload: "/documents/files",
  publication: "/documents/:documentId/publication",
  download: "/documents/:documentId/download",
  publicDownload: "/public/documents/:publicId"
});
