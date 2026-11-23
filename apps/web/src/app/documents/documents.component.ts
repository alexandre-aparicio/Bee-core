import { Component, Input, OnChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";

type Folder={id:string;name:string;parentId:string|null;canManageShares?:boolean};
type ShareTeam={id:string;name:string}; type ShareUser={id:string;email:string};
type Doc={id:string;title:string;description:string;visibility:"private"|"public";downloadUrl:string;publicUrl:string|null;folderId:string|null;createdAt:string};

@Component({selector:"bee-documents-workspace",standalone:true,imports:[CommonModule,FormsModule],template:`
<section class="documents">
  <header class="documents__header"><div><div class="documents__eyebrow">WORKSPACE / LIBRARY</div><h1>Documents</h1><p>Organize files, folders and controlled access for this organization.</p></div><button type="button" (click)="load()" [disabled]="loading">Refresh</button></header>
  <div class="documents__toolbar"><button type="button" [class.active]="!currentFolderId" (click)="openFolder(null)">All documents</button><span *ngFor="let folder of breadcrumbs;let i=index">/ <button type="button" (click)="openFolder(folder.id)">{{folder.name}}</button></span><button type="button" (click)="textFileInput.click()" [disabled]="uploading">{{uploading ? "Uploading…" : "Upload text file"}}</button><input #textFileInput class="documents__file-input" type="file" accept=".txt,text/plain" (change)="uploadTextFile($event)"><button type="button" class="primary" (click)="showCreateFolder=true">New folder</button></div>
  <form *ngIf="showCreateFolder" class="documents__create" (ngSubmit)="createFolder()"><input name="folderName" [(ngModel)]="folderName" placeholder="Folder name" maxlength="120" required><button class="primary" type="submit" [disabled]="busy">Create folder</button><button type="button" (click)="showCreateFolder=false">Cancel</button></form>
  <p *ngIf="error" class="documents__error" role="alert">{{error}}</p><p *ngIf="uploadMessage" class="documents__success" role="status">{{uploadMessage}}</p><p *ngIf="loading">Loading documents…</p>
  <div class="documents__grid" *ngIf="!loading">
    <article class="documents__item folder" *ngFor="let folder of visibleFolders">
      <button class="documents__folder-open" type="button" (click)="openFolder(folder.id)"><span class="documents__glyph">▰</span><strong>{{folder.name}}</strong><small>Folder</small></button>
      <div class="documents__folder-actions" *ngIf="folder.canManageShares">
        <button type="button" class="documents__more" aria-label="Folder options" title="Folder options" (click)="toggleFolderMenu(folder.id,$event)">⋮</button>
        <div class="documents__menu" *ngIf="folderMenuId===folder.id">
          <button type="button" (click)="openShareDialog(folder,'groups')">Share with group</button>
          <button type="button" (click)="openShareDialog(folder,'users')">Share with user</button>
        </div>
      </div>
    </article>
    <article class="documents__item" *ngFor="let doc of documents"><span class="documents__glyph">▤</span><strong>{{doc.title}}</strong><small>{{doc.description || 'Document'}}</small><div class="documents__meta"><span>{{doc.visibility==='public'?'Public':'Private'}}</span><button type="button" class="documents__download" (click)="downloadDocument(doc)">Download ↗</button></div></article>
  </div>
  <p class="documents__empty" *ngIf="!loading && !visibleFolders.length && !documents.length">This folder is empty. Upload a text file to this folder or create a new folder.</p>
  <div class="documents__overlay" *ngIf="shareFolder" (click)="closeShareDialog()">
    <section class="documents__share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title" (click)="$event.stopPropagation()">
      <header><div><div class="documents__eyebrow">FOLDER ACCESS</div><h2 id="share-title">Share “{{shareFolder.name}}”</h2></div><button type="button" (click)="closeShareDialog()" aria-label="Close">×</button></header>
      <div class="documents__share-tabs"><button type="button" [class.active]="shareMode==='groups'" (click)="shareMode='groups';shareQuery='';">Groups</button><button type="button" [class.active]="shareMode==='users'" (click)="shareMode='users';shareQuery='';">Users</button></div>
      <label class="documents__share-label">{{shareMode==='groups'?'Find a group':'Find an organization member'}}</label>
      <input class="documents__share-search" [(ngModel)]="shareQuery" (ngModelChange)="searchShareTargets()" [placeholder]="shareMode==='groups'?'Type a group name…':'Type a name or email…'">
      <div class="documents__suggestions" *ngIf="shareQuery.trim()">
        <button type="button" *ngFor="let team of targetTeams" (click)="addShareTeam(team)">{{team.name}} <span>＋</span></button>
        <button type="button" *ngFor="let user of targetUsers" (click)="addShareUser(user)">{{user.email}} <span>＋</span></button>
        <small *ngIf="!targetTeams.length&&!targetUsers.length">No matches found.</small>
      </div>
      <div class="documents__selected">
        <strong>Groups with access</strong>
        <div class="documents__chips"><span class="documents__chip" *ngFor="let team of shareTeams">{{team.name}} <button type="button" (click)="removeShareTeam(team)">×</button></span><small *ngIf="!shareTeams.length">No groups selected.</small></div>
        <strong>Users with access</strong>
        <div class="documents__chips"><span class="documents__chip" *ngFor="let user of shareUsers">{{user.email}} <button type="button" (click)="removeShareUser(user)">×</button></span><small *ngIf="!shareUsers.length">No users selected.</small></div>
      </div>
      <p class="documents__share-hint">Shared members can view and download documents in this folder and its subfolders. Only the folder owner can change sharing.</p>
      <footer><button type="button" (click)="closeShareDialog()">Cancel</button><button type="button" class="primary" [disabled]="shareSaving" (click)="saveFolderShares()">{{shareSaving?'Saving…':'Save sharing'}}</button></footer>
    </section>
  </div>
</section>`,styles:[`
.documents{color:inherit}.documents__header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:24px}.documents__header h1{font-size:30px;margin:7px 0}.documents__header p{opacity:.65;margin:0}.documents__eyebrow{font-size:10px;letter-spacing:.15em;opacity:.55}.documents__toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 0;border-bottom:1px solid #8993a333;margin-bottom:18px}.documents button,.documents input{font:inherit;color:inherit}.documents button{border:1px solid #8993a344;background:transparent;border-radius:8px;padding:8px 11px;cursor:pointer}.documents button.primary{background:#2563eb;color:#fff;border-color:#2563eb;margin-left:auto}.documents__file-input{display:none}.documents__success{padding:12px;border-radius:8px;background:#16a34a1a;color:#15803d}.documents__create{display:flex;gap:8px;margin:16px 0}.documents__create input{min-width:220px;padding:9px;border:1px solid #8993a355;border-radius:8px;background:transparent}.documents__grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}.documents__item{display:flex;flex-direction:column;align-items:flex-start;gap:8px;min-height:145px;padding:16px;border:1px solid #8993a344;border-radius:12px;background:#8993a30a;text-align:left}.documents__item.folder{cursor:pointer}.documents__glyph{font-size:23px;opacity:.8}.documents__item strong{font-size:14px;overflow-wrap:anywhere}.documents__item small{font-size:12px;opacity:.6;overflow-wrap:anywhere}.documents__meta{display:flex;justify-content:space-between;gap:8px;width:100%;margin-top:auto;font-size:11px}.documents__meta a{color:inherit}.documents__error{padding:12px;border-radius:8px;background:#ef44441a;color:#dc2626}.documents__empty{padding:35px;text-align:center;opacity:.6}
.documents__item.folder{position:relative;padding:0;min-height:145px}.documents__folder-open{display:flex!important;flex-direction:column;align-items:flex-start;gap:8px;width:100%;height:100%;min-height:145px;padding:16px!important;border:0!important;text-align:left}.documents__folder-actions{position:absolute;right:10px;top:10px}.documents__more{width:32px;height:32px;padding:0!important;font-size:22px;line-height:1}.documents__menu{position:absolute;right:0;top:36px;z-index:5;display:flex;flex-direction:column;min-width:180px;padding:5px;border:1px solid #8993a355;border-radius:10px;background:var(--surface, #fff);box-shadow:0 8px 24px #0002}.documents__menu button{border:0;text-align:left;white-space:nowrap}.documents__menu button:hover,.documents__suggestions button:hover{background:#8993a322}.documents__overlay{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:20px;background:#0008}.documents__share-dialog{width:min(540px,100%);max-height:min(760px,90vh);overflow:auto;padding:22px;border:1px solid #8993a355;border-radius:16px;background:var(--surface, #fff);color:var(--text,inherit);box-shadow:0 20px 60px #0003}.documents__share-dialog header,.documents__share-dialog footer{display:flex;align-items:center;justify-content:space-between;gap:12px}.documents__share-dialog h2{font-size:20px;margin:5px 0 0}.documents__share-tabs{display:flex;gap:8px;margin:20px 0 14px}.documents__share-tabs button.active{background:#2563eb;color:white;border-color:#2563eb}.documents__share-label{display:block;font-size:12px;margin-bottom:7px;opacity:.7}.documents__share-search{box-sizing:border-box;width:100%;padding:11px;border:1px solid #8993a366;border-radius:9px;background:transparent}.documents__suggestions{display:flex;flex-direction:column;max-height:180px;overflow:auto;margin-top:5px;border:1px solid #8993a344;border-radius:9px}.documents__suggestions button{display:flex;justify-content:space-between;border:0;border-radius:0;text-align:left}.documents__suggestions small{padding:12px;opacity:.6}.documents__selected{display:grid;gap:9px;margin-top:20px}.documents__selected>strong{font-size:12px}.documents__chips{display:flex;flex-wrap:wrap;gap:7px;min-height:25px}.documents__chip{display:inline-flex;align-items:center;gap:7px;padding:5px 9px;border-radius:20px;background:#2563eb18;font-size:12px}.documents__chip button{border:0;padding:0 2px;font-size:16px}.documents__chips small{opacity:.55}.documents__share-hint{font-size:12px;line-height:1.5;opacity:.65;margin:18px 0}.documents__share-dialog footer{justify-content:flex-end;padding-top:12px;border-top:1px solid #8993a333}.documents__share-dialog footer .primary{margin-left:0}
@media(max-width:600px){.documents__header{flex-direction:column}.documents__create{flex-wrap:wrap}.documents__create input{width:100%}}
`]})
export class BeeDocumentsComponent implements OnChanges {
 @Input() tenantId=""; @Input() accessToken="";
 api="/api"; folders:Folder[]=[]; documents:Doc[]=[]; currentFolderId:string|null=null; breadcrumbs:Folder[]=[];
 loading=false;busy=false;uploading=false;error="";uploadMessage="";showCreateFolder=false;folderName="";
 folderMenuId:string|null=null;shareFolder:Folder|null=null;shareMode:"groups"|"users"="groups";shareQuery="";shareTeams:ShareTeam[]=[];shareUsers:ShareUser[]=[];targetTeams:ShareTeam[]=[];targetUsers:ShareUser[]=[];shareSaving=false;
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

 toggleFolderMenu(id:string,event:Event):void{event.stopPropagation();this.folderMenuId=this.folderMenuId===id?null:id;}
 async openShareDialog(folder:Folder,mode:"groups"|"users"):Promise<void>{
  this.folderMenuId=null;this.shareFolder=folder;this.shareMode=mode;this.shareQuery="";this.targetTeams=[];this.targetUsers=[];this.error="";
  try{const response=await fetch(this.api+"/documents/folders/"+encodeURIComponent(folder.id)+"/shares",{headers:{authorization:"Bearer "+this.accessToken},credentials:"same-origin"});const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not load folder sharing");this.shareTeams=data.teams||[];this.shareUsers=data.users||[];}
  catch(e){this.error=e instanceof Error?e.message:"Could not load folder sharing";this.shareFolder=null;}
 }
 closeShareDialog():void{this.shareFolder=null;this.shareQuery="";this.targetTeams=[];this.targetUsers=[];}
 async searchShareTargets():Promise<void>{
  const q=this.shareQuery.trim();if(!q){this.targetTeams=[];this.targetUsers=[];return;}
  try{const response=await fetch(this.api+"/documents/share-targets?q="+encodeURIComponent(q),{headers:{authorization:"Bearer "+this.accessToken},credentials:"same-origin"});const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not search sharing targets");this.targetTeams=this.shareMode==="groups"?(data.teams||[]):[];this.targetUsers=this.shareMode==="users"?(data.users||[]):[];}
  catch(e){this.error=e instanceof Error?e.message:"Could not search sharing targets";}
 }
 addShareTeam(team:ShareTeam):void{if(!this.shareTeams.some(item=>item.id===team.id))this.shareTeams=[...this.shareTeams,team];this.shareQuery="";this.targetTeams=[];}
 addShareUser(user:ShareUser):void{if(!this.shareUsers.some(item=>item.id===user.id))this.shareUsers=[...this.shareUsers,user];this.shareQuery="";this.targetUsers=[];}
 removeShareTeam(team:ShareTeam):void{this.shareTeams=this.shareTeams.filter(item=>item.id!==team.id);}
 removeShareUser(user:ShareUser):void{this.shareUsers=this.shareUsers.filter(item=>item.id!==user.id);}
 async saveFolderShares():Promise<void>{
  if(!this.shareFolder||this.shareSaving)return;this.shareSaving=true;this.error="";
  try{const response=await fetch(this.api+"/documents/folders/"+encodeURIComponent(this.shareFolder.id)+"/shares",{method:"PUT",credentials:"same-origin",headers:{"content-type":"application/json",authorization:"Bearer "+this.accessToken},body:JSON.stringify({teamIds:this.shareTeams.map(item=>item.id),userIds:this.shareUsers.map(item=>item.id)})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not save folder sharing");this.closeShareDialog();}
  catch(e){this.error=e instanceof Error?e.message:"Could not save folder sharing";}finally{this.shareSaving=false;}
 }
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
 async downloadDocument(doc:Doc):Promise<void>{
  if(!this.accessToken)return;
  this.error="";
  try{
   const response=await fetch(this.api+doc.downloadUrl,{headers:{authorization:"Bearer "+this.accessToken},credentials:"same-origin"});
   if(!response.ok){
    let message="Could not download document";
    try{const body=await response.json();message=body.error||message;}catch{}
    throw new Error(message);
   }
   const blob=await response.blob();
   const disposition=response.headers.get("content-disposition")||"";
   const encodedName=disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
   const plainName=disposition.match(/filename="?([^";]+)"?/i)?.[1];
   const fileName=encodedName?decodeURIComponent(encodedName):plainName||doc.title||"document";
   const url=URL.createObjectURL(blob);
   const link=document.createElement("a");
   link.href=url;link.download=fileName;link.style.display="none";
   document.body.appendChild(link);link.click();link.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){this.error=e instanceof Error?e.message:"Could not download document";}
 }
 async createFolder():Promise<void>{
  const name=this.folderName.trim();if(!name||this.busy)return;this.busy=true;this.error="";
  try{const response=await fetch(this.api+"/documents/folders",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json",authorization:"Bearer "+this.accessToken},body:JSON.stringify({name,parentId:this.currentFolderId})});const result=await response.json();if(!response.ok)throw new Error(result.error||"Could not create folder");this.folderName="";this.showCreateFolder=false;await this.load();}catch(e){this.error=e instanceof Error?e.message:"Could not create folder";}finally{this.busy=false;}
 }
}
