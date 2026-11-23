import type { Db, Document, Collection } from "mongodb";
import { TenantCollection } from "../../core/tenant-collection.js";

export type DocumentsFolderRecord=Document & {id:string;tenantId:string;name:string;parentId:string|null;createdBy:string;createdAt:Date;updatedAt:Date};
export type DocumentsRecord=Document & {id:string;tenantId:string;fileId:string;folderId:string|null;title:string;description:string;tags:string[];visibility:"private"|"public";publicId:string|null;publishedAt:Date|null;createdBy:string;createdAt:Date;updatedAt:Date};

/** Persistence boundary for the Documents module and its related tenant collections. */
export class DocumentsRepository {
 readonly folderCollection:Collection<DocumentsFolderRecord>;
 readonly documentCollection:Collection<DocumentsRecord>;
 readonly resourcePolicies:Collection<any>;
 readonly companyTeams:Collection<any>;
 readonly memberships:Collection<any>;
 readonly teamAppAssignments:Collection<any>;
 readonly users:Collection<any>;
 constructor(private readonly db:Db){
  this.folderCollection=db.collection<DocumentsFolderRecord>("tenant_document_folders");
  this.documentCollection=db.collection<DocumentsRecord>("tenant_documents");
  this.resourcePolicies=db.collection<any>("resource_access_policies");
  this.companyTeams=db.collection<any>("company_teams");
  this.memberships=db.collection<any>("memberships");
  this.teamAppAssignments=db.collection<any>("team_app_assignments");
  this.users=db.collection<any>("users");
 }
 async initializeIndexes():Promise<void>{
  await Promise.all([
   this.folderCollection.createIndex({tenantId:1,id:1},{unique:true,name:"tenant_document_folders_tenant_id_unique"}),
   this.folderCollection.createIndex({tenantId:1,parentId:1,name:1},{name:"tenant_document_folders_parent_name"}),
   this.documentCollection.createIndex({tenantId:1,id:1},{unique:true,name:"tenant_documents_tenant_id_unique"}),
   this.documentCollection.createIndex({tenantId:1,folderId:1,updatedAt:-1},{name:"tenant_documents_folder_updated"}),
   this.documentCollection.createIndex({publicId:1},{unique:true,partialFilterExpression:{publicId:{$type:"string"}},name:"tenant_documents_public_id_unique"})
  ]);
 }
 folders(tenantId:string):TenantCollection<DocumentsFolderRecord>{return new TenantCollection(this.folderCollection,tenantId);}
 documents(tenantId:string):TenantCollection<DocumentsRecord>{return new TenantCollection(this.documentCollection,tenantId);}
}
