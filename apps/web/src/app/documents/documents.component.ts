import { Component, Input, OnChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";

type Folder={id:string;name:string;parentId:string|null};
type Doc={id:string;title:string;description:string;visibility:"private"|"public";downloadUrl:string;publicUrl:string|null;folderId:string|null;createdAt:string};

@Component({selector:"bee-documents-workspace",standalone:true,imports:[CommonModule,FormsModule],template:`
<section class="documents">
  <header class="documents__header"><div><div class="documents__eyebrow">WORKSPACE / LIBRARY</div><h1>Documents</h1><p>Organize files, folders and controlled access for this organization.</p></div><button type="button" (click)="load()" [disabled]="loading">Refresh</button></header>
  <div class="documents__toolbar"><button type="button" [class.active]="!currentFolderId" (click)="openFolder(null)">All documents</button><span *ngFor="let folder of breadcrumbs;let i=index">/ <button type="button" (click)="openFolder(folder.id)">{{folder.name}}</button></span><button type="button" (click)="textFileInput.click()" [disabled]="uploading">{{uploading ? "Uploading…" : "Upload text file"}}</button><input #textFileInput class="documents__file-input" type="file" accept=".txt,text/plain" (change)="uploadTextFile($event)"><button type="button" class="primary" (click)="showCreateFolder=true">New folder</button></div>
  <form *ngIf="showCreateFolder" class="documents__create" (ngSubmit)="createFolder()"><input name="folderName" [(ngModel)]="folderName" placeholder="Folder name" maxlength="120" required><button class="primary" type="submit" [disabled]="busy">Create folder</button><button type="button" (click)="showCreateFolder=false">Cancel</button></form>
  <p *ngIf="error" class="documents__error" role="alert">{{error}}</p><p *ngIf="uploadMessage" class="documents__success" role="status">{{uploadMessage}}</p><p *ngIf="loading">Loading documents…</p>
  <div class="documents__grid" *ngIf="!loading">
    <button class="documents__item folder" type="button" *ngFor="let folder of visibleFolders" (click)="openFolder(folder.id)"><span class="documents__glyph">▰</span><strong>{{folder.name}}</strong><small>Folder</small></button>
    <article class="documents__item" *ngFor="let doc of documents"><span class="documents__glyph">▤</span><strong>{{doc.title}}</strong><small>{{doc.description || 'Document'}}</small><div class="documents__meta"><span>{{doc.visibility==='public'?'Public':'Private'}}</span><a [href]="doc.downloadUrl" target="_blank" rel="noopener">Download ↗</a></div></article>
  </div>
  <p class="documents__empty" *ngIf="!loading && !visibleFolders.length && !documents.length">This folder is empty. Upload a text file to this folder or create a new folder.</p>
</section>`,styles:[`
.documents{color:inherit}.documents__header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:24px}.documents__header h1{font-size:30px;margin:7px 0}.documents__header p{opacity:.65;margin:0}.documents__eyebrow{font-size:10px;letter-spacing:.15em;opacity:.55}.documents__toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 0;border-bottom:1px solid #8993a333;margin-bottom:18px}.documents button,.documents input{font:inherit;color:inherit}.documents button{border:1px solid #8993a344;background:transparent;border-radius:8px;padding:8px 11px;cursor:pointer}.documents button.primary{background:#2563eb;color:#fff;border-color:#2563eb;margin-left:auto}.documents__file-input{display:none}.documents__success{padding:12px;border-radius:8px;background:#16a34a1a;color:#15803d}.documents__create{display:flex;gap:8px;margin:16px 0}.documents__create input{min-width:220px;padding:9px;border:1px solid #8993a355;border-radius:8px;background:transparent}.documents__grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}.documents__item{display:flex;flex-direction:column;align-items:flex-start;gap:8px;min-height:145px;padding:16px;border:1px solid #8993a344;border-radius:12px;background:#8993a30a;text-align:left}.documents__item.folder{cursor:pointer}.documents__glyph{font-size:23px;opacity:.8}.documents__item strong{font-size:14px;overflow-wrap:anywhere}.documents__item small{font-size:12px;opacity:.6;overflow-wrap:anywhere}.documents__meta{display:flex;justify-content:space-between;gap:8px;width:100%;margin-top:auto;font-size:11px}.documents__meta a{color:inherit}.documents__error{padding:12px;border-radius:8px;background:#ef44441a;color:#dc2626}.documents__empty{padding:35px;text-align:center;opacity:.6}@media(max-width:600px){.documents__header{flex-direction:column}.documents__create{flex-wrap:wrap}.documents__create input{width:100%}}
`]})
export class BeeDocumentsComponent implements OnChanges {
 @Input() tenantId=""; @Input() accessToken="";
 api="/api"; folders:Folder[]=[]; documents:Doc[]=[]; currentFolderId:string|null=null; breadcrumbs:Folder[]=[];
 loading=false;busy=false;uploading=false;error="";uploadMessage="";showCreateFolder=false;folderName="";
 ngOnChanges():void{void this.load();}
 async load():Promise<void>{
  if(!this.accessToken)return;this.loading=true;this.error="";
  try{
   const headers={authorization:"Bearer "+this.accessToken};
   const [fr,dr]=await Promise.all([fetch(this.api+"/documents/folders",{headers,credentials:"same-origin"}),fetch(this.api+"/documents"+(this.currentFolderId?"?folderId="+encodeURIComponent(this.currentFolderId):""),{headers,credentials:"same-origin"})]);
   const fj=await fr.json();const dj=await dr.json();if(!fr.ok)throw new Error(fj.error||"Could not load folders");if(!dr.ok)throw new Error(dj.error||"Could not load documents");
   this.folders=fj.folders||[];this.documents=dj.documents||[];this.rebuildBreadcrumbs();
  }catch(e){this.error=e instanceof Error?e.message:"Could not load Documents";}finally{this.loading=false;}
 }
 get visibleFolders():Folder[]{return this.folders.filter(f=>f.parentId===this.currentFolderId);}
 openFolder(id:string|null):void{this.currentFolderId=id;this.rebuildBreadcrumbs();void this.load();}
 private rebuildBreadcrumbs():void{const chain:Folder[]=[];let id=this.currentFolderId;while(id){const f=this.folders.find(x=>x.id===id);if(!f)break;chain.unshift(f);id=f.parentId;}this.breadcrumbs=chain;}

 async uploadTextFile(event:Event):Promise<void>{
  const input=event.target as HTMLInputElement;const file=input.files?.[0];input.value="";
  if(!file)return;
  this.error="";this.uploadMessage="";
  if(!file.name.toLowerCase().endsWith(".txt")||file.type&&file.type!=="text/plain"){this.error="Only plain text (.txt) files are allowed.";return;}
  if(file.size===0){this.error="The selected file is empty.";return;}
  if(file.size>10*1024*1024){this.error="The maximum file size is 10 MB.";return;}
  this.uploading=true;
  try{
   const upload=await fetch(this.api+"/files",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/octet-stream","x-file-content-type":"text/plain","x-file-name":encodeURIComponent(file.name),"authorization":"Bearer "+this.accessToken},body:await file.arrayBuffer()});
   const uploaded=await upload.json();if(!upload.ok||!uploaded.file?.id)throw new Error(uploaded.error||"Could not upload the text file");
   const created=await fetch(this.api+"/documents",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json","authorization":"Bearer "+this.accessToken},body:JSON.stringify({fileId:uploaded.file.id,folderId:this.currentFolderId,title:file.name})});
   const result=await created.json();if(!created.ok)throw new Error(result.error||"File uploaded but could not be added to Documents");
   this.uploadMessage="File uploaded successfully.";await this.load();
  }catch(e){this.error=e instanceof Error?e.message:"Could not upload the text file";}finally{this.uploading=false;}
 }
 async createFolder():Promise<void>{
  const name=this.folderName.trim();if(!name||this.busy)return;this.busy=true;this.error="";
  try{const response=await fetch(this.api+"/documents/folders",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json",authorization:"Bearer "+this.accessToken},body:JSON.stringify({name,parentId:this.currentFolderId})});const result=await response.json();if(!response.ok)throw new Error(result.error||"Could not create folder");this.folderName="";this.showCreateFolder=false;await this.load();}catch(e){this.error=e instanceof Error?e.message:"Could not create folder";}finally{this.busy=false;}
 }
}
