import { CommonModule } from "@angular/common";
import { Component, HostListener, Input, OnChanges, SimpleChanges } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RoleAuditComponent } from "./role-audit.component";
type CustomRole={id:string;name:string;description:string;permissions:string[];mode?:"grant"|"restriction"};
type SystemRole={key:string;label:string;description:string;protected:boolean;permissions:string[];active?:boolean;custom?:boolean;customId?:string};
type PermissionOption={key:string;label:string;group:string;action:string;description:string;sensitive?:boolean;customRoleAssignable:boolean;assignable:boolean;selected:boolean};

@Component({
 selector:"bee-organization-roles",standalone:true,imports:[CommonModule,FormsModule,RoleAuditComponent],
 template:`
 <section class="org-roles">
  <header class="org-roles__header org-roles__header--actions"><button type="button" (click)="load()" [disabled]="loading||busy">Refresh</button></header>
  <p class="org-roles__error" *ngIf="error" role="alert">{{error}}</p><p class="org-roles__success" *ngIf="message" role="status">{{message}}</p>
  <p class="org-roles__notice" *ngIf="!canManage">You can view roles. Only the organization owner or Super Admin can create, edit or delete custom roles.</p>
  <nav class="org-roles__tabs" aria-label="Roles and permissions sections">
   <button type="button" [class.is-active]="activeTab==='system'" [attr.aria-selected]="activeTab==='system'" (click)="activeTab='system'"><span>01</span>System Roles <small>{{systemRoles.length}}</small></button>
   <button type="button" [class.is-active]="activeTab==='permissions'" [attr.aria-selected]="activeTab==='permissions'" (click)="activeTab='permissions'"><span>02</span>Available Permissions <small>{{permissions.length}}</small></button>
   <button *ngIf="canReadAudit" type="button" [class.is-active]="activeTab==='audit'" [attr.aria-selected]="activeTab==='audit'" (click)="activeTab='audit'"><span>03</span>Role Audit <small>Audit</small></button>
  </nav>
  <section class="org-roles__tab-panel" *ngIf="activeTab==='system'">
   <div class="org-roles__section-heading"><div><h3>Roles</h3><p>Browse Core-managed native roles and organization-created roles in one collection. Native role permissions are maintained by Core; custom roles follow the organization delegation policy.</p></div><span class="org-roles__section-tag">{{systemRoles.length}} native · {{roles.length}} created</span></div>
   <div class="org-roles__toolbar">
    <div class="org-roles__toolbar-filters">
     <div class="org-roles__search"><span aria-hidden="true">⌕</span><input [(ngModel)]="systemSearch" name="systemRoleSearch" placeholder="Search roles…" aria-label="Search roles"><button *ngIf="systemSearch" type="button" (click)="systemSearch=''" aria-label="Clear search">×</button></div>
     <select class="org-roles__source-filter" [(ngModel)]="roleSourceFilter" name="roleSourceFilter" aria-label="Filter roles by source"><option value="all">All roles</option><option value="native">Native roles</option><option value="created">Created roles</option></select>
     <span class="org-roles__filter-spacer" aria-hidden="true"></span>
    </div>
    <div class="org-roles__toolbar-actions">
     <span class="org-roles__result-count">{{filteredSystemRoles.length}} {{filteredSystemRoles.length===1?'role':'roles'}}</span>
     <div class="teams-workspace__view-toggle" role="group" aria-label="Role display mode">
      <button type="button" [class.is-active]="systemView==='cards'" [attr.aria-pressed]="systemView==='cards'" (click)="systemView='cards'" aria-label="Card view" title="Card view"><span aria-hidden="true">▦</span></button>
      <button type="button" [class.is-active]="systemView==='table'" [attr.aria-pressed]="systemView==='table'" (click)="systemView='table'" aria-label="Table view" title="Table view"><span aria-hidden="true">☷</span></button>
     </div>
     <button type="button" class="documents__button documents__button--secondary" *ngIf="canManage" (click)="createCustomRole()">＋ Create role</button>
    </div>
   </div>
   <div class="org-roles__system-grid" *ngIf="filteredSystemRoles.length && systemView==='cards'">
    <article class="org-roles__system-card" *ngFor="let item of filteredSystemRoles">
     <div class="org-roles__card-top"><span class="org-roles__role-mark">{{item.label.slice(0,1).toUpperCase()}}</span><div class="org-roles__card-menu"><details><summary [attr.aria-label]="'Options for '+item.label" [attr.title]="'Options for '+item.label"><span>⋮</span></summary><div class="org-roles__menu" role="menu"><button type="button" role="menuitem" (click)="openSystemRole(item)">View details</button><ng-container *ngIf="item.custom"><button type="button" role="menuitem" (click)="editCatalogRole(item)" [disabled]="!canManage">Edit role</button></ng-container><ng-container *ngIf="!item.custom"><button type="button" role="menuitem" disabled>Edit role <small>Core managed</small></button><button type="button" role="menuitem" disabled>Deactivate role <small>Core managed</small></button><button type="button" role="menuitem" disabled>Delete role <small>Core managed</small></button></ng-container></div></details></div></div>
     <div class="org-roles__card-copy"><strong>{{item.label}}</strong><p>{{item.description}}</p></div>
     <div class="org-roles__card-meta"><span class="org-roles__permission-count">{{item.permissions.length}} {{item.permissions.length===1?'permission':'permissions'}}</span><span class="org-roles__status" [class.is-inactive]="item.active===false">{{item.active===false?'Inactive':'Active'}}</span></div>
     <div class="org-roles__permission-preview" [attr.aria-label]="item.permissions.length+' permissions'"><span class="org-roles__permission-circle" tabindex="0" role="img" *ngFor="let permission of item.permissions.slice(0,3)" [attr.data-tooltip]="permissionLabel(permission)" [attr.aria-label]="permissionLabel(permission)" [attr.title]="permissionLabel(permission)">{{permissionInitials(permissionLabel(permission))}}</span><span class="org-roles__permission-more" *ngIf="item.permissions.length>3">+{{item.permissions.length-3}}</span></div>
    </article>
   </div>
   <div class="org-roles__table-wrap" *ngIf="filteredSystemRoles.length && systemView==='table'">
    <table><thead><tr><th>Role</th><th>Description</th><th>Permissions</th><th>Status</th><th><span class="org-roles__sr-only">Options</span></th></tr></thead><tbody>
     <tr *ngFor="let item of filteredSystemRoles">
      <td><span class="org-roles__table-role"><span class="org-roles__role-mark">{{item.label.slice(0,1).toUpperCase()}}</span><strong>{{item.label}}</strong></span></td>
      <td class="org-roles__table-description">{{item.description}}</td>
      <td><div class="org-roles__permission-preview"><span class="org-roles__permission-circle" tabindex="0" role="img" *ngFor="let permission of item.permissions.slice(0,3)" [attr.data-tooltip]="permissionLabel(permission)" [attr.aria-label]="permissionLabel(permission)" [attr.title]="permissionLabel(permission)">{{permissionInitials(permissionLabel(permission))}}</span><span class="org-roles__permission-more" *ngIf="item.permissions.length>3">+{{item.permissions.length-3}}</span><small class="org-roles__table-permission-count">{{item.permissions.length}}</small></div></td>
      <td><span class="org-roles__status" [class.is-inactive]="item.active===false">{{item.active===false?'Inactive':'Active'}}</span></td>
      <td><details class="org-roles__table-menu"><summary [attr.aria-label]="'Options for '+item.label">⋮</summary><div class="org-roles__menu" role="menu"><button type="button" role="menuitem" (click)="openSystemRole(item)">View details</button><ng-container *ngIf="item.custom"><button type="button" role="menuitem" (click)="editCatalogRole(item)" [disabled]="!canManage">Edit role</button></ng-container><ng-container *ngIf="!item.custom"><button type="button" role="menuitem" disabled>Edit role <small>Core managed</small></button><button type="button" role="menuitem" disabled>Deactivate role <small>Core managed</small></button><button type="button" role="menuitem" disabled>Delete role <small>Core managed</small></button></ng-container></div></details></td>
     </tr>
    </tbody></table>
   </div>
   <div *ngIf="!loading && !filteredSystemRoles.length" class="org-roles__empty"><strong>{{systemRoles.length||roles.length?'No matching roles':'No roles available'}}</strong><span>{{systemRoles.length||roles.length?'Try another search term or change the role source.':'No native or created roles are available.'}}</span><button *ngIf="systemSearch" type="button" class="teams-workspace__text-button" (click)="systemSearch=''">Clear search</button></div>
   <div class="org-roles__modal-backdrop" *ngIf="selectedSystemRole" (click)="closeSystemRole()">
    <section class="org-roles__modal org-roles__details-modal" role="dialog" aria-modal="true" aria-labelledby="org-system-role-title" (click)="$event.stopPropagation()" (keydown.escape)="closeSystemRole()" tabindex="-1">
     <header class="org-roles__modal-top"><div><span class="org-roles__modal-eyebrow">{{selectedSystemRole.custom?'ORGANIZATION ROLE · CUSTOM':'SYSTEM ROLE · CORE MANAGED'}}</span><h2 id="org-system-role-title">{{selectedSystemRole.label}}</h2><p>{{selectedSystemRole.description}}</p></div><button type="button" class="org-roles__modal-close" aria-label="Close dialog" (click)="closeSystemRole()">×</button></header>
     <div class="org-roles__details-summary"><div><span class="org-roles__detail-label">Role status</span><span class="org-roles__status" [class.is-inactive]="selectedSystemRole.active===false">{{selectedSystemRole.active===false?'Inactive':'Active'}}</span></div><div><span class="org-roles__detail-label">Permissions</span><strong>{{selectedSystemRole.permissions.length}}</strong></div><div><span class="org-roles__detail-label">Protection</span><strong>{{selectedSystemRole.custom?'Created by organization':selectedSystemRole.protected?'Protected by Core':'Standard system role'}}</strong></div></div>
     <section class="org-roles__details-permissions"><div class="org-roles__details-heading"><h3>Assigned permissions</h3><span>{{selectedSystemRole.permissions.length}} total</span></div><div class="org-roles__detail-badges"><span *ngFor="let permission of selectedSystemRole.permissions"><strong>{{permissionLabel(permission)}}</strong><code>{{permission}}</code></span><p *ngIf="!selectedSystemRole.permissions.length">No explicit permission keys are listed for this role.</p></div></section>
    </section>
   </div>
  </section>
  <section class="org-roles__tab-panel" *ngIf="activeTab==='permissions'">
   <div class="org-roles__section-heading"><div><h3>Available permissions</h3><p>Core capabilities that can be reviewed and, subject to platform policy, assigned to custom grant roles. Restriction roles can deny permissions without granting new access.</p></div><span class="org-roles__section-tag">{{permissions.length}} registered</span></div>
   <div class="org-roles__permissions-toolbar">
    <span class="org-roles__result-count">{{permissions.length}} registered permissions</span>
    <div class="teams-workspace__view-toggle" role="group" aria-label="Permission catalogue display mode">
     <button type="button" [class.is-active]="permissionView==='cards'" [attr.aria-pressed]="permissionView==='cards'" (click)="permissionView='cards'" aria-label="Card view" title="Card view"><span aria-hidden="true">▦</span></button>
     <button type="button" [class.is-active]="permissionView==='table'" [attr.aria-pressed]="permissionView==='table'" (click)="permissionView='table'" aria-label="Table view" title="Table view"><span aria-hidden="true">☷</span></button>
    </div>
   </div>
   <div *ngIf="loading" class="org-roles__empty">Loading permission catalogue…</div>
   <div class="org-roles__permission-groups" *ngIf="!loading && permissionView==='cards'">
    <section class="org-roles__permission-group" *ngFor="let group of groups">
     <header class="org-roles__permission-group-heading">
      <div><h4>{{group}}</h4><span>{{inGroup(group).length}} permissions</span></div>
     </header>
     <div class="org-roles__permission-grid" [class.is-next]="permissionDirections[group]!=='previous'" [class.is-previous]="permissionDirections[group]==='previous'">
      <article class="org-roles__permission-tile" *ngFor="let item of permissionPageItems(group);trackBy:trackPermission">
       <div class="org-roles__permission-tile-top">
        <span class="org-roles__permission-action">{{item.action}}</span>
        <span class="org-roles__permission-state" [class.is-protected]="!canGrant(item)">{{canGrant(item)?'Grantable':'Protected'}}</span>
       </div>
       <strong>{{item.label}}</strong>
       <p>{{item.description}}</p>
       <code>{{item.key}}</code>
      </article>
     </div>
     <nav class="org-roles__permission-pagination" *ngIf="permissionPageCount(group)>1" [attr.aria-label]="group+' permission pages'">
      <button type="button" *ngIf="permissionPage(group)>0" (click)="changePermissionPage(group,-1)" [attr.aria-label]="'Previous '+group+' permissions'" title="Previous permissions"><span aria-hidden="true">←</span></button>
      <span class="org-roles__permission-page-count">{{permissionPage(group)+1}} / {{permissionPageCount(group)}}</span>
      <button type="button" *ngIf="permissionPage(group)<permissionPageCount(group)-1" (click)="changePermissionPage(group,1)" [attr.aria-label]="'Next '+group+' permissions'" title="Next permissions"><span aria-hidden="true">→</span></button>
     </nav>
    </section>
   </div>
   <div class="org-roles__permission-accordions" *ngIf="!loading && permissionView==='table'">
    <section class="org-roles__permission-accordion" *ngFor="let group of groups">
     <h4 class="org-roles__permission-accordion-heading">
      <button type="button" class="org-roles__permission-accordion-trigger" (click)="togglePermissionGroup(group)" [attr.aria-expanded]="expandedPermissionGroup===group" [attr.aria-controls]="'permission-group-'+group">
       <span class="org-roles__permission-accordion-symbol" aria-hidden="true">{{expandedPermissionGroup===group?'−':'+'}}</span>
       <span class="org-roles__permission-accordion-name">{{group}}</span>
       <span class="org-roles__permission-accordion-count">({{inGroup(group).length}})</span>
      </button>
     </h4>
     <div class="org-roles__permission-accordion-content" *ngIf="expandedPermissionGroup===group" [id]="'permission-group-'+group">
      <div class="org-roles__permission-table-wrap">
       <table>
        <thead><tr><th>Permission</th><th>Action</th><th>Access policy</th><th>Code</th></tr></thead>
        <tbody><tr *ngFor="let item of inGroup(group);trackBy:trackPermission">
         <td><strong>{{item.label}}</strong><small>{{item.description}}</small></td>
         <td><span class="org-roles__permission-action">{{item.action}}</span></td>
         <td><span class="org-roles__permission-state" [class.is-protected]="!canGrant(item)">{{canGrant(item)?'Grantable by custom roles':'Restriction only / protected'}}</span></td>
         <td><code>{{item.key}}</code></td>
        </tr></tbody>
       </table>
      </div>
     </div>
    </section>
   </div>
   <p class="org-roles__footnote">The global delegation policy controls which capabilities may be granted to tenant custom roles. Protected capabilities remain unavailable for grants. Backend authorization remains authoritative.</p>
  </section>
  <section class="org-roles__tab-panel org-roles__audit-panel" *ngIf="activeTab==='audit' && canReadAudit">
   <bee-role-audit [tenantId]="tenantId" [role]="role" [accessToken]="accessToken"></bee-role-audit>
   <div class="org-roles__modal-backdrop" *ngIf="modalOpen" (click)="closeModal()">
    <div class="org-roles__modal" role="dialog" aria-modal="true" aria-labelledby="org-role-modal-title" (click)="$event.stopPropagation()">
     <div class="org-roles__modal-top"><div><span class="org-roles__modal-eyebrow">ORGANIZATION ACCESS</span><h2 id="org-role-modal-title">{{editingId?'Edit custom role':'Create custom role'}}</h2><p>Define the role identity and choose its permission behavior.</p></div><button type="button" class="org-roles__modal-close" aria-label="Close dialog" (click)="closeModal()">×</button></div>
     <p class="org-roles__error" *ngIf="error" role="alert">{{error}}</p>
     <div class="org-roles__editor org-roles__editor--modal">
     <div class="org-roles__editor-heading"><div><h3>{{editingId?'Edit custom role':'Create custom role'}}</h3><p>Define the role identity and choose its permission behavior.</p></div><span class="org-roles__section-tag">{{mode==='restriction'?'Deny overlay':'Permission grants'}}</span></div>
     <form (submit)="save($event)">
      <div class="org-roles__form-grid">
       <label>Role name<input name="roleName" [(ngModel)]="name" maxlength="48" required [disabled]="!canManage"></label>
       <label>Description<input name="roleDescription" [(ngModel)]="description" maxlength="240" [disabled]="!canManage"></label>
      </div>
      <label class="org-roles__mode-label">Role behavior<select name="roleMode" [(ngModel)]="mode" (ngModelChange)="updateMode($event)" [disabled]="!canManage"><option value="grant">Grant role — explicitly allows selected permissions</option><option value="restriction">Restriction role — explicitly denies selected permissions</option></select></label>
      <p class="org-roles__mode-hint">{{mode==='restriction'?'Selected permissions are explicit denials. Denials always override permissions granted by the primary role.':'Selected permissions are grants. They remain limited by the global delegation policy.'}}</p>
      <section class="org-roles__module-builder" aria-label="Module permissions">
       <div class="org-roles__module-search-wrap">
        <label class="org-roles__module-search-label" for="org-role-module-search">Add permissions by module</label>
        <div class="org-roles__module-search"><span aria-hidden="true">⌕</span><input id="org-role-module-search" name="moduleSearch" [(ngModel)]="moduleSearch" autocomplete="off" placeholder="Type a module name…" [disabled]="!canManage"><button type="button" *ngIf="moduleSearch" (click)="moduleSearch=''" aria-label="Clear module search">×</button></div>
        <div class="org-roles__module-suggestions" *ngIf="moduleSearch.trim() && !activePermissionModule">
         <button type="button" *ngFor="let group of matchingPermissionModules" (click)="openPermissionModule(group)"><span><strong>{{group}}</strong><small>{{inGroup(group).length}} available permissions</small></span><span aria-hidden="true">＋</span></button>
         <p *ngIf="!matchingPermissionModules.length">No matching modules available.</p>
        </div>
       </div>
       <section class="org-roles__module-permission-card" *ngIf="activePermissionModule as module">
        <header><div><span class="org-roles__module-eyebrow">MODULE PERMISSIONS</span><h4>{{module}}</h4><p>Select the permissions this role should {{mode==='restriction'?'deny':'grant'}}.</p></div><button type="button" class="org-roles__module-close" (click)="closePermissionModule()" aria-label="Close module permissions">×</button></header>
        <div class="org-roles__module-permission-grid">
         <label class="org-roles__module-permission" *ngFor="let item of inGroup(module)">
          <input type="checkbox" [checked]="item.selected" (change)="item.selected=$any($event.target).checked" [disabled]="!canManage||!item.assignable">
          <span><strong>{{item.label}}</strong><small>{{item.description}}</small><code>{{item.key}}</code></span>
          <em *ngIf="!item.assignable">Protected</em><em *ngIf="item.assignable&&item.sensitive">Sensitive</em>
         </label>
        </div>
        <footer><span>{{selectedCountForModule(module)}} selected · {{inGroup(module).length}} available</span><button type="button" class="org-roles__primary" (click)="closePermissionModule()">Save module</button></footer>
       </section>
       <div class="org-roles__assigned-modules">
        <div class="org-roles__assigned-heading"><strong>Assigned modules</strong><span>{{selectedPermissionModules.length}} modules</span></div>
        <div class="org-roles__module-chip-grid" *ngIf="selectedPermissionModules.length; else noAssignedModules">
         <div class="org-roles__module-chip" *ngFor="let module of selectedPermissionModules">
          <button type="button" class="org-roles__module-chip-edit" (click)="openPermissionModule(module)" [disabled]="!canManage" [attr.aria-label]="'Edit '+module+' permissions'" title="Edit permissions">✎</button>
          <span class="org-roles__module-chip-name" [title]="module">{{module}}</span>
          <span class="org-roles__module-chip-count">{{selectedCountForModule(module)}}</span>
          <button type="button" class="org-roles__module-chip-remove" (click)="removePermissionModule(module)" [disabled]="!canManage" [attr.aria-label]="'Remove '+module+' module'" title="Remove module">×</button>
         </div>
        </div>
        <ng-template #noAssignedModules><p class="org-roles__module-empty">Search for a module above to start assigning permissions.</p></ng-template>
       </div>
      </section>
      <div class="org-roles__actions" *ngIf="canManage"><button class="org-roles__primary" type="submit" [disabled]="busy||!name.trim()">{{busy?'Saving…':editingId?'Save changes':'Create role'}}</button><button type="button" *ngIf="editingId" (click)="remove()" [disabled]="busy">Delete role</button><button type="button" (click)="reset()" [disabled]="busy">Clear form</button></div>
     </form>
    </div>
    </div>
   </div>
  </section>
 </section>`,
 styles:[`
 .org-roles{display:grid;gap:16px;margin-top:18px;min-width:0;color:inherit}
 .org-roles__header,.org-roles__section-heading,.org-roles__card-top,.org-roles__editor-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
 .org-roles__header{align-items:center;margin-bottom:4px}
 .org-roles__eyebrow{font-size:10px;letter-spacing:.16em;font-weight:700;opacity:.58}
 .org-roles h2{font-size:clamp(22px,2.4vw,29px);margin:7px 0 5px}
 .org-roles h3,.org-roles h4{margin:0 0 6px}
 .org-roles p{margin:0;color:inherit;opacity:.68;line-height:1.55}
 .org-roles__header>div p{max-width:760px}
 .org-roles button,.org-roles input,.org-roles select{font:inherit}
 .org-roles button{border:1px solid var(--bee-border);border-radius:9px;padding:9px 13px;background:var(--bee-surface);color:inherit;cursor:pointer}
 .org-roles button:disabled{opacity:.5;cursor:not-allowed}
 .org-roles__tabs{display:flex;gap:4px;padding:0 14px;margin:2px 0 0;border-bottom:1px solid var(--bee-border);overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;scrollbar-color:var(--bee-accent) transparent;scrollbar-gutter:stable}
 .org-roles__tabs::-webkit-scrollbar{height:3px}.org-roles__tabs::-webkit-scrollbar-thumb{background:var(--bee-accent);border-radius:999px}
 .org-roles__tabs button{flex:1;min-width:max-content;display:flex;align-items:center;justify-content:center;gap:8px;padding:13px 12px;border:0;border-bottom:2px solid transparent;border-radius:0;background:transparent;color:inherit;font-size:11px;font-weight:600;opacity:.64;white-space:nowrap}
 .org-roles__tabs button>span{font-size:9px;opacity:.55}.org-roles__tabs button small{font-size:10px;border:1px solid var(--bee-border);border-radius:20px;padding:2px 6px;opacity:.75}
 .org-roles__tabs button.is-active{border-bottom-color:var(--bee-accent);color:var(--bee-accent);opacity:1}
 .org-roles__tab-panel{min-width:0;border:1px solid var(--bee-border);border-radius:15px;padding:20px;background:var(--bee-surface)}
 .org-roles__section-heading{align-items:center;margin-bottom:16px}.org-roles__section-heading p,.org-roles__editor-heading p{font-size:12px;max-width:780px}
 .org-roles__section-tag,.org-roles__permission-count,.org-roles__list-heading>span{font-size:10px;border:1px solid var(--bee-border);border-radius:30px;padding:6px 9px;white-space:nowrap;opacity:.75}
 .org-roles .teams-workspace__view-toggle{display:flex;align-items:center;gap:5px;padding:5px;border:0;border-radius:10px;background:transparent}
 .org-roles .teams-workspace__view-toggle button{display:grid;place-items:center;justify-items:center;align-items:center;width:34px;height:32px;padding:0;line-height:1;border:1px solid var(--bee-border);border-radius:7px;background:transparent;color:var(--bee-text-muted);font:inherit;font-size:17px;cursor:pointer;transition:background-color .16s ease,border-color .16s ease,color .16s ease}.org-roles .teams-workspace__view-toggle button>span{display:block;margin:0;padding:0;line-height:1;text-align:center}
 .org-roles .teams-workspace__view-toggle button:hover{border-color:var(--bee-accent);color:inherit}
 .org-roles .teams-workspace__view-toggle button.is-active{border-color:var(--bee-accent);background:var(--bee-accent);color:var(--bee-accent-text)}
 .org-roles .teams-workspace__view-toggle button:focus-visible{outline:2px solid var(--bee-secondary);outline-offset:2px}
 .org-roles .documents__button{display:inline-flex;min-height:38px;align-items:center;justify-content:center;gap:8px;padding:8px 13px;border:1px solid var(--bee-border);border-radius:9px;background:transparent;color:inherit;font:inherit;font-size:13px;font-weight:600;line-height:1.2;cursor:pointer;transition:background-color .16s ease,border-color .16s ease,transform .16s ease}
 .org-roles .documents__button:hover:not(:disabled){background:color-mix(in srgb,var(--bee-accent) 10%,transparent);border-color:color-mix(in srgb,var(--bee-accent) 55%,var(--bee-border))}
 .org-roles .documents__button:focus-visible{outline:2px solid var(--bee-secondary);outline-offset:2px}
 .org-roles .documents__button:active:not(:disabled){transform:translateY(1px)}
 .org-roles .documents__button:disabled{cursor:not-allowed;opacity:.48}
 .org-roles__toolbar{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:center;gap:14px;margin:0 0 18px;min-width:0}
 .org-roles__toolbar-filters{display:grid;grid-template-columns:minmax(0,4fr) minmax(0,3fr) minmax(0,3fr);align-items:center;gap:8px;min-width:0}
 .org-roles__toolbar-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;min-width:0}
 .org-roles__source-filter{width:100%;min-width:0;height:36px;padding:0 10px;border:1px solid var(--bee-border);border-radius:8px;background:var(--bee-surface-subtle);color:inherit;font-size:11px}
 .org-roles__filter-spacer{min-width:0}
 .org-roles__search{display:flex;align-items:center;gap:8px;width:100%;min-width:0;height:36px;padding:0 10px;border:1px solid var(--bee-border);border-radius:8px;background:var(--bee-surface-subtle);color:var(--bee-text-muted)}
 .org-roles__search>span{font-size:20px}.org-roles__search input{border:0;outline:0;min-width:0;flex:1;background:transparent;color:inherit;font-size:12px}
 .org-roles__search input::placeholder{color:var(--bee-text-muted)}.org-roles__search:focus-within{border-color:var(--bee-accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--bee-accent) 20%,transparent)}
 .org-roles__search button{border:0;background:transparent;color:inherit;font-size:16px;padding:0 4px}
 .org-roles__result-count{font-size:10px;color:var(--bee-text-muted);white-space:nowrap}
 .org-roles .teams-workspace__view-toggle{flex:0 0 auto}
 @media(max-width:760px){.org-roles__toolbar{grid-template-columns:1fr;gap:10px}.org-roles__toolbar-actions{justify-content:flex-end}.org-roles__toolbar-filters{grid-template-columns:minmax(0,4fr) minmax(0,3fr) minmax(0,3fr)}}
 .org-roles__permission-preview{display:flex;align-items:center;gap:7px;min-width:0;min-height:26px}
 .org-roles__permission-circle{position:relative;width:28px;height:28px;flex:0 0 28px;display:grid;place-items:center;border:1px solid var(--bee-border);border-radius:50%;background:var(--bee-surface-raised);color:var(--bee-accent);font-size:9px;font-weight:750;letter-spacing:.02em;cursor:help;transition:border-color .16s ease,background-color .16s ease}
 .org-roles__permission-circle:hover,.org-roles__permission-circle:focus-visible{border-color:var(--bee-accent);background:color-mix(in srgb,var(--bee-accent) 12%,var(--bee-surface-raised))}
 .org-roles__permission-circle::after{content:attr(data-tooltip);position:absolute;z-index:20;inset-block-end:calc(100% + 8px);inset-inline-start:50%;transform:translate(-50%,4px);padding:6px 9px;border:1px solid var(--bee-border);border-radius:7px;background:var(--bee-surface-raised);box-shadow:var(--bee-shadow);color:inherit;font-size:10px;font-weight:600;white-space:nowrap;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .12s ease,transform .12s ease}
 .org-roles__permission-circle:hover::after,.org-roles__permission-circle:focus-visible::after{opacity:1;visibility:visible;transform:translate(-50%,0)}
 .org-roles__permission-more{margin-inline-start:3px;font-size:10px;color:var(--bee-text-muted);white-space:nowrap}
 .org-roles__table-wrap{width:100%;overflow-x:auto;border:1px solid var(--bee-border);border-radius:10px}
 .org-roles__table-wrap table{width:100%;border-collapse:collapse;min-width:680px}
 .org-roles__table-wrap th{text-align:start;color:var(--bee-text-muted);font-size:10px;font-weight:650;background:color-mix(in srgb,var(--bee-text-muted) 6%,var(--bee-surface-subtle));padding:10px 12px}
 .org-roles__table-wrap td{padding:9px 12px;border-top:1px solid var(--bee-border);font-size:11px}
 .org-roles__table-wrap tbody tr{transition:background-color .16s ease}.org-roles__table-wrap tbody tr:hover{background:color-mix(in srgb,var(--bee-accent) 5%,transparent)}
 .org-roles__table-role{display:flex;align-items:center;gap:9px;white-space:nowrap}.org-roles__table-role strong{font-size:11px}
 .org-roles__table-description{max-width:320px;color:var(--bee-text-muted)}
 .org-roles__table-permission-count{font-size:9px;color:var(--bee-text-muted);margin-inline-start:3px}
 .org-roles__table-menu{position:relative}.org-roles__table-menu summary{list-style:none;cursor:pointer;width:28px;height:28px;display:grid;place-items:center;border-radius:7px;color:var(--bee-text-muted);font-size:21px;line-height:1}
 .org-roles__table-menu summary::-webkit-details-marker{display:none}.org-roles__table-menu summary:hover{background:color-mix(in srgb,var(--bee-text-muted) 12%,transparent)}
 .org-roles__sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
 .org-roles__system-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,245px),1fr));grid-auto-rows:1fr;gap:12px}
 .org-roles__system-card{position:relative;min-width:0;min-height:188px;border:1px solid var(--bee-border);border-radius:11px;background:var(--bee-surface-subtle);padding:13px;display:grid;grid-template-rows:auto minmax(48px,1fr) auto auto;gap:10px;transition:border-color .16s ease,background-color .16s ease}
 .org-roles__system-card:hover{border-color:color-mix(in srgb,var(--bee-accent) 48%,var(--bee-border));background:color-mix(in srgb,var(--bee-surface-subtle) 92%,var(--bee-accent))}
 .org-roles__card-top{display:flex;justify-content:space-between;align-items:center}
 .org-roles__role-mark{width:34px;height:34px;flex:0 0 34px;display:grid;place-items:center;border-radius:9px;background:color-mix(in srgb,var(--bee-accent) 13%,var(--bee-surface));color:var(--bee-accent);font-weight:750;font-size:14px}
 .org-roles__card-menu,.org-roles__card-menu details{position:relative}
 .org-roles__card-menu summary{list-style:none;cursor:pointer;width:28px;height:28px;display:grid;place-items:center;border-radius:7px;color:var(--bee-text-muted);font-size:21px;line-height:1}
 .org-roles__card-menu summary::-webkit-details-marker{display:none}.org-roles__card-menu summary:hover{background:color-mix(in srgb,var(--bee-text-muted) 12%,transparent);color:inherit}
 .org-roles__menu{position:absolute;z-index:5;inset-block-start:30px;inset-inline-end:0;width:190px;padding:5px;border:1px solid var(--bee-border);border-radius:9px;background:var(--bee-surface-raised);box-shadow:var(--bee-shadow);display:grid;gap:2px}
 .org-roles__menu button{display:flex;justify-content:space-between;align-items:center;gap:8px;border:0;border-radius:6px;background:transparent;color:inherit;text-align:start;padding:8px;font-size:11px}
 .org-roles__menu button:hover:not(:disabled){background:color-mix(in srgb,var(--bee-text-muted) 12%,transparent)}
 .org-roles__menu button:disabled{opacity:.42;cursor:not-allowed}.org-roles__menu button small{font-size:9px;color:var(--bee-text-muted);white-space:nowrap}
 .org-roles__card-copy{display:grid;align-content:start;gap:5px;min-width:0}.org-roles__card-copy>strong{font-size:14px;overflow-wrap:anywhere}
 .org-roles__card-copy p{font-size:11px;line-height:1.4;min-height:31px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
 .org-roles__card-meta{display:flex;align-items:center;gap:8px;border-top:1px solid var(--bee-border);padding-top:9px}
 .org-roles__permission-count{font-size:10px;color:var(--bee-text-muted);border:1px solid var(--bee-border);border-radius:5px;padding:4px 6px}
 .org-roles__status{margin-inline-start:auto;display:inline-flex;align-items:center;border-radius:20px;padding:4px 7px;background:color-mix(in srgb,var(--bee-status-success) 12%,transparent);color:var(--bee-status-success);font-size:9px;text-transform:capitalize;white-space:nowrap}
 .org-roles__status.is-inactive{background:color-mix(in srgb,var(--bee-text-muted) 14%,transparent);color:var(--bee-text-muted)}
 .org-roles__permission-preview{display:flex;align-items:center;min-width:0;min-height:28px;padding-inline-start:0;gap:0}.org-roles__permission-preview .org-roles__permission-circle{position:relative;border:2px solid var(--bee-surface-subtle);margin-inline-start:-8px}.org-roles__permission-preview .org-roles__permission-circle:first-child{margin-inline-start:0}.org-roles__permission-preview .org-roles__permission-circle:nth-child(1){z-index:3}.org-roles__permission-preview .org-roles__permission-circle:nth-child(2){z-index:2}.org-roles__permission-preview .org-roles__permission-circle:nth-child(3){z-index:1}.org-roles__permission-preview .org-roles__permission-more{position:relative;z-index:4;margin-inline-start:10px}
 .org-roles__permission-more{position:relative;z-index:4;margin-inline-start:auto;padding-inline-start:5px;font-size:10px;color:var(--bee-text-muted);white-space:nowrap}
 .org-roles__details-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:12px;border:1px solid var(--bee-border);border-radius:10px;background:var(--bee-surface-subtle)}
 .org-roles__details-summary>div{display:grid;gap:6px;align-content:start}.org-roles__detail-label{font-size:10px;color:var(--bee-text-muted)}
 .org-roles__details-permissions{margin-top:18px}.org-roles__details-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.org-roles__details-heading h3{font-size:14px}.org-roles__details-heading>span{font-size:10px;color:var(--bee-text-muted)}
 .org-roles__detail-badges{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}
 .org-roles__detail-badges>span{display:grid;gap:4px;min-width:0;padding:9px;border:1px solid var(--bee-border);border-radius:8px;background:var(--bee-surface-subtle)}
 .org-roles__detail-badges strong{font-size:11px}.org-roles__detail-badges code{font-size:9px;color:var(--bee-text-muted);overflow-wrap:anywhere}
 .org-roles__permissions-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 14px}
 .org-roles__permissions-toolbar .org-roles__result-count{font-size:10px;color:var(--bee-text-muted)}
 .org-roles__permission-groups{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:stretch;gap:14px}
 .org-roles__permission-group{display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:10px;min-width:0;min-height:250px;padding:13px;border:1px solid var(--bee-border);border-radius:12px;background:var(--bee-surface-subtle);overflow:hidden}
 .org-roles__permission-group{transition:border-color .16s ease,background-color .16s ease}
 .org-roles__permission-group:hover{border-color:color-mix(in srgb,var(--bee-accent) 48%,var(--bee-border));background:color-mix(in srgb,var(--bee-surface-subtle) 92%,var(--bee-accent))}
 .org-roles__permission-group-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-bottom:9px;border-bottom:1px solid var(--bee-border)}
 .org-roles__permission-group-heading h4{text-transform:capitalize;font-size:13px;margin:0}
 .org-roles__permission-group-heading span{font-size:9px;color:var(--bee-text-muted);white-space:nowrap}
 .org-roles__permission-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(94px,1fr));gap:8px;min-width:0}
 .org-roles__permission-tile{display:flex;flex-direction:column;align-items:flex-start;gap:5px;min-width:0;min-height:94px;padding:9px;border:1px solid var(--bee-border);border-radius:9px;background:var(--bee-surface-raised);animation:orgPermissionEnter .28s cubic-bezier(.2,.75,.25,1) both}
 .org-roles__permission-tile{transition:border-color .16s ease,background-color .16s ease,transform .16s ease}
 .org-roles__permission-tile:hover{border-color:color-mix(in srgb,var(--bee-secondary) 48%,var(--bee-border));background:color-mix(in srgb,var(--bee-surface-raised) 91%,var(--bee-secondary));transform:translateY(-1px)}
 .org-roles__permission-grid.is-previous .org-roles__permission-tile{animation-name:orgPermissionReturn}
 .org-roles__permission-tile-top{display:flex;align-items:center;justify-content:space-between;gap:5px;width:100%;min-width:0}
 .org-roles__permission-action{display:inline-flex;align-items:center;max-width:100%;padding:3px 6px;border:1px solid color-mix(in srgb,var(--bee-accent) 30%,var(--bee-border));border-radius:5px;background:color-mix(in srgb,var(--bee-accent) 9%,transparent);color:var(--bee-accent);font-size:8px;font-weight:750;letter-spacing:.045em;text-transform:uppercase;overflow-wrap:anywhere}
 .org-roles__permission-tile strong{font-size:10px;line-height:1.3;overflow-wrap:anywhere}
 .org-roles__permission-tile p{font-size:9px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
 .org-roles__permission-tile code{margin-top:auto;max-width:100%;font-size:8px;color:var(--bee-text-muted);overflow-wrap:anywhere}
 .org-roles__permission-state{font-size:8px;line-height:1.2;color:var(--bee-status-success);white-space:nowrap}
 .org-roles__permission-state.is-protected{color:var(--bee-status-warning);opacity:1}
 .org-roles__permission-pagination{display:flex;align-items:center;justify-content:center;gap:10px;min-height:27px}
 .org-roles__permission-pagination button{display:grid;place-items:center;width:27px;height:27px;padding:0;border:1px solid var(--bee-border);border-radius:7px;background:var(--bee-surface-raised);color:inherit;font-size:15px;line-height:1;transition:border-color .16s ease,background-color .16s ease,transform .16s ease}
 .org-roles__permission-pagination button:hover{border-color:var(--bee-accent);background:color-mix(in srgb,var(--bee-accent) 9%,var(--bee-surface-raised))}
 .org-roles__permission-pagination button:active{transform:translateX(1px)}
 .org-roles__permission-pagination button:focus-visible{outline:2px solid var(--bee-secondary);outline-offset:2px}
 .org-roles__permission-page-count{font-size:9px;color:var(--bee-text-muted);font-variant-numeric:tabular-nums}
 .org-roles__permission-accordions{display:grid;gap:9px}
 .org-roles__permission-accordion{min-width:0;border:1px solid var(--bee-border);border-radius:10px;background:var(--bee-surface-subtle);overflow:hidden;transition:border-color .16s ease,background-color .16s ease}
 .org-roles__permission-accordion:hover{border-color:color-mix(in srgb,var(--bee-accent) 38%,var(--bee-border))}
 .org-roles__permission-accordion-heading{margin:0}
 .org-roles__permission-accordion-trigger{display:flex;align-items:center;gap:9px;width:100%;min-height:48px;padding:10px 13px;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;transition:background-color .16s ease}
 .org-roles__permission-accordion-trigger:hover{background:color-mix(in srgb,var(--bee-surface-subtle) 88%,var(--bee-accent))}
 .org-roles__permission-accordion-trigger:focus-visible{outline:2px solid var(--bee-secondary);outline-offset:-2px}
 .org-roles__permission-accordion-symbol{display:grid;place-items:center;width:20px;height:20px;flex:0 0 20px;border:1px solid color-mix(in srgb,var(--bee-accent) 35%,var(--bee-border));border-radius:6px;color:var(--bee-accent);font-size:16px;line-height:1}
 .org-roles__permission-accordion-name{text-transform:capitalize;font-size:12px;font-weight:700}
 .org-roles__permission-accordion-count{font-size:10px;color:var(--bee-text-muted);font-variant-numeric:tabular-nums}
 .org-roles__permission-accordion-content{padding:0 10px 10px;animation:orgPermissionEnter .2s ease-out}
 .org-roles__permission-accordion-content .org-roles__permission-table-wrap{border-radius:8px}
 .org-roles__permission-table-wrap{width:100%;overflow-x:auto;border:1px solid var(--bee-border);border-radius:10px}
 .org-roles__permission-table-wrap table{width:100%;min-width:720px;border-collapse:collapse}
 .org-roles__permission-table-wrap th{padding:10px 12px;background:color-mix(in srgb,var(--bee-text-muted) 6%,var(--bee-surface-subtle));color:var(--bee-text-muted);font-size:10px;font-weight:650;text-align:start}
 .org-roles__permission-table-wrap td{padding:10px 12px;border-top:1px solid var(--bee-border);font-size:10px;vertical-align:middle}
 .org-roles__permission-table-wrap td:first-child{min-width:190px}
 .org-roles__permission-table-wrap td strong,.org-roles__permission-table-wrap td small{display:block}
 .org-roles__permission-table-wrap td small{margin-top:3px;color:var(--bee-text-muted);font-size:9px}
 .org-roles__permission-table-wrap code{font-size:9px;color:var(--bee-text-muted);overflow-wrap:anywhere}
 .org-roles__footnote{font-size:11px;margin-top:14px!important}
 @keyframes orgPermissionEnter{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:translateX(0)}}
 @keyframes orgPermissionReturn{from{opacity:0;transform:translateX(-16px)}to{opacity:1;transform:translateX(0)}}
 .org-roles__modal-backdrop{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:24px;background:var(--bee-overlay);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:orgRoleFade .16s ease-out}
 .org-roles__modal{width:min(900px,100%);max-height:min(84vh,820px);overflow:auto;border:1px solid var(--bee-border);border-radius:16px;background:var(--bee-surface-raised);box-shadow:var(--bee-shadow);padding:20px;display:grid;gap:16px;animation:orgRoleRise .2s ease-out}
 .org-roles__modal-top{display:flex;justify-content:space-between;gap:14px;align-items:center;margin:0}
 .org-roles__modal-top h2{font-size:15px;line-height:1.3;margin:3px 0 0}.org-roles__modal-top p{font-size:11px}.org-roles__modal-eyebrow{font-size:9px;letter-spacing:.15em;font-weight:700;opacity:.55}
 .org-roles__modal-close{width:34px;height:34px;flex:0 0 34px;display:grid;place-items:center;padding:0!important;font-size:18px;line-height:1;border:1px solid var(--bee-border);border-radius:8px!important;background:var(--bee-surface-subtle)}
 .org-roles__editor--modal{border:0;padding:0;background:transparent}.org-roles__editor--modal .org-roles__editor-heading{display:none}
 @keyframes orgRoleFade{from{opacity:0}to{opacity:1}}@keyframes orgRoleRise{from{opacity:0;transform:translateY(10px) scale(.99)}to{opacity:1;transform:translateY(0) scale(1)}}
 @media(prefers-reduced-motion:reduce){.org-roles__modal-backdrop,.org-roles__modal,.org-roles__permission-tile{animation:none!important;transition:none!important}}
 .org-roles__custom-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-items:start}
 .org-roles__list-heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.org-roles__list-heading strong{font-size:12px}
 .org-roles__role-card{display:grid;width:100%;grid-template-columns:minmax(0,1fr) auto;gap:5px 8px;text-align:left;margin-top:8px;padding:11px!important}
 .org-roles__role-card.active{border-color:var(--bee-accent);background:var(--bee-surface-raised)}
 .org-roles__role-card>span{min-width:0}.org-roles__role-card strong,.org-roles__role-card small{display:block}.org-roles__role-card strong{font-size:12px}.org-roles__role-card small{font-size:10px;opacity:.62;margin-top:3px;overflow-wrap:anywhere}
 .org-roles__role-card em{font-size:9px;font-style:normal;border:1px solid var(--bee-border);border-radius:20px;padding:4px 7px;align-self:start}.org-roles__role-card em.is-restriction{color:var(--bee-status-warning)}
 .org-roles__role-card .org-roles__role-meta{grid-column:1/-1}
 .org-roles__editor-heading{margin-bottom:12px}.org-roles__form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
 .org-roles__editor form>label,.org-roles__form-grid label{display:grid;gap:6px;margin:12px 0;font-size:11px;font-weight:700}
 .org-roles__editor input:not([type=checkbox]),.org-roles__editor select{width:100%;box-sizing:border-box;padding:10px 11px;border:1px solid var(--bee-border);border-radius:8px;background:var(--bee-surface-subtle);color:inherit;font-size:12px}
 .org-roles__mode-hint{font-size:11px!important;margin:7px 0 12px!important}
 .org-roles__module-builder{display:grid;gap:13px;margin:16px 0}
 .org-roles__module-search-wrap{position:relative;display:grid;gap:6px}
 .org-roles__module-search-label,.org-roles__assigned-heading{font-size:11px;font-weight:700}
 .org-roles__module-search{height:38px;display:flex;align-items:center;gap:9px;padding:0 11px;border:1px solid var(--bee-border);border-radius:9px;background:var(--bee-surface-subtle);color:inherit}
 .org-roles__module-search>span{font-size:18px;opacity:.6}.org-roles__module-search input{flex:1;min-width:0;border:0!important;outline:0;background:transparent!important;padding:0!important;color:inherit;font-size:12px}.org-roles__module-search button{padding:0 4px;border:0;background:transparent;font-size:17px}
 .org-roles__module-suggestions{position:absolute;z-index:5;top:100%;left:0;right:0;max-height:220px;overflow:auto;margin-top:4px;padding:5px;border:1px solid var(--bee-border);border-radius:10px;background:var(--bee-surface-raised);box-shadow:var(--bee-shadow)}
 .org-roles__module-suggestions button{width:100%;display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border:0;border-radius:7px;background:transparent;text-align:left}.org-roles__module-suggestions button:hover{background:var(--bee-surface-hover)}.org-roles__module-suggestions button span:first-child{display:grid;gap:2px}.org-roles__module-suggestions strong{font-size:11px}.org-roles__module-suggestions small,.org-roles__module-suggestions p{font-size:9px;opacity:.65}
 .org-roles__module-permission-card{border:1px solid var(--bee-accent);border-radius:12px;padding:13px;background:var(--bee-surface-subtle);box-shadow:0 0 0 1px color-mix(in srgb,var(--bee-accent) 10%,transparent)}
 .org-roles__module-permission-card>header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}.org-roles__module-permission-card>header h4{font-size:13px;margin:2px 0}.org-roles__module-permission-card>header p{font-size:10px}.org-roles__module-eyebrow{font-size:8px;letter-spacing:.13em;font-weight:700;color:var(--bee-accent)}
 .org-roles__module-close{width:27px;height:27px;padding:0!important;display:grid;place-items:center;border-radius:50%!important}
 .org-roles__module-permission-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
 .org-roles__module-permission{display:flex;align-items:flex-start;gap:8px;min-width:0;padding:9px;border:1px solid var(--bee-border);border-radius:8px;background:var(--bee-surface);cursor:pointer}
 .org-roles__module-permission input{margin:2px 0 0;accent-color:var(--bee-accent)}.org-roles__module-permission>span{flex:1;min-width:0}.org-roles__module-permission strong,.org-roles__module-permission small,.org-roles__module-permission code{display:block}.org-roles__module-permission strong{font-size:10px}.org-roles__module-permission small,.org-roles__module-permission code{margin-top:3px;font-size:9px;opacity:.65}.org-roles__module-permission code{overflow-wrap:anywhere}.org-roles__module-permission em{font-size:8px;color:var(--bee-status-warning);font-style:normal;white-space:nowrap}
 .org-roles__module-permission-card>footer{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:11px;padding-top:10px;border-top:1px solid var(--bee-border);font-size:10px;opacity:.8}.org-roles__module-permission-card>footer button{font-size:10px;padding:7px 12px}
 .org-roles__assigned-modules{display:grid;gap:8px}.org-roles__assigned-heading{display:flex;justify-content:space-between;align-items:center}.org-roles__assigned-heading span{font-size:9px;opacity:.6;font-weight:500}
 .org-roles__module-chip-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}
 .org-roles__module-chip{height:34px;min-width:0;display:flex;align-items:center;gap:5px;padding:0 6px;border:1px solid var(--bee-border);border-radius:8px;background:var(--bee-surface-subtle);transition:border-color .16s ease,background .16s ease}
 .org-roles__module-chip:hover{border-color:var(--bee-accent);background:color-mix(in srgb,var(--bee-accent) 8%,var(--bee-surface-subtle))}
 .org-roles__module-chip button{width:21px;height:21px;flex:0 0 21px;display:grid;place-items:center;padding:0;border:0;border-radius:6px;background:transparent;font-size:13px;line-height:1}.org-roles__module-chip button:hover{background:var(--bee-surface-hover);color:var(--bee-accent)}.org-roles__module-chip .org-roles__module-chip-remove:hover{color:var(--bee-status-danger)}
 .org-roles__module-chip-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;font-weight:650}.org-roles__module-chip-count{font-size:9px;opacity:.6;font-variant-numeric:tabular-nums}.org-roles__module-empty{padding:10px;border:1px dashed var(--bee-border);border-radius:8px;font-size:10px!important}
 .org-roles__permission{display:flex;align-items:flex-start;gap:9px;padding:10px 0;border-top:1px solid var(--bee-border);font-size:11px}
 .org-roles__permission input{margin-top:3px;accent-color:var(--bee-accent)}.org-roles__permission span{flex:1;min-width:0}
 .org-roles__permission strong,.org-roles__permission small,.org-roles__permission code{display:block}.org-roles__permission small,.org-roles__permission code{font-size:9px;opacity:.65;margin-top:3px}.org-roles__permission code{overflow-wrap:anywhere}
 .org-roles__permission em{font-size:9px;color:var(--bee-status-warning);font-style:normal;white-space:nowrap}
 .org-roles__actions{display:flex;gap:8px;flex-wrap:wrap;padding-top:14px;border-top:1px solid var(--bee-border)}
 .org-roles__primary{background:var(--bee-accent)!important;color:var(--bee-accent-text)!important;border-color:var(--bee-accent)!important}
 .org-roles__error{color:var(--bee-status-danger)!important;opacity:1!important}.org-roles__success{color:var(--bee-status-success)!important;opacity:1!important}
 .org-roles__notice,.org-roles__empty{padding:12px;border:1px solid var(--bee-border);border-radius:9px;background:var(--bee-surface-subtle);font-size:11px}
 @media(max-width:760px){.org-roles__header,.org-roles__section-heading,.org-roles__editor-heading{align-items:flex-start;flex-direction:column}.org-roles__permission-groups,.org-roles__module-permission-grid,.org-roles__form-grid,.org-roles__detail-badges{grid-template-columns:1fr}.org-roles__module-chip-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.org-roles__permission-group{min-height:230px}.org-roles__details-summary{grid-template-columns:1fr}}
 @media(max-width:600px){.org-roles__toolbar{align-items:stretch}.org-roles__search{width:auto;flex:1;min-width:0}.org-roles__collection-header{justify-content:space-between}.org-roles__table-wrap table{min-width:620px}}
 @media(max-width:520px){.org-roles__tab-panel{padding:13px}.org-roles__tabs{padding:0 4px}.org-roles__tabs button{padding:12px 8px}.org-roles__modal-backdrop{padding:12px}.org-roles__modal{max-height:min(90vh,820px)}.org-roles__permission-group{padding:10px}.org-roles__permission-tile{padding:8px}}
 `]

})
export class OrganizationRolesComponent implements OnChanges{
 @Input() tenantId="";@Input() role="member";@Input() accessToken="";
 activeTab:"system"|"permissions"|"audit"="system";
 roles:CustomRole[]=[];systemRoles:SystemRole[]=[];systemSearch="";roleSourceFilter:"all"|"native"|"created"="all";systemView:"cards"|"table"="cards";selectedSystemRole:SystemRole|null=null;name="";description="";mode:"grant"|"restriction"="grant";editingId="";loading=false;busy=false;error="";message="";modalOpen=false;
 permissions:PermissionOption[]=[];permissionView:"cards"|"table"="cards";permissionPages:Record<string,number>={};permissionDirections:Record<string,"next"|"previous">={};expandedPermissionGroup:string|null=null;
 moduleSearch="";activePermissionModule:string|null=null;
 private tenantAssignablePermissions:string[]=[];
 get canManage():boolean{return this.role==="owner"||this.role==="super_admin";}
 get canReadAudit():boolean{return this.role==="owner"||this.role==="admin"||this.role==="super_admin";}
 get groups():string[]{return [...new Set(this.permissions.map(p=>p.group))];}
 get matchingPermissionModules():string[]{const query=this.moduleSearch.trim().toLowerCase();return this.groups.filter(group=>!this.selectedPermissionModules.includes(group)&&group.toLowerCase().includes(query));}
 get selectedPermissionModules():string[]{return this.groups.filter(group=>this.inGroup(group).some(item=>item.selected));}
 selectedCountForModule(group:string):number{return this.inGroup(group).filter(item=>item.selected).length;}
 openPermissionModule(group:string):void{this.activePermissionModule=group;this.moduleSearch="";}
 closePermissionModule():void{this.activePermissionModule=null;this.moduleSearch="";}
 removePermissionModule(group:string):void{for(const item of this.inGroup(group))item.selected=false;if(this.activePermissionModule===group)this.closePermissionModule();}
 get filteredSystemRoles():SystemRole[]{const native=this.roleSourceFilter==="created"?[]:this.systemRoles;const created=this.roleSourceFilter==="native"?[]:this.roles.map(item=>({key:item.id,label:item.name,description:item.description||"Organization-created role",protected:false,permissions:item.permissions,active:true,custom:true,customId:item.id}));const query=this.systemSearch.trim().toLowerCase();return [...native,...created].filter(item=>!query||item.label.toLowerCase().includes(query)||item.description.toLowerCase().includes(query)||item.permissions.some(key=>key.toLowerCase().includes(query)||this.permissionLabel(key).toLowerCase().includes(query)));}
 inGroup(group:string):PermissionOption[]{return this.permissions.filter(p=>p.group===group);}
 togglePermissionGroup(group:string):void{this.expandedPermissionGroup=this.expandedPermissionGroup===group?null:group;}
 permissionPage(group:string):number{return this.permissionPages[group]||0;}
 permissionPageCount(group:string):number{return Math.ceil(this.inGroup(group).length/4);}
 permissionPageItems(group:string):PermissionOption[]{const start=this.permissionPage(group)*4;return this.inGroup(group).slice(start,start+4);}
 changePermissionPage(group:string,direction:-1|1):void{const next=Math.max(0,Math.min(this.permissionPageCount(group)-1,this.permissionPage(group)+direction));if(next===this.permissionPage(group))return;this.permissionDirections={...this.permissionDirections,[group]:direction>0?"next":"previous"};this.permissionPages={...this.permissionPages,[group]:next};}
 trackPermission(_index:number,item:PermissionOption):string{return item.key;}
 canGrant(item:PermissionOption):boolean{return item.customRoleAssignable&&this.tenantAssignablePermissions.includes(item.key);}
 updateMode(mode:"grant"|"restriction"):void{const previous=this.mode;this.mode=mode;const allowed=new Set<string>(this.tenantAssignablePermissions);for(const p of this.permissions)p.assignable=mode==="restriction"||(p.customRoleAssignable&&allowed.has(p.key));if(!this.editingId&&previous!==mode){for(const p of this.permissions)p.selected=mode==="grant"&&["members.read","plugins.read"].includes(p.key)&&p.assignable;}}
 ngOnChanges(changes:SimpleChanges):void{if(changes["tenantId"]||changes["role"]||changes["accessToken"]){this.reset();if(!this.canReadAudit&&this.activeTab==="audit")this.activeTab="system";void this.load();}}
 trackRole(_i:number,item:CustomRole):string{return item.id;}
 private async request(path:string,method="GET",body?:unknown):Promise<any>{const response=await fetch("/api"+path,{method,headers:{authorization:"Bearer "+this.accessToken,...(body?{"content-type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw new Error(result.error||"Role request failed");return result;}
 async load():Promise<void>{if(!this.tenantId||!this.accessToken)return;this.loading=true;this.error="";try{const result=await this.request("/companies/"+encodeURIComponent(this.tenantId)+"/roles");this.roles=result.roles||[];this.systemRoles=result.systemRoles||[];this.tenantAssignablePermissions=Array.isArray(result.tenantAssignablePermissions)?result.tenantAssignablePermissions:[];const allowed=new Set<string>(this.tenantAssignablePermissions);const selected=new Set(this.permissions.filter(permission=>permission.selected).map(permission=>permission.key));this.permissions=(Array.isArray(result.permissionCatalog)?result.permissionCatalog:[]).map((item:any)=>({key:item.key,label:item.label,group:String(item.resource||item.module||"Core").replace(/^./,letter=>letter.toUpperCase()),action:item.action||"manage",description:item.description||"",sensitive:!!item.sensitive,customRoleAssignable:!!item.customRoleAssignable,assignable:this.mode==="restriction"||!!item.customRoleAssignable&&allowed.has(item.key),selected:selected.has(item.key)||(selected.size===0&&["members.read","plugins.read"].includes(item.key))}));}catch(error){this.error=error instanceof Error?error.message:"Could not load roles";}finally{this.loading=false;}}
 permissionLabel(key:string):string{return this.permissions.find(item=>item.key===key)?.label||key;}
 permissionInitials(label:string):string{return label.trim().split(/\s+/).filter(Boolean).slice(0,2).map(word=>word.charAt(0).toUpperCase()).join("");}
 createCustomRole():void{this.activeTab="audit";this.openCreate();}
 editCatalogRole(item:SystemRole):void{const role=this.roles.find(candidate=>candidate.id===item.customId);if(!role)return;this.activeTab="audit";this.edit(role);}
 openSystemRole(item:SystemRole):void{this.selectedSystemRole=item;}
 closeSystemRole():void{this.selectedSystemRole=null;}
 openCreate():void{this.reset();this.modalOpen=true;this.moduleSearch="";this.activePermissionModule=null;}
 closeModal():void{this.modalOpen=false;this.moduleSearch="";this.activePermissionModule=null;}
 @HostListener("document:keydown.escape") onEscape():void{if(this.selectedSystemRole)this.closeSystemRole();else if(this.modalOpen)this.closeModal();}
 edit(item:CustomRole):void{this.modalOpen=true;this.editingId=item.id;this.name=item.name;this.description=item.description||"";this.mode=item.mode??"grant";this.updateMode(this.mode);for(const p of this.permissions)p.selected=item.permissions.includes(p.key);this.moduleSearch="";this.activePermissionModule=null;this.error="";this.message="";}
 reset():void{this.modalOpen=false;this.editingId="";this.name="";this.description="";this.mode="grant";this.updateMode(this.mode);for(const p of this.permissions)p.selected=["members.read","plugins.read"].includes(p.key)&&p.assignable;this.moduleSearch="";this.activePermissionModule=null;this.error="";this.message="";}
 async save(event:Event):Promise<void>{event.preventDefault();if(!this.canManage||this.busy||!this.name.trim())return;this.busy=true;this.error="";this.message="";const body={name:this.name.trim(),description:this.description.trim(),mode:this.mode,permissions:this.permissions.filter(p=>p.selected&&p.assignable).map(p=>p.key)};try{if(this.editingId)await this.request("/companies/"+encodeURIComponent(this.tenantId)+"/roles/"+encodeURIComponent(this.editingId),"PUT",body);else await this.request("/companies/"+encodeURIComponent(this.tenantId)+"/roles","POST",body);this.message=this.editingId?"Role updated.":"Role created.";this.reset();await this.load();}catch(error){this.error=error instanceof Error?error.message:"Could not save role";}finally{this.busy=false;}}
 async remove():Promise<void>{if(!this.canManage||!this.editingId||this.busy)return;this.busy=true;this.error="";this.message="";try{await this.request("/companies/"+encodeURIComponent(this.tenantId)+"/roles/"+encodeURIComponent(this.editingId),"DELETE");this.message="Role deleted.";this.reset();await this.load();}catch(error){this.error=error instanceof Error?error.message:"Could not delete role";}finally{this.busy=false;}}
}
