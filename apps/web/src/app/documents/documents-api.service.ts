import { Injectable } from "@angular/core";

export type DocumentsFolder={id:string;name:string;parentId:string|null;canManageShares?:boolean;canMove?:boolean;documentCount?:number;uploadedBy?:{email:string};createdAt?:string;updatedAt?:string;access?:"private"|"shared"};
export type DocumentsShareTeam={id:string;name:string};
export type DocumentsShareUser={id:string;email:string};
export type DocumentsItem={id:string;title:string;description:string;tags:string[];visibility:"private"|"public";downloadUrl:string;publicUrl:string|null;folderId:string|null;canMove?:boolean;originalName:string;fileContentType:string;fileSize:number;uploadedBy:{email:string};uploadedAt:string;createdAt:string;updatedAt:string};
export type DocumentsWorkspace={folders:DocumentsFolder[];documents:DocumentsItem[]};
export type DocumentsFolderShares={teams:DocumentsShareTeam[];users:DocumentsShareUser[]};
export type DocumentsShareTargets={teams:DocumentsShareTeam[];users:DocumentsShareUser[]};
export type DocumentsUploadResult={file:{id:string}};
export type DocumentsCreateResult={document:DocumentsItem};
export type DocumentsCreateFolderResult={folder:DocumentsFolder};

@Injectable()
export class DocumentsApiService {
  readonly apiBase="/api";
  readonly routes=Object.freeze({folders:"/documents/folders",documents:"/documents",shareTargets:"/documents/share-targets",filesUpload:"/files"});
  foldersUrl():string{return this.apiBase+this.routes.folders;}
  documentsUrl(folderId:string|null):string{return this.apiBase+this.routes.documents+(folderId?"?folderId="+encodeURIComponent(folderId):"");}
  documentLocationUrl(id:string):string{return this.apiBase+this.routes.documents+"/"+encodeURIComponent(id)+"/location";}
  folderLocationUrl(id:string):string{return this.foldersUrl()+"/"+encodeURIComponent(id)+"/location";}
  folderSharesUrl(id:string):string{return this.foldersUrl()+"/"+encodeURIComponent(id)+"/shares";}
  shareTargetsUrl(query:string):string{return this.apiBase+this.routes.shareTargets+"?q="+encodeURIComponent(query);}
  uploadFileUrl():string{return this.apiBase+this.routes.filesUpload;}

  private async jsonRequest<T>(url:string,token:string,init:RequestInit={}):Promise<T>{
    const headers=new Headers(init.headers);
    headers.set("authorization","Bearer "+token);
    if(init.body&&!headers.has("content-type"))headers.set("content-type","application/json");
    const response=await fetch(url,{credentials:"same-origin",...init,headers});
    let data:any={};
    try{data=await response.json();}catch{}
    if(!response.ok)throw new Error(data?.error||"Documents request failed");
    return data as T;
  }
  private async binaryRequest(url:string,token:string,init:RequestInit):Promise<Response>{
    const headers=new Headers(init.headers);headers.set("authorization","Bearer "+token);
    const response=await fetch(url,{credentials:"same-origin",...init,headers});
    if(!response.ok){let message="Could not download document";try{const data=await response.json();message=data?.error||message;}catch{}throw new Error(message);}
    return response;
  }

  async loadWorkspace(token:string,folderId:string|null):Promise<DocumentsWorkspace>{
    const [folderResult,documentResult]=await Promise.all([
      this.jsonRequest<{folders:DocumentsFolder[]}>(this.foldersUrl(),token),
      this.jsonRequest<{documents:DocumentsItem[]}>(this.documentsUrl(folderId),token)
    ]);
    return {folders:folderResult.folders||[],documents:documentResult.documents||[]};
  }
  moveDocument(token:string,id:string,folderId:string|null):Promise<{document:DocumentsItem|null;success:boolean;unchanged?:boolean}>{
    return this.jsonRequest<{document:DocumentsItem|null;success:boolean;unchanged?:boolean}>(this.documentLocationUrl(id),token,{method:"PATCH",body:JSON.stringify({folderId})});
  }
  moveFolder(token:string,id:string,parentId:string|null):Promise<{success:boolean;unchanged?:boolean}>{
    return this.jsonRequest<{success:boolean;unchanged?:boolean}>(this.folderLocationUrl(id),token,{method:"PATCH",body:JSON.stringify({parentId})});
  }
  getFolderShares(token:string,id:string):Promise<DocumentsFolderShares>{return this.jsonRequest(this.folderSharesUrl(id),token);}
  searchShareTargets(token:string,query:string):Promise<DocumentsShareTargets>{return this.jsonRequest(this.shareTargetsUrl(query),token);}
  saveFolderShares(token:string,id:string,teamIds:string[],userIds:string[]):Promise<{success:boolean}>{
    return this.jsonRequest<{success:boolean}>(this.folderSharesUrl(id),token,{method:"PUT",body:JSON.stringify({teamIds,userIds})});
  }
  async uploadTextFile(token:string,file:File):Promise<DocumentsUploadResult>{
    const headers=new Headers({"content-type":"application/octet-stream","x-file-content-type":"text/plain","x-file-name":encodeURIComponent(file.name),"authorization":"Bearer "+token});
    const response=await fetch(this.uploadFileUrl(),{method:"POST",credentials:"same-origin",headers,body:await file.arrayBuffer()});
    let data:any={};try{data=await response.json();}catch{}
    if(!response.ok)throw new Error(data?.error||"Could not upload the text file");
    return data as DocumentsUploadResult;
  }
  createDocument(token:string,payload:{fileId:string;folderId:string|null;title:string}):Promise<DocumentsCreateResult>{
    return this.jsonRequest<DocumentsCreateResult>(this.documentsUrl(null),token,{method:"POST",body:JSON.stringify(payload)});
  }
  downloadDocument(token:string,doc:DocumentsItem):Promise<Response>{return this.binaryRequest(doc.downloadUrl,token,{});}
  createFolder(token:string,name:string,parentId:string|null):Promise<DocumentsCreateFolderResult>{
    return this.jsonRequest<DocumentsCreateFolderResult>(this.foldersUrl(),token,{method:"POST",body:JSON.stringify({name,parentId})});
  }
}
