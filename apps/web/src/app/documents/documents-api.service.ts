import { Injectable } from "@angular/core";

/**
 * Documents transport boundary: centralizes the module API base and request
 * dispatch while leaving document/folder endpoint semantics in the module.
 */
@Injectable()
export class DocumentsApiService {
  readonly apiBase = "/api";

  readonly routes = Object.freeze({
    folders: "/documents/folders",
    documents: "/documents",
    shareTargets: "/documents/share-targets",
    filesUpload: "/files"
  });

  foldersUrl(): string { return this.apiBase + this.routes.folders; }
  documentsUrl(folderId: string | null): string {
    return this.apiBase + this.routes.documents + (folderId ? "?folderId=" + encodeURIComponent(folderId) : "");
  }
  documentLocationUrl(id: string): string { return this.apiBase + this.routes.documents + "/" + encodeURIComponent(id) + "/location"; }
  folderLocationUrl(id: string): string { return this.foldersUrl() + "/" + encodeURIComponent(id) + "/location"; }
  folderSharesUrl(id: string): string { return this.foldersUrl() + "/" + encodeURIComponent(id) + "/shares"; }
  shareTargetsUrl(query: string): string { return this.apiBase + this.routes.shareTargets + "?q=" + encodeURIComponent(query); }
  uploadFileUrl(): string { return this.apiBase + this.routes.filesUpload; }

  request(url: string, init: RequestInit = {}): Promise<Response> {
    return fetch(url, {
      credentials: init.credentials ?? "same-origin",
      ...init
    });
  }
}
