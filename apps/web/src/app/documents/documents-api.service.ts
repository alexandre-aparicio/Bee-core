import { Injectable } from "@angular/core";

export type DocumentsFolder={id:string;name:string;parentId:string|null;canManageShares?:boolean;canMove?:boolean;documentCount?:number};
export type DocumentsShareTeam={id:string;name:string};
export type DocumentsShareUser={id:string;email:string};
export type DocumentsItem={id:string;title:string;description:string;tags:string[];visibility:"private"|"public";downloadUrl:string;publicUrl:string|null;folderId:string|null;canMove?:boolean;originalName:string;fileContentType:string;fileSize:number;uploadedBy:{email:string};uploadedAt:string;createdAt:string;updatedAt:string};


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
