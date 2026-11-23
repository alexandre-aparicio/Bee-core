import { Component, Input, OnChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from "@angular/cdk/drag-drop";

type Folder={id:string;name:string;parentId:string|null;canManageShares?:boolean;canMove?:boolean;documentCount?:number};
type ShareTeam={id:string;name:string};
type ShareUser={id:string;email:string};
type Doc={id:string;title:string;description:string;tags:string[];visibility:"private"|"public";downloadUrl:string;publicUrl:string|null;folderId:string|null;canMove?:boolean;originalName:string;fileContentType:string;fileSize:number;uploadedBy:{email:string};uploadedAt:string;createdAt:string;updatedAt:string};
type DragItem={kind:"document";item:Doc}|{kind:"folder";item:Folder};

@Component({
 selector:"bee-documents-workspace",
 standalone:true,
 imports:[CommonModule,FormsModule,CdkDrag,CdkDragHandle,CdkDropList],
 template:`
<section class="documents bee-page">
  <header class="documents__header bee-page__header">
    <div class="documents__heading">
      <p class="documents__eyebrow">WORKSPACE / LIBRARY</p>
      <h1>Documents</h1>
      <p class="documents__description">Organize documents and folders, and manage who can access shared content.</p>
    </div>
    <div class="documents__header-actions bee-page__actions">
      <button type="button" class="documents__button documents__button--secondary" (click)="load()" [disabled]="loading || !accessToken">Refresh</button>
      <button type="button" class="documents__button documents__button--primary" (click)="showCreateFolder=true" [disabled]="busy">New folder</button>
    </div>
  </header>

  <nav class="documents__toolbar bee-page__toolbar" aria-label="Document location and actions">
    <div class="documents__breadcrumbs" aria-label="Folder path">
      <button type="button" class="documents__breadcrumb-root" cdkDropList [cdkDropListSortingDisabled]="true" id="documents-root-drop" [cdkDropListConnectedTo]="rootDropListIds" [cdkDropListData]="null" (cdkDropListDropped)="dropToRoot($event)" [class.is-current]="!currentFolderId" (click)="openFolder(null)" [attr.aria-current]="!currentFolderId ? 'page' : null">All documents</button>
      <ng-container *ngFor="let folder of breadcrumbs;let i=index">
        <span class="documents__breadcrumb-separator" aria-hidden="true">/</span>
        <button type="button" class="documents__breadcrumb" [class.is-current]="i===breadcrumbs.length-1" (click)="openFolder(folder.id)" [attr.aria-current]="i===breadcrumbs.length-1 ? 'page' : null">{{folder.name}}</button>
      </ng-container>
    </div>
    <div class="documents__toolbar-actions">
      <div class="documents__view-toggle" role="group" aria-label="Document view">
        <button type="button" [class.is-active]="viewMode==='cards'" [attr.aria-pressed]="viewMode==='cards'" aria-label="Card view" title="Card view" (click)="viewMode='cards'"><span aria-hidden="true">▦</span></button>
        <button type="button" [class.is-active]="viewMode==='table'" [attr.aria-pressed]="viewMode==='table'" aria-label="Table view" title="Table view" (click)="viewMode='table'"><span aria-hidden="true">☷</span></button>
      </div>
      <input #textFileInput class="documents__file-input" type="file" accept=".txt,text/plain" (change)="uploadTextFile($event)" aria-label="Choose a plain text file">
      <button type="button" class="documents__button documents__button--secondary" (click)="textFileInput.click()" [disabled]="uploading || loading">{{uploading ? "Uploading…" : "Upload text file"}}</button>
    </div>
  </nav>

  <form *ngIf="showCreateFolder" class="documents__create bee-panel" (ngSubmit)="createFolder()">
    <div class="documents__create-copy">
      <h2>Create a folder</h2>
      <p>Create a folder in {{currentFolderId ? 'the current location' : 'All documents'}}.</p>
    </div>
    <label class="documents__field">
      <span>Folder name</span>
      <input name="folderName" [(ngModel)]="folderName" placeholder="e.g. Contracts" maxlength="120" required autocomplete="off">
    </label>
    <div class="documents__form-actions">
      <button class="documents__button documents__button--secondary" type="button" (click)="showCreateFolder=false">Cancel</button>
      <button class="documents__button documents__button--primary" type="submit" [disabled]="busy || !folderName.trim()">{{busy ? "Creating…" : "Create folder"}}</button>
    </div>
  </form>

  <div class="documents__feedback" aria-live="polite" aria-atomic="true">
    <p *ngIf="error" class="documents__notice documents__notice--error" role="alert">{{error}}</p>
    <p *ngIf="uploadMessage" class="documents__notice documents__notice--success" role="status">{{uploadMessage}}</p>
  </div>

  <section class="documents__content bee-page__content" aria-label="Documents and folders">
    <div *ngIf="loading" class="documents__loading bee-panel" role="status">
      <span class="documents__spinner" aria-hidden="true"></span>
      <span>Loading documents…</span>
    </div>

    <div class="documents__grid" *ngIf="!loading && viewMode==='cards' && (visibleFolders.length || documents.length)" cdkDropList id="documents-cards-source" [cdkDropListSortingDisabled]="true" [cdkDropListConnectedTo]="sourceDropListIds('documents-cards-source')" (cdkDropListDropped)="dropOnSource($event)">
      <article class="documents__item documents__item--folder" *ngFor="let folder of visibleFolders" cdkDropList [cdkDropListSortingDisabled]="true" [id]="folderDropId(folder.id)" [cdkDropListConnectedTo]="folderDropListIds(folder.id)" [cdkDropListData]="folder" [cdkDropListDisabled]="!folder.canMove" (cdkDropListDropped)="dropOnFolder($event,folder)">
        <button class="documents__folder-open" type="button" cdkDrag [cdkDragData]="{kind:'folder',item:folder}" [cdkDragDisabled]="!folder.canMove" (click)="openFolder(folder.id)" [attr.aria-label]="'Open folder ' + folder.name">
          <span class="documents__item-copy">
            <strong>{{folder.name}}</strong>
            <small>Folder · {{folder.documentCount || 0}} documents</small>
            <span class="documents__folder-count" [attr.aria-label]="(folder.documentCount || 0) + ' documents'">{{folder.documentCount || 0}}</span>
          </span>
        </button>
        <div class="documents__folder-actions" *ngIf="folder.canManageShares || folder.canMove">
          <button type="button" class="documents__icon-button" aria-label="Folder options" title="Folder options" [attr.aria-expanded]="folderMenuId===folder.id" (click)="toggleFolderMenu(folder.id,$event)"><span aria-hidden="true">⋮</span></button>
          <div class="documents__menu" *ngIf="folderMenuId===folder.id">
            <button type="button" *ngIf="folder.canManageShares" (click)="openShareDialog(folder,'groups')">Share with group</button>
            <button type="button" *ngIf="folder.canManageShares" (click)="openShareDialog(folder,'users')">Share with user</button>
            <button type="button" *ngIf="folder.canMove && folder.parentId" (click)="moveFolderOut(folder)">Move out of this folder</button>
          </div>
        </div>
      </article>

      <article class="documents__item documents__item--document" *ngFor="let doc of documents" cdkDrag [cdkDragData]="{kind:'document',item:doc}" [cdkDragDisabled]="!doc.canMove">
        <div class="documents__document-actions">
          <button type="button" class="documents__icon-button" aria-label="Document options" title="Document options" [attr.aria-expanded]="documentMenuId===doc.id" (click)="toggleDocumentMenu(doc.id,$event)"><span aria-hidden="true">⋮</span></button>
          <div class="documents__menu" *ngIf="documentMenuId===doc.id">
            <button type="button" (click)="openDocumentDetails(doc)">Document details</button>
            <button type="button" (click)="downloadDocument(doc)">Download</button>
            <button type="button" *ngIf="doc.canMove && doc.folderId" (click)="moveDocumentOut(doc)">Move out of this folder</button>
          </div>
        </div>
        <div class="documents__item-main" cdkDragHandle>
          <div class="documents__item-copy">
            <strong [title]="doc.title">{{doc.title}}</strong>
            <small>{{doc.description || 'Document'}}</small>
            <small>Uploaded by {{doc.uploadedBy?.email || 'Unknown user'}} · {{formatDate(doc.uploadedAt)}}</small>
          </div>
        </div>
        <div class="documents__meta">
          <span class="documents__visibility" [class.is-public]="doc.visibility==='public'">{{doc.visibility==='public'?'Public':'Private'}}</span>
          <button type="button" class="documents__text-action" (click)="downloadDocument(doc)">Download <span aria-hidden="true">↗</span></button>
        </div>
      </article>
    </div>

    
    <div class="documents__table-wrap" *ngIf="!loading && viewMode==='table' && (visibleFolders.length || documents.length)">
      <table class="documents__table">
        <thead><tr><th scope="col">Title / original file</th><th scope="col">Type</th><th scope="col">Uploaded by</th><th scope="col">Uploaded</th><th scope="col">Access</th><th scope="col">Actions</th></tr></thead>
        <tbody cdkDropList id="documents-table-source" [cdkDropListSortingDisabled]="true" [cdkDropListConnectedTo]="sourceDropListIds('documents-table-source')" (cdkDropListDropped)="dropOnSource($event)">
          <tr *ngFor="let folder of visibleFolders" cdkDropList [cdkDropListSortingDisabled]="true" [id]="folderDropId(folder.id)" [cdkDropListConnectedTo]="folderDropListIds(folder.id)" [cdkDropListData]="folder" [cdkDropListDisabled]="!folder.canMove" (cdkDropListDropped)="dropOnFolder($event,folder)">
            <td colspan="5"><button class="documents__table-name" type="button" cdkDrag [cdkDragData]="{kind:'folder',item:folder}" [cdkDragDisabled]="!folder.canMove" (click)="openFolder(folder.id)">{{folder.name}} <span class="documents__folder-count documents__folder-count--table">{{folder.documentCount || 0}}</span></button></td>
            <td>
              <div class="documents__table-actions" *ngIf="folder.canManageShares || folder.canMove">
                <button type="button" class="documents__icon-button" aria-label="Folder options" title="Folder options" [attr.aria-expanded]="folderMenuId===folder.id" (click)="toggleFolderMenu(folder.id,$event)"><span aria-hidden="true">⋮</span></button>
                <div class="documents__menu" *ngIf="folderMenuId===folder.id">
                  <button type="button" *ngIf="folder.canManageShares" (click)="openShareDialog(folder,'groups')">Share with group</button>
                  <button type="button" *ngIf="folder.canManageShares" (click)="openShareDialog(folder,'users')">Share with user</button>
                  <button type="button" *ngIf="folder.canMove && folder.parentId" (click)="moveFolderOut(folder)">Move out of this folder</button>
                </div>
              </div>
              <span *ngIf="!folder.canManageShares && !folder.canMove">—</span>
            </td>
          </tr>
          <tr *ngFor="let doc of documents" cdkDrag [cdkDragData]="{kind:'document',item:doc}" [cdkDragDisabled]="!doc.canMove">
            <td cdkDragHandle><strong class="documents__table-name-text">{{doc.title}}</strong><small class="documents__table-description">Original: {{doc.originalName}}</small></td>
            <td>{{doc.fileContentType}}</td>
            <td>{{doc.uploadedBy?.email || 'Unknown user'}}</td>
            <td>{{formatDate(doc.uploadedAt)}}</td>
            <td><span class="documents__visibility" [class.is-public]="doc.visibility==='public'">{{doc.visibility==='public'?'Public':'Private'}}</span></td>
            <td><div class="documents__table-actions">
              <button type="button" class="documents__icon-button" aria-label="Document options" title="Document options" [attr.aria-expanded]="documentMenuId===doc.id" (click)="toggleDocumentMenu(doc.id,$event)"><span aria-hidden="true">⋮</span></button>
              <div class="documents__menu" *ngIf="documentMenuId===doc.id">
                <button type="button" (click)="openDocumentDetails(doc)">Document details</button>
                <button type="button" (click)="downloadDocument(doc)">Download</button>
                <button type="button" *ngIf="doc.canMove && doc.folderId" (click)="moveDocumentOut(doc)">Move out of this folder</button>
              </div>
            </div></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="documents__empty bee-panel" *ngIf="!loading && !visibleFolders.length && !documents.length">
      <h2>{{currentFolderId ? 'This folder is empty' : 'No documents yet'}}</h2>
      <p>{{currentFolderId ? 'Add a text document or create a subfolder to organize this location.' : 'Start by creating a folder or uploading a plain text document.'}}</p>
      <div class="documents__empty-actions">
        <button type="button" class="documents__button documents__button--secondary" (click)="textFileInput.click()" [disabled]="uploading">{{uploading ? 'Uploading…' : 'Upload text file'}}</button>
        <button type="button" class="documents__button documents__button--primary" (click)="showCreateFolder=true">New folder</button>
      </div>
    </div>
  </section>

  <div class="documents__overlay" *ngIf="shareFolder" (click)="closeShareDialog()">
    <section class="documents__share-dialog" (keydown.escape)="closeShareDialog()" role="dialog" aria-modal="true" aria-labelledby="share-title" aria-describedby="share-description" (click)="$event.stopPropagation()">
      <header class="documents__dialog-header">
        <div>
          <p class="documents__eyebrow">FOLDER ACCESS</p>
          <h2 id="share-title">Share “{{shareFolder.name}}”</h2>
          <p id="share-description">Choose which organization groups or members can view and download this folder.</p>
        </div>
        <button type="button" class="documents__icon-button" (click)="closeShareDialog()" aria-label="Close sharing dialog">×</button>
      </header>
      <p *ngIf="error" class="documents__notice documents__notice--error" role="alert">{{error}}</p>
      <div class="documents__share-tabs" role="group" aria-label="Sharing target type">
        <button type="button" [attr.aria-pressed]="shareMode==='groups'" [class.is-active]="shareMode==='groups'" (click)="shareMode='groups';shareQuery='';targetTeams=[];targetUsers=[];">Groups</button>
        <button type="button" [attr.aria-pressed]="shareMode==='users'" [class.is-active]="shareMode==='users'" (click)="shareMode='users';shareQuery='';targetTeams=[];targetUsers=[];">Users</button>
      </div>
      <label class="documents__field documents__share-field">
        <span>{{shareMode==='groups'?'Find a group':'Find an organization member'}}</span>
        <input [(ngModel)]="shareQuery" (ngModelChange)="searchShareTargets()" [placeholder]="shareMode==='groups'?'Type a group name…':'Type a name or email…'" [attr.aria-label]="shareMode==='groups'?'Find a group':'Find an organization member'" autocomplete="off">
      </label>
      <div class="documents__suggestions" *ngIf="shareQuery.trim()">
        <button type="button" *ngFor="let team of targetTeams" (click)="addShareTeam(team)">{{team.name}} <span aria-hidden="true">＋</span></button>
        <button type="button" *ngFor="let user of targetUsers" (click)="addShareUser(user)">{{user.email}} <span aria-hidden="true">＋</span></button>
        <p *ngIf="!targetTeams.length&&!targetUsers.length">No matches found.</p>
      </div>
      <div class="documents__selected">
        <section class="documents__selected-group">
          <h3>Groups with access</h3>
          <div class="documents__chips">
            <span class="documents__chip" *ngFor="let team of shareTeams">{{team.name}} <button type="button" (click)="removeShareTeam(team)" [attr.aria-label]="'Remove group ' + team.name">×</button></span>
            <small *ngIf="!shareTeams.length">No groups selected.</small>
          </div>
        </section>
        <section class="documents__selected-group">
          <h3>Users with access</h3>
          <div class="documents__chips">
            <span class="documents__chip" *ngFor="let user of shareUsers">{{user.email}} <button type="button" (click)="removeShareUser(user)" [attr.aria-label]="'Remove user ' + user.email">×</button></span>
            <small *ngIf="!shareUsers.length">No users selected.</small>
          </div>
        </section>
      </div>
      <p class="documents__share-hint">Shared members can view and download documents in this folder and its subfolders. Only the folder owner can change sharing.</p>
      <footer class="documents__dialog-footer">
        <button type="button" class="documents__button documents__button--secondary" (click)="closeShareDialog()">Cancel</button>
        <button type="button" class="documents__button documents__button--primary" [disabled]="shareSaving" (click)="saveFolderShares()">{{shareSaving?'Saving…':'Save sharing'}}</button>
      </footer>
    </section>
  </div>
  <div class="documents__overlay" *ngIf="detailDocument" (click)="closeDocumentDetails()">
    <section class="documents__share-dialog documents__details-dialog" (keydown.escape)="closeDocumentDetails()" role="dialog" aria-modal="true" aria-labelledby="document-details-title" (click)="$event.stopPropagation()">
      <header class="documents__dialog-header">
        <div><p class="documents__eyebrow">DOCUMENT INFORMATION</p><h2 id="document-details-title">{{detailDocument.title}}</h2><p>File metadata and upload history.</p></div>
        <button type="button" class="documents__icon-button" (click)="closeDocumentDetails()" aria-label="Close document details">×</button>
      </header>
      <dl class="documents__details-list">
        <div><dt>Document title</dt><dd>{{detailDocument.title}}</dd></div>
        <div><dt>Original filename</dt><dd>{{detailDocument.originalName}}</dd></div>
        <div><dt>Uploaded by</dt><dd>{{detailDocument.uploadedBy?.email || 'Unknown user'}}</dd></div>
        <div><dt>Uploaded on</dt><dd>{{formatDate(detailDocument.uploadedAt)}}</dd></div>
        <div><dt>Document record created</dt><dd>{{formatDate(detailDocument.createdAt)}}</dd></div>
        <div><dt>Last updated</dt><dd>{{formatDate(detailDocument.updatedAt)}}</dd></div>
        <div><dt>File type</dt><dd>{{detailDocument.fileContentType}}</dd></div>
        <div><dt>File size</dt><dd>{{formatBytes(detailDocument.fileSize)}}</dd></div>
        <div><dt>Access</dt><dd>{{detailDocument.visibility==='public'?'Public':'Private'}}</dd></div>
        <div *ngIf="detailDocument.description"><dt>Description</dt><dd>{{detailDocument.description}}</dd></div>
        <div *ngIf="detailDocument.tags?.length"><dt>Tags</dt><dd>{{detailDocument.tags.join(', ')}}</dd></div>
      </dl>
      <footer class="documents__dialog-footer">
        <button type="button" class="documents__button documents__button--secondary" (click)="closeDocumentDetails()">Close</button>
        <button type="button" class="documents__button documents__button--primary" (click)="downloadDocument(detailDocument)">Download file</button>
      </footer>
    </section>
  </div>
</section>`,
 styles:[`
:host{display:block;min-width:0;color:inherit}
.documents{display:flex;flex-direction:column;gap:22px;min-width:0;width:100%;color:inherit}
.documents__header{display:flex;align-items:flex-start;justify-content:space-between;gap:24px}
.documents__heading{min-width:0}
.documents__eyebrow{margin:0 0 8px;color:var(--muted);font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
.documents__header h1{margin:0;font-size:clamp(26px,3vw,36px);font-weight:650;line-height:1.15;letter-spacing:-.035em}
.documents__description{max-width:680px;margin:9px 0 0;color:var(--muted);font-size:14px;line-height:1.65}
.documents__header-actions,.documents__toolbar-actions,.documents__form-actions,.documents__empty-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.documents__view-toggle{display:flex;align-items:center;gap:5px;padding:5px;border:0;border-radius:10px;background:transparent}
.documents__view-toggle button{display:grid;place-items:center;width:34px;height:32px;border:1px solid var(--border);border-radius:7px;background:transparent;color:var(--muted);font:inherit;font-size:17px;cursor:pointer;transition:background-color .16s ease,border-color .16s ease,color .16s ease}
.documents__view-toggle button:hover{border-color:var(--purple);color:inherit}
.documents__view-toggle button.is-active{border-color:var(--purple);background:var(--purple);color:var(--bg)}
.documents__button{display:inline-flex;min-height:38px;align-items:center;justify-content:center;gap:8px;padding:8px 13px;border:1px solid var(--border);border-radius:9px;background:transparent;color:inherit;font:inherit;font-size:13px;font-weight:600;line-height:1.2;cursor:pointer;transition:background-color .16s ease,border-color .16s ease,transform .16s ease}
.documents__button:hover:not(:disabled){background:color-mix(in srgb,var(--purple) 10%,transparent);border-color:color-mix(in srgb,var(--purple) 55%,var(--border))}
.documents__button:focus-visible,.documents button:focus-visible,.documents input:focus-visible{outline:2px solid var(--cyan);outline-offset:2px}
.documents__button:active:not(:disabled){transform:translateY(1px)}
.documents__button:disabled{cursor:not-allowed;opacity:.48}
.documents__button--primary{border-color:var(--purple);background:var(--purple);color:var(--bg)}
.documents__button--primary:hover:not(:disabled){background:color-mix(in srgb,var(--purple) 86%,var(--bg));border-color:var(--purple)}
.documents__toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;min-width:0;padding:12px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border)}
.documents__breadcrumbs{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}
.documents__breadcrumbs button{max-width:min(260px,40vw);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:0;background:transparent;padding:4px 0;color:var(--muted);font:inherit;font-size:12px;cursor:pointer}
.documents__breadcrumbs button:hover,.documents__breadcrumbs button.is-current{color:inherit}
.documents__breadcrumbs button.is-current{font-weight:650}
.documents__breadcrumb-separator{color:var(--muted);font-size:12px;opacity:.7}
.documents__file-input{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;clip-path:inset(50%)}
.documents__create{display:grid;grid-template-columns:minmax(180px,.8fr) minmax(220px,1.2fr) auto;align-items:end;gap:18px;padding:18px;border:1px solid var(--border);border-radius:12px;background:var(--panel)}
.documents__create-copy h2{margin:0;font-size:15px;font-weight:650}
.documents__create-copy p{margin:5px 0 0;color:var(--muted);font-size:12px;line-height:1.5}
.documents__field{display:flex;flex-direction:column;gap:7px;min-width:0}
.documents__field>span{color:var(--muted);font-size:12px;font-weight:600}
.documents__field input{box-sizing:border-box;width:100%;min-height:40px;padding:9px 11px;border:1px solid var(--border);border-radius:9px;background:var(--bg);color:inherit;font:inherit;font-size:13px}
.documents__field input::placeholder{color:var(--muted);opacity:.8}
.documents__form-actions{justify-content:flex-end}
.documents__feedback:empty{display:none}
.documents__notice{margin:0;padding:11px 13px;border:1px solid var(--border);border-radius:9px;background:var(--panel);font-size:13px;line-height:1.5}
.documents__notice--error{border-color:color-mix(in srgb,currentColor 35%,var(--border));}
.documents__notice--success{border-color:color-mix(in srgb,var(--cyan) 38%,var(--border));}
.documents__content{min-width:0}
.documents__loading{display:flex;align-items:center;justify-content:center;gap:11px;min-height:150px;border:1px solid var(--border);border-radius:12px;background:var(--panel);color:var(--muted);font-size:13px}
.documents__spinner{width:16px;height:16px;border:2px solid var(--border);border-top-color:var(--purple);border-radius:50%;animation:documents-spin .8s linear infinite}
@keyframes documents-spin{to{transform:rotate(360deg)}}
.documents__grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,245px),1fr));gap:12px;min-width:0}
.documents__table-wrap{width:100%;min-width:0;overflow-x:auto;border:1px solid var(--border);border-radius:12px;background:var(--panel)}
.documents__table{width:100%;min-width:900px;border-collapse:collapse;text-align:left;font-size:13px}
.documents__table th,.documents__table td{padding:13px 15px;border-bottom:1px solid var(--border);vertical-align:middle}
.documents__table th{color:var(--muted);font-size:11px;font-weight:650;white-space:nowrap}
.documents__table tbody tr:last-child td{border-bottom:0}
.documents__table tbody tr:hover{background:color-mix(in srgb,var(--purple) 5%,transparent)}
.documents__table-name{padding:0;border:0;background:transparent;color:var(--purple);font:inherit;font-weight:650;text-align:left;cursor:pointer}
.documents__table-name:hover{text-decoration:underline;text-underline-offset:3px}
.documents__table-name-text{display:block;font-weight:650;overflow-wrap:anywhere}
.documents__table-description{display:block;margin-top:4px;color:var(--muted);font-size:11px;overflow-wrap:anywhere}
.documents__table-actions{position:relative;display:inline-flex;align-items:center}
.documents__document-actions{position:absolute;top:12px;right:12px;z-index:3}
.documents__table-actions .documents__menu{top:calc(100% + 4px)}
.documents__table .documents__text-action{white-space:nowrap}
.documents__details-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 18px;margin:0}
.documents__details-list>div{min-width:0;padding:11px 0;border-bottom:1px solid var(--border)}
.documents__details-list dt{margin:0 0 5px;color:var(--muted);font-size:11px;font-weight:600}
.documents__details-list dd{margin:0;color:inherit;font-size:13px;line-height:1.5;overflow-wrap:anywhere}
@media(max-width:520px){.documents__details-list{grid-template-columns:minmax(0,1fr)}}
.documents__item{position:relative;display:flex;min-width:0;min-height:142px;flex-direction:column;justify-content:space-between;gap:18px;padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--panel);transition:border-color .16s ease,background-color .16s ease}
.documents__item:hover{border-color:color-mix(in srgb,var(--purple) 48%,var(--border));background:color-mix(in srgb,var(--panel) 92%,var(--purple))}
.documents__folder-count{display:inline-flex;flex:0 0 27px;width:27px;height:27px;align-items:center;justify-content:center;margin-left:auto;border:1px solid color-mix(in srgb,var(--purple) 42%,var(--border));border-radius:50%;background:color-mix(in srgb,var(--purple) 11%,transparent);color:var(--purple);font-size:11px;font-weight:700;font-variant-numeric:tabular-nums}
.documents__folder-count--table{width:23px;height:23px;min-width:23px;margin-left:8px;vertical-align:middle}
.documents__item--folder.cdk-drop-list-receiving,.documents__table tr.cdk-drop-list-receiving,.documents__breadcrumb-root.cdk-drop-list-receiving{outline:2px solid var(--purple);outline-offset:2px;background:color-mix(in srgb,var(--purple) 9%,var(--panel))}
.cdk-drag-preview{z-index:1000!important;display:flex;box-sizing:border-box;min-width:220px;max-width:min(360px,80vw);padding:16px;border:1px solid color-mix(in srgb,var(--purple) 58%,var(--border));border-radius:14px;background:var(--panel);color:inherit;opacity:1;box-shadow:0 22px 55px rgba(0,0,0,.34);transform:scale(1.025);pointer-events:none}
.cdk-drag-placeholder{opacity:0!important;transition:opacity .18s ease,transform .24s cubic-bezier(.2,.8,.2,1)}
.documents__grid.cdk-drop-list-dragging>.cdk-drag-placeholder{min-height:0;height:0;margin:0;padding-block:0;border-width:0;overflow:hidden}
.documents__grid.cdk-drop-list-dragging>.documents__item:not(.cdk-drag-placeholder){transition:transform .26s cubic-bezier(.2,.8,.2,1),border-color .2s ease,background-color .2s ease}
.documents__item--folder.cdk-drop-list-receiving{position:relative;z-index:1;transform:scale(1.025);box-shadow:0 0 0 4px color-mix(in srgb,var(--purple) 12%,transparent),0 14px 34px color-mix(in srgb,var(--purple) 18%,transparent);transition:transform .2s cubic-bezier(.2,.8,.2,1),box-shadow .2s ease,background-color .2s ease}
.documents__table tbody tr.cdk-drag-placeholder{height:0;opacity:0!important}
.documents__table tbody tr.cdk-drop-list-receiving{background:color-mix(in srgb,var(--purple) 12%,var(--panel))}
.cdk-drag-animating{transition:transform .28s cubic-bezier(.2,.8,.2,1)}
@media(prefers-reduced-motion:reduce){.cdk-drag-preview,.cdk-drag-placeholder,.documents__grid.cdk-drop-list-dragging>.documents__item,.documents__item--folder.cdk-drop-list-receiving{transition:none!important;animation:none!important;transform:none!important}}
.documents__item-main[cdkDragHandle],.documents__table td[cdkDragHandle]{cursor:grab}
.documents__item-main[cdkDragHandle]:active,.documents__table td[cdkDragHandle]:active{cursor:grabbing}
.documents__folder-open{display:flex;align-items:flex-start;gap:0;width:100%;min-width:0;padding:0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer}
.documents__item-main{display:flex;align-items:flex-start;gap:0;min-width:0}
.documents__item--folder .documents__item-copy,.documents__item--document .documents__item-copy{padding-right:48px}
.documents__item-copy{display:flex;min-width:0;flex:1;flex-direction:column;gap:6px;padding-right:0}
.documents__item-copy strong{overflow-wrap:anywhere;color:inherit;font-size:13px;font-weight:650;line-height:1.45}
.documents__item-copy small{overflow-wrap:anywhere;color:var(--muted);font-size:11px;line-height:1.5}
.documents__folder-actions,.documents__document-actions{position:absolute;top:12px;right:12px;z-index:2}
.documents__icon-button{display:inline-flex;min-width:38px;height:32px;align-items:center;justify-content:center;padding:0 8px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--muted);font:inherit;font-size:11px;font-weight:600;cursor:pointer}
.documents__icon-button:hover{border-color:var(--border);background:var(--bg);color:inherit}
.documents__menu{position:absolute;top:36px;right:0;z-index:5;display:flex;min-width:185px;flex-direction:column;gap:3px;padding:5px;border:1px solid var(--border);border-radius:10px;background:var(--panel);box-shadow:0 12px 30px color-mix(in srgb,var(--bg) 35%,transparent)}
.documents__menu button{padding:9px 10px;border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;font-size:12px;text-align:left;cursor:pointer}
.documents__menu button:hover{background:color-mix(in srgb,var(--purple) 12%,transparent)}
.documents__meta{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:auto;padding-top:12px;border-top:1px solid var(--border)}
.documents__visibility{display:inline-flex;align-items:center;min-height:22px;padding:3px 8px;border:1px solid var(--border);border-radius:6px;color:var(--muted);font-size:10px;font-weight:650;letter-spacing:.02em}
.documents__visibility.is-public{border-color:color-mix(in srgb,var(--cyan) 40%,var(--border));color:var(--cyan)}
.documents__text-action{padding:4px 0;border:0;background:transparent;color:var(--purple);font:inherit;font-size:12px;font-weight:650;cursor:pointer}
.documents__text-action:hover{text-decoration:underline;text-underline-offset:3px}
.documents__empty{display:flex;min-height:260px;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:30px 20px;border:1px dashed var(--border);border-radius:14px;background:color-mix(in srgb,var(--panel) 72%,transparent);text-align:center}
.documents__empty h2{margin:0;font-size:16px;font-weight:650}
.documents__empty p{max-width:430px;margin:0;color:var(--muted);font-size:13px;line-height:1.6}
.documents__empty-actions{margin-top:6px;justify-content:center}
.documents__overlay{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:20px;background:color-mix(in srgb,#000 54%,transparent)}
.documents__share-dialog{display:flex;width:min(560px,100%);max-height:min(780px,90vh);flex-direction:column;gap:18px;overflow:auto;padding:22px;border:1px solid var(--border);border-radius:14px;background:var(--panel);color:inherit;box-shadow:0 24px 70px color-mix(in srgb,#000 32%,transparent)}
.documents__dialog-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.documents__dialog-header h2{margin:0;font-size:19px;font-weight:650;letter-spacing:-.02em}
.documents__dialog-header>div>p:last-child{margin:7px 0 0;color:var(--muted);font-size:12px;line-height:1.55}
.documents__share-tabs{display:flex;gap:5px;padding:4px;border:1px solid var(--border);border-radius:10px;background:var(--bg)}
.documents__share-tabs button{flex:1;min-height:34px;padding:7px 12px;border:0;border-radius:7px;background:transparent;color:var(--muted);font:inherit;font-size:12px;font-weight:600;cursor:pointer}
.documents__share-tabs button.is-active{background:var(--panel);color:var(--purple);box-shadow:0 1px 4px color-mix(in srgb,var(--bg) 24%,transparent)}
.documents__suggestions{display:flex;max-height:180px;flex-direction:column;overflow:auto;margin-top:-12px;border:1px solid var(--border);border-radius:9px;background:var(--bg)}
.documents__suggestions button{display:flex;justify-content:space-between;gap:12px;padding:10px 12px;border:0;border-radius:0;background:transparent;color:inherit;font:inherit;font-size:12px;text-align:left;cursor:pointer}
.documents__suggestions button+button{border-top:1px solid var(--border)}
.documents__suggestions button:hover{background:color-mix(in srgb,var(--purple) 10%,transparent)}
.documents__suggestions button span{color:var(--purple)}
.documents__suggestions p{margin:0;padding:12px;color:var(--muted);font-size:12px}
.documents__selected{display:grid;gap:15px}
.documents__selected-group h3{margin:0 0 8px;font-size:12px;font-weight:650}
.documents__chips{display:flex;min-height:28px;flex-wrap:wrap;gap:7px}
.documents__chip{display:inline-flex;align-items:center;gap:7px;max-width:100%;padding:5px 8px;border:1px solid color-mix(in srgb,var(--purple) 30%,var(--border));border-radius:7px;background:color-mix(in srgb,var(--purple) 9%,transparent);font-size:11px;overflow-wrap:anywhere}
.documents__chip button{padding:0 2px;border:0;background:transparent;color:var(--muted);font:inherit;font-size:16px;line-height:1;cursor:pointer}
.documents__chips small{align-self:center;color:var(--muted);font-size:11px}
.documents__share-hint{margin:0;padding:11px 12px;border-left:2px solid var(--cyan);background:color-mix(in srgb,var(--cyan) 6%,transparent);color:var(--muted);font-size:11px;line-height:1.6}
.documents__dialog-footer{display:flex;justify-content:flex-end;gap:9px;padding-top:15px;border-top:1px solid var(--border)}
@media(max-width:760px){
 .documents__header{flex-direction:column;gap:16px}
 .documents__header-actions{width:100%;justify-content:flex-start}
 .documents__toolbar{align-items:flex-start;flex-direction:column}
 .documents__toolbar-actions{width:100%}
 .documents__create{grid-template-columns:minmax(0,1fr)}
 .documents__form-actions{justify-content:flex-start}
}
@media(max-width:600px){
 .documents__toolbar-actions{justify-content:space-between}
 .documents__table{min-width:620px}
}
@media(max-width:480px){
 .documents{gap:17px}
 .documents__header-actions .documents__button{flex:1}
 .documents__grid{grid-template-columns:minmax(0,1fr)}
 .documents__empty{min-height:230px;padding:24px 16px}
 .documents__empty-actions{width:100%;flex-direction:column}
 .documents__empty-actions .documents__button{width:100%}
 .documents__share-dialog{padding:17px}
}
@media(prefers-reduced-motion:reduce){
 .documents__button,.documents__item{transition:none}
 .documents__spinner{animation:none;border-top-color:var(--muted)}
}
/* Light mode: keep Documents surfaces readable when the Midnight shell switches appearance. */
:host-context(.bee-template-package-host--midnight[data-bee-dashboard-mode="light"]){
 --bg:#f5f7fb;
 --panel:#ffffff;
 --muted:#667085;
 --border:#dce2eb;
 --purple:#6752d8;
 --cyan:#087f78;
 color:#20283a;
}
:host-context(.bee-template-package-host--midnight[data-bee-dashboard-mode="light"]) .documents__button--primary,
:host-context(.bee-template-package-host--midnight[data-bee-dashboard-mode="light"]) .documents__view-toggle button.is-active{color:#fff}
:host-context(.bee-template-package-host--midnight[data-bee-dashboard-mode="light"]) .documents__item{background:var(--panel);color:#20283a;box-shadow:0 2px 8px rgba(31,41,55,.045)}
:host-context(.bee-template-package-host--midnight[data-bee-dashboard-mode="light"]) .documents__item:hover{background:color-mix(in srgb,#fff 92%,var(--purple));border-color:color-mix(in srgb,var(--purple) 45%,var(--border))}
:host-context(.bee-template-package-host--midnight[data-bee-dashboard-mode="light"]) .documents__menu,
:host-context(.bee-template-package-host--midnight[data-bee-dashboard-mode="light"]) .documents__share-dialog{background:#fff;color:#20283a;border-color:#dce2eb;box-shadow:0 18px 48px rgba(23,32,50,.18)}
:host-context(.bee-template-package-host--midnight[data-bee-dashboard-mode="light"]) .documents__menu button:hover,
:host-context(.bee-template-package-host--midnight[data-bee-dashboard-mode="light"]) .documents__suggestions button:hover{background:#f0edff;color:#4333b4}
:host-context(.bee-template-package-host--midnight[data-bee-dashboard-mode="light"]) .documents__icon-button:hover{background:#f3f5f9;border-color:#dce2eb}
:host-context(.bee-template-package-host--midnight[data-bee-dashboard-mode="light"]) .documents__share-tabs{background:#f1f4f9}
:host-context(.bee-template-package-host--midnight[data-bee-dashboard-mode="light"]) .documents__share-tabs button.is-active{background:#fff;color:var(--purple);box-shadow:0 1px 4px rgba(31,41,55,.12)}
:host-context(.bee-template-package-host--midnight[data-bee-dashboard-mode="light"]) .documents__suggestions{background:#fff}
:host-context(.bee-template-package-host--midnight[data-bee-dashboard-mode="light"]) .documents__chip{background:#f2efff;color:#4537a5;border-color:#d8cffc}
:host-context(.bee-template-package-host--midnight[data-bee-dashboard-mode="light"]) .documents__share-hint{background:#edf8f7;color:#526879}
:host-context(.bee-template-package-host--midnight[data-bee-dashboard-mode="light"]) .documents__empty{background:#fbfcfe}
:host-context(.bee-template-package-host--midnight[data-bee-dashboard-mode="light"]) .documents__table-wrap{background:#fff}

`]
})
export class BeeDocumentsComponent implements OnChanges {
 @Input() tenantId="";
 @Input() accessToken="";
 api="/api";
 folders:Folder[]=[];
 documents:Doc[]=[];
 currentFolderId:string|null=null;
 breadcrumbs:Folder[]=[];
 loading=false;
 busy=false;
 uploading=false;
 error="";
 uploadMessage="";
 showCreateFolder=false;
 folderName="";
 viewMode:"cards"|"table"="cards";
 folderMenuId:string|null=null;
 documentMenuId:string|null=null;
 detailDocument:Doc|null=null;
 shareFolder:Folder|null=null;
 shareMode:"groups"|"users"="groups";
 shareQuery="";
 shareTeams:ShareTeam[]=[];
 shareUsers:ShareUser[]=[];
 targetTeams:ShareTeam[]=[];
 targetUsers:ShareUser[]=[];
 shareSaving=false;

 ngOnChanges():void{void this.load();}

 async load():Promise<void>{
  if(!this.accessToken)return;
  this.loading=true;this.error="";
  try{
   const headers={authorization:"Bearer "+this.accessToken};
   const [fr,dr]=await Promise.all([
    fetch(this.api+"/documents/folders",{headers,credentials:"same-origin"}),
    fetch(this.api+"/documents"+(this.currentFolderId?"?folderId="+encodeURIComponent(this.currentFolderId):""),{headers,credentials:"same-origin"})
   ]);
   const fj=await fr.json();const dj=await dr.json();
   if(!fr.ok)throw new Error(fj.error||"Could not load folders");
   if(!dr.ok)throw new Error(dj.error||"Could not load documents");
   this.folders=fj.folders||[];this.documents=dj.documents||[];this.rebuildBreadcrumbs();
  }catch(e){this.error=e instanceof Error?e.message:"Could not load Documents";}
  finally{this.loading=false;}
 }

 get visibleFolders():Folder[]{return this.folders.filter(f=>f.parentId===this.currentFolderId);}
 get dropListIds():string[]{return ["documents-root-drop","documents-cards-source","documents-table-source",...this.visibleFolders.map(folder=>this.folderDropId(folder.id))];}
 get rootDropListIds():string[]{return this.dropListIds.filter(id=>id!=="documents-root-drop");}
 sourceDropListIds(sourceId:string):string[]{return this.dropListIds.filter(id=>id!==sourceId);}
 folderDropListIds(id:string):string[]{return this.dropListIds.filter(dropId=>dropId!==this.folderDropId(id));}
 dropOnSource(_event:CdkDragDrop<any,any,any>):void{/* Dropping on another document or empty grid space intentionally does nothing. */}
 folderDropId(id:string):string{return "documents-folder-drop-"+id;}
 dropToRoot(event:CdkDragDrop<any,any,any>):void{this.applyDrop(event,null);}
 dropOnFolder(event:CdkDragDrop<any,any,any>,folder:Folder):void{this.applyDrop(event,folder.id);}
 private applyDrop(event:CdkDragDrop<any,any,any>,targetFolderId:string|null):void{
  const dragged=event.item.data as DragItem|null;if(!dragged)return;
  if(dragged.kind==="document"){if(dragged.item.folderId!==targetFolderId)void this.moveDocument(dragged.item,targetFolderId);return;}
  if(dragged.item.id===targetFolderId||dragged.item.parentId===targetFolderId)return;
  void this.moveFolder(dragged.item,targetFolderId);
 }
 async moveDocumentOut(doc:Doc):Promise<void>{
  if(!doc.folderId)return;
  const containing=this.folders.find(folder=>folder.id===doc.folderId);
  await this.moveDocument(doc,containing?.parentId??null);
 }
 async moveFolderOut(folder:Folder):Promise<void>{
  if(!folder.parentId)return;
  const parent=this.folders.find(item=>item.id===folder.parentId);
  await this.moveFolder(folder,parent?.parentId??null);
 }
 async moveDocument(doc:Doc,folderId:string|null):Promise<void>{
  if(!doc.canMove||doc.folderId===folderId)return;
  this.error="";this.uploadMessage="";
  try{
   const response=await fetch(this.api+"/documents/"+encodeURIComponent(doc.id)+"/location",{
    method:"PATCH",credentials:"same-origin",
    headers:{"content-type":"application/json",authorization:"Bearer "+this.accessToken},
    body:JSON.stringify({folderId})
   });
   const result=await response.json();if(!response.ok)throw new Error(result.error||"Could not move document");
   this.documentMenuId=null;this.uploadMessage="Document moved successfully.";await this.load();
  }catch(e){this.error=e instanceof Error?e.message:"Could not move document";}
 }
 async moveFolder(folder:Folder,parentId:string|null):Promise<void>{
  if(!folder.canMove||folder.parentId===parentId)return;
  this.error="";this.uploadMessage="";
  try{
   const response=await fetch(this.api+"/documents/folders/"+encodeURIComponent(folder.id)+"/location",{
    method:"PATCH",credentials:"same-origin",
    headers:{"content-type":"application/json",authorization:"Bearer "+this.accessToken},
    body:JSON.stringify({parentId})
   });
   const result=await response.json();if(!response.ok)throw new Error(result.error||"Could not move folder");
   this.folderMenuId=null;this.uploadMessage="Folder moved successfully.";await this.load();
  }catch(e){this.error=e instanceof Error?e.message:"Could not move folder";}
 }
 openFolder(id:string|null):void{this.currentFolderId=id;this.rebuildBreadcrumbs();void this.load();}
 private rebuildBreadcrumbs():void{
  const chain:Folder[]=[];let id=this.currentFolderId;
  while(id){const f=this.folders.find(x=>x.id===id);if(!f)break;chain.unshift(f);id=f.parentId;}
  this.breadcrumbs=chain;
 }

 toggleFolderMenu(id:string,event:Event):void{event.stopPropagation();this.documentMenuId=null;this.folderMenuId=this.folderMenuId===id?null:id;}
 toggleDocumentMenu(id:string,event:Event):void{event.stopPropagation();this.folderMenuId=null;this.documentMenuId=this.documentMenuId===id?null:id;}
 openDocumentDetails(doc:Doc):void{this.documentMenuId=null;this.detailDocument=doc;}
 closeDocumentDetails():void{this.detailDocument=null;}
 formatDate(value:string|Date|null|undefined):string{if(!value)return "—";const date=new Date(value);return Number.isNaN(date.getTime())?"—":new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(date);}
 formatBytes(value:number):string{if(!Number.isFinite(value)||value<0)return "—";if(value<1024)return value+" B";const units=["KB","MB","GB"];let size=value/1024,index=0;while(size>=1024&&index<units.length-1){size/=1024;index++;}return size.toFixed(size>=10?1:2)+" "+units[index];}

 async openShareDialog(folder:Folder,mode:"groups"|"users"):Promise<void>{
  this.folderMenuId=null;this.shareFolder=folder;this.shareMode=mode;this.shareQuery="";this.targetTeams=[];this.targetUsers=[];this.error="";
  try{
   const response=await fetch(this.api+"/documents/folders/"+encodeURIComponent(folder.id)+"/shares",{headers:{authorization:"Bearer "+this.accessToken},credentials:"same-origin"});
   const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not load folder sharing");
   this.shareTeams=data.teams||[];this.shareUsers=data.users||[];
  }catch(e){this.error=e instanceof Error?e.message:"Could not load folder sharing";this.shareFolder=null;}
 }
 closeShareDialog():void{this.shareFolder=null;this.shareQuery="";this.targetTeams=[];this.targetUsers=[];}

 async searchShareTargets():Promise<void>{
  const q=this.shareQuery.trim();if(!q){this.targetTeams=[];this.targetUsers=[];return;}
  try{
   const response=await fetch(this.api+"/documents/share-targets?q="+encodeURIComponent(q),{headers:{authorization:"Bearer "+this.accessToken},credentials:"same-origin"});
   const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not search sharing targets");
   this.targetTeams=this.shareMode==="groups"?(data.teams||[]):[];
   this.targetUsers=this.shareMode==="users"?(data.users||[]):[];
  }catch(e){this.error=e instanceof Error?e.message:"Could not search sharing targets";}
 }
 addShareTeam(team:ShareTeam):void{if(!this.shareTeams.some(item=>item.id===team.id))this.shareTeams=[...this.shareTeams,team];this.shareQuery="";this.targetTeams=[];}
 addShareUser(user:ShareUser):void{if(!this.shareUsers.some(item=>item.id===user.id))this.shareUsers=[...this.shareUsers,user];this.shareQuery="";this.targetUsers=[];}
 removeShareTeam(team:ShareTeam):void{this.shareTeams=this.shareTeams.filter(item=>item.id!==team.id);}
 removeShareUser(user:ShareUser):void{this.shareUsers=this.shareUsers.filter(item=>item.id!==user.id);}

 async saveFolderShares():Promise<void>{
  if(!this.shareFolder||this.shareSaving)return;
  this.shareSaving=true;this.error="";
  try{
   const response=await fetch(this.api+"/documents/folders/"+encodeURIComponent(this.shareFolder.id)+"/shares",{
    method:"PUT",credentials:"same-origin",
    headers:{"content-type":"application/json",authorization:"Bearer "+this.accessToken},
    body:JSON.stringify({teamIds:this.shareTeams.map(item=>item.id),userIds:this.shareUsers.map(item=>item.id)})
   });
   const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not save folder sharing");
   this.closeShareDialog();
  }catch(e){this.error=e instanceof Error?e.message:"Could not save folder sharing";}
  finally{this.shareSaving=false;}
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
   const upload=await fetch(this.api+"/files",{
    method:"POST",credentials:"same-origin",
    headers:{"content-type":"application/octet-stream","x-file-content-type":"text/plain","x-file-name":encodeURIComponent(file.name),"authorization":"Bearer "+this.accessToken},
    body:await file.arrayBuffer()
   });
   const uploaded=await upload.json();if(!upload.ok||!uploaded.file?.id)throw new Error(uploaded.error||"Could not upload the text file");
   const created=await fetch(this.api+"/documents",{
    method:"POST",credentials:"same-origin",
    headers:{"content-type":"application/json","authorization":"Bearer "+this.accessToken},
    body:JSON.stringify({fileId:uploaded.file.id,folderId:this.currentFolderId,title:file.name})
   });
   const result=await created.json();if(!created.ok)throw new Error(result.error||"File uploaded but could not be added to Documents");
   this.uploadMessage="File uploaded successfully.";await this.load();
  }catch(e){this.error=e instanceof Error?e.message:"Could not upload the text file";}
  finally{this.uploading=false;}
 }

 async downloadDocument(doc:Doc):Promise<void>{
  if(!this.accessToken)return;
  this.error="";
  try{
   const response=await fetch(doc.downloadUrl,{headers:{authorization:"Bearer "+this.accessToken},credentials:"same-origin"});
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
   const link=document.createElement("a");link.href=url;link.download=fileName;link.style.display="none";
   document.body.appendChild(link);link.click();link.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){this.error=e instanceof Error?e.message:"Could not download document";}
 }

 async createFolder():Promise<void>{
  const name=this.folderName.trim();if(!name||this.busy)return;
  this.busy=true;this.error="";
  try{
   const response=await fetch(this.api+"/documents/folders",{
    method:"POST",credentials:"same-origin",
    headers:{"content-type":"application/json",authorization:"Bearer "+this.accessToken},
    body:JSON.stringify({name,parentId:this.currentFolderId})
   });
   const result=await response.json();if(!response.ok)throw new Error(result.error||"Could not create folder");
   this.folderName="";this.showCreateFolder=false;await this.load();
  }catch(e){this.error=e instanceof Error?e.message:"Could not create folder";}
  finally{this.busy=false;}
 }
}
