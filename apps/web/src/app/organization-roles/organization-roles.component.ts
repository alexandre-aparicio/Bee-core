import { CommonModule } from "@angular/common";
import { Component, HostListener, Input, OnChanges, SimpleChanges } from "@angular/core";
import { FormsModule } from "@angular/forms";
type CustomRole={id:string;name:string;description:string;permissions:string[];mode?:"grant"|"restriction"};
type SystemRole={key:string;label:string;description:string;protected:boolean;permissions:string[];active?:boolean};
type PermissionOption={key:string;label:string;group:string;action:string;description:string;sensitive?:boolean;customRoleAssignable:boolean;assignable:boolean;selected:boolean};

@Component({
 selector:"bee-organization-roles",standalone:true,imports:[CommonModule,FormsModule],
 template:`
 <section class="org-roles">
  <header class="org-roles__header org-roles__header--actions"><button type="button" (click)="load()" [disabled]="loading||busy">Refresh</button></header>
  <p class="org-roles__error" *ngIf="error" role="alert">{{error}}</p><p class="org-roles__success" *ngIf="message" role="status">{{message}}</p>
  <p class="org-roles__notice" *ngIf="!canManage">You can view roles. Only the organization owner or Super Admin can create, edit or delete custom roles.</p>
  <nav class="org-roles__tabs" aria-label="Roles and permissions sections">
   <button type="button" [class.is-active]="activeTab==='system'" [attr.aria-selected]="activeTab==='system'" (click)="activeTab='system'"><span>01</span>System Roles <small>{{systemRoles.length}}</small></button>
   <button type="button" [class.is-active]="activeTab==='permissions'" [attr.aria-selected]="activeTab==='permissions'" (click)="activeTab='permissions'"><span>02</span>Available Permissions <small>{{permissions.length}}</small></button>
   <button type="button" [class.is-active]="activeTab==='custom'" [attr.aria-selected]="activeTab==='custom'" (click)="activeTab='custom'"><span>03</span>Custom Roles <small>{{roles.length}}</small></button>
  </nav>
  <section class="org-roles__tab-panel" *ngIf="activeTab==='system'">
   <div class="org-roles__section-heading"><div><h3>System roles</h3><p>Built-in roles maintained by Core. Their baseline permissions and protected boundaries cannot be replaced by custom roles.</p></div><span class="org-roles__section-tag">Core managed</span></div>
   <div class="org-roles__collection-header">
    <div class="teams-workspace__view-toggle" role="group" aria-label="Role view">
     <button type="button" [class.is-active]="systemView==='cards'" [attr.aria-pressed]="systemView==='cards'" (click)="systemView='cards'" aria-label="Card view" title="Card view"><span aria-hidden="true">▦</span></button>
     <button type="button" [class.is-active]="systemView==='table'" [attr.aria-pressed]="systemView==='table'" (click)="systemView='table'" aria-label="Table view" title="Table view"><span aria-hidden="true">☷</span></button>
    </div>
    <button type="button" class="documents__button documents__button--secondary" *ngIf="canManage" (click)="createCustomRole()">Create role</button>
   </div>
   <div class="org-roles__toolbar">
    <div class="org-roles__search"><span aria-hidden="true">⌕</span><input [(ngModel)]="systemSearch" name="systemRoleSearch" placeholder="Search roles…" aria-label="Search system roles"><button *ngIf="systemSearch" type="button" (click)="systemSearch=''" aria-label="Clear search">×</button></div>
    <span class="org-roles__result-count">{{filteredSystemRoles.length}} {{filteredSystemRoles.length===1?'role':'roles'}}</span>
   </div>
   <div class="org-roles__system-grid" *ngIf="filteredSystemRoles.length && systemView==='cards'">
    <article class="org-roles__system-card" *ngFor="let item of filteredSystemRoles">
     <div class="org-roles__card-top"><span class="org-roles__role-mark">{{item.label.slice(0,1).toUpperCase()}}</span><div class="org-roles__card-menu"><details><summary [attr.aria-label]="'Options for '+item.label" [attr.title]="'Options for '+item.label"><span>⋮</span></summary><div class="org-roles__menu" role="menu"><button type="button" role="menuitem" (click)="openSystemRole(item)">View details</button><button type="button" role="menuitem" disabled>Edit role <small>Coming soon</small></button><button type="button" role="menuitem" disabled>Deactivate role <small>Coming soon</small></button><button type="button" role="menuitem" disabled>Delete role <small>Coming soon</small></button></div></details></div></div>
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
      <td><details class="org-roles__table-menu"><summary [attr.aria-label]="'Options for '+item.label">⋮</summary><div class="org-roles__menu" role="menu"><button type="button" role="menuitem" (click)="openSystemRole(item)">View details</button><button type="button" role="menuitem" disabled>Edit role <small>Coming soon</small></button><button type="button" role="menuitem" disabled>Deactivate role <small>Coming soon</small></button><button type="button" role="menuitem" disabled>Delete role <small>Coming soon</small></button></div></details></td>
     </tr>
    </tbody></table>
   </div>
   <div *ngIf="!loading && !filteredSystemRoles.length" class="org-roles__empty"><strong>{{systemRoles.length?'No matching roles':'No system roles available'}}</strong><span>{{systemRoles.length?'Try another search term.':'The system role catalogue is currently empty.'}}</span><button *ngIf="systemSearch" type="button" class="teams-workspace__text-button" (click)="systemSearch=''">Clear search</button></div>
   <div class="org-roles__modal-backdrop" *ngIf="selectedSystemRole" (click)="closeSystemRole()">
    <section class="org-roles__modal org-roles__details-modal" role="dialog" aria-modal="true" aria-labelledby="org-system-role-title" (click)="$event.stopPropagation()" (keydown.escape)="closeSystemRole()" tabindex="-1">
     <header class="org-roles__modal-top"><div><span class="org-roles__modal-eyebrow">SYSTEM ROLE · CORE MANAGED</span><h2 id="org-system-role-title">{{selectedSystemRole.label}}</h2><p>{{selectedSystemRole.description}}</p></div><button type="button" class="org-roles__modal-close" aria-label="Close dialog" (click)="closeSystemRole()">×</button></header>
     <div class="org-roles__details-summary"><div><span class="org-roles__detail-label">Role status</span><span class="org-roles__status" [class.is-inactive]="selectedSystemRole.active===false">{{selectedSystemRole.active===false?'Inactive':'Active'}}</span></div><div><span class="org-roles__detail-label">Permissions</span><strong>{{selectedSystemRole.permissions.length}}</strong></div><div><span class="org-roles__detail-label">Protection</span><strong>{{selectedSystemRole.protected?'Protected by Core':'Standard system role'}}</strong></div></div>
     <section class="org-roles__details-permissions"><div class="org-roles__details-heading"><h3>Assigned permissions</h3><span>{{selectedSystemRole.permissions.length}} total</span></div><div class="org-roles__detail-badges"><span *ngFor="let permission of selectedSystemRole.permissions"><strong>{{permissionLabel(permission)}}</strong><code>{{permission}}</code></span><p *ngIf="!selectedSystemRole.permissions.length">No explicit permission keys are listed for this role.</p></div></section>
    </section>
   </div>
  </section>
  <section class="org-roles__tab-panel" *ngIf="activeTab==='permissions'">
   <div class="org-roles__section-heading"><div><h3>Available permissions</h3><p>Core capabilities that can be reviewed and, subject to platform policy, assigned to custom grant roles. Restriction roles can deny permissions without granting new access.</p></div><span class="org-roles__section-tag">{{permissions.length}} registered</span></div>
   <div *ngIf="loading" class="org-roles__empty">Loading permission catalogue…</div>
   <div class="org-roles__permission-groups">
    <section class="org-roles__permission-group" *ngFor="let group of groups"><h4>{{group}}</h4>
     <article class="org-roles__permission-card" *ngFor="let item of inGroup(group)">
      <div class="org-roles__permission-copy"><strong>{{item.label}}</strong><small>{{item.action}} · {{item.description}}</small><code>{{item.key}}</code></div>
      <span class="org-roles__permission-state" [class.is-protected]="!canGrant(item)">{{canGrant(item)?'Grantable by custom roles':'Restriction only / protected'}}</span>
     </article>
    </section>
   </div>
   <p class="org-roles__footnote">The global delegation policy controls which capabilities may be granted to tenant custom roles. Protected capabilities remain unavailable for grants. Backend authorization remains authoritative.</p>
  </section>
  <section class="org-roles__tab-panel" *ngIf="activeTab==='custom'">
   <div class="org-roles__section-heading"><div><h3>Custom roles</h3><p>Create reusable permission profiles or additional restrictions. Denials always take priority over permissions granted by the primary role.</p></div><button *ngIf="canManage" type="button" class="org-roles__primary" (click)="openCreate()">+ Create custom role</button></div>
   <div class="org-roles__custom-layout">
    <aside class="org-roles__custom-list">
     <div class="org-roles__list-heading"><strong>Saved roles</strong><span>{{roles.length}}</span></div>
     <p *ngIf="loading">Loading roles…</p><p *ngIf="!loading&&!roles.length" class="org-roles__empty">No custom roles yet. Create one to define reusable access.</p>
     <button class="org-roles__role-card" *ngFor="let item of roles;trackBy:trackRole" type="button" [class.active]="editingId===item.id" (click)="edit(item)"><span><strong>{{item.name}}</strong><small>{{item.description||'No description'}}</small></span><em [class.is-restriction]="item.mode==='restriction'">{{item.mode==='restriction'?'Restriction':'Grant'}}</em><small class="org-roles__role-meta">{{item.permissions.length}} {{item.mode==='restriction'?'denials':'permissions'}}</small></button>
    </aside>
    
   </div>

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
      <div class="org-roles__groups"><section *ngFor="let group of groups"><h4>{{group}}</h4>
       <label class="org-roles__permission" *ngFor="let item of inGroup(group)"><input type="checkbox" [checked]="item.selected" (change)="item.selected=$any($event.target).checked" [disabled]="!canManage||!item.assignable"><span><strong>{{item.label}}</strong><small>{{item.action}} · {{item.description}}</small><code>{{item.key}}</code></span><em *ngIf="!item.assignable">System protected</em><em *ngIf="item.assignable&&item.sensitive">Sensitive</em></label>
      </section></div>
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
 .org-roles button{border:1px solid var(--border,#8885);border-radius:9px;padding:9px 13px;background:var(--panel,#8881);color:inherit;cursor:pointer}
 .org-roles button:disabled{opacity:.5;cursor:not-allowed}
 .org-roles__tabs{display:flex;gap:4px;padding:0 14px;margin:2px 0 0;border-bottom:1px solid var(--border,#8885);overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;scrollbar-color:var(--purple,#8c72ff) transparent;scrollbar-gutter:stable}
 .org-roles__tabs::-webkit-scrollbar{height:3px}.org-roles__tabs::-webkit-scrollbar-thumb{background:var(--purple,#8c72ff);border-radius:999px}
 .org-roles__tabs button{flex:1;min-width:max-content;display:flex;align-items:center;justify-content:center;gap:8px;padding:13px 12px;border:0;border-bottom:2px solid transparent;border-radius:0;background:transparent;color:inherit;font-size:11px;font-weight:600;opacity:.64;white-space:nowrap}
 .org-roles__tabs button>span{font-size:9px;opacity:.55}.org-roles__tabs button small{font-size:10px;border:1px solid var(--border,#8885);border-radius:20px;padding:2px 6px;opacity:.75}
 .org-roles__tabs button.is-active{border-bottom-color:var(--purple,#8c72ff);color:var(--purple,#8c72ff);opacity:1}
 .org-roles__tab-panel{min-width:0;border:1px solid var(--border,#8885);border-radius:15px;padding:20px;background:var(--panel,rgba(130,145,170,.045))}
 .org-roles__section-heading{align-items:center;margin-bottom:16px}.org-roles__section-heading p,.org-roles__editor-heading p{font-size:12px;max-width:780px}
 .org-roles__section-tag,.org-roles__permission-count,.org-roles__list-heading>span{font-size:10px;border:1px solid var(--border,#8885);border-radius:30px;padding:6px 9px;white-space:nowrap;opacity:.75}
 .org-roles__collection-header{display:flex;align-items:center;justify-content:flex-end;gap:12px;margin-bottom:14px}
 .org-roles__toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
 .org-roles__search{display:flex;align-items:center;gap:8px;width:min(100%,340px);height:36px;padding:0 10px;border:1px solid var(--border,#8885);border-radius:8px;background:var(--surface,rgba(130,145,170,.035));color:var(--muted,inherit)}
 .org-roles__search>span{font-size:20px}.org-roles__search input{border:0;outline:0;min-width:0;flex:1;background:transparent;color:inherit;font-size:12px}
 .org-roles__search input::placeholder{color:var(--muted,inherit)}.org-roles__search:focus-within{border-color:var(--purple,#8c72ff);box-shadow:0 0 0 2px color-mix(in srgb,var(--purple,#8c72ff) 20%,transparent)}
 .org-roles__search button{border:0;background:transparent;color:inherit;font-size:16px;padding:0 4px}
 .org-roles__result-count{font-size:10px;color:var(--muted,inherit);white-space:nowrap}
 .org-roles__permission-preview{display:flex;align-items:center;gap:7px;min-width:0;min-height:26px}
 .org-roles__permission-circle{position:relative;width:28px;height:28px;flex:0 0 28px;display:grid;place-items:center;border:1px solid var(--border,#8885);border-radius:50%;background:var(--surface-raised,var(--panel));color:var(--purple,#8c72ff);font-size:9px;font-weight:750;letter-spacing:.02em;cursor:help;transition:border-color .16s ease,background-color .16s ease}
 .org-roles__permission-circle:hover,.org-roles__permission-circle:focus-visible{border-color:var(--purple,#8c72ff);background:color-mix(in srgb,var(--purple,#8c72ff) 12%,var(--surface-raised,var(--panel)))}
 .org-roles__permission-circle::after{content:attr(data-tooltip);position:absolute;z-index:20;inset-block-end:calc(100% + 8px);inset-inline-start:50%;transform:translate(-50%,4px);padding:6px 9px;border:1px solid var(--border,#8885);border-radius:7px;background:var(--surface-raised,var(--panel));box-shadow:var(--bee-shadow);color:inherit;font-size:10px;font-weight:600;white-space:nowrap;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .12s ease,transform .12s ease}
 .org-roles__permission-circle:hover::after,.org-roles__permission-circle:focus-visible::after{opacity:1;visibility:visible;transform:translate(-50%,0)}
 .org-roles__permission-more{margin-inline-start:3px;font-size:10px;color:var(--muted,inherit);white-space:nowrap}
 .org-roles__table-wrap{width:100%;overflow-x:auto;border:1px solid var(--border,#8885);border-radius:10px}
 .org-roles__table-wrap table{width:100%;border-collapse:collapse;min-width:680px}
 .org-roles__table-wrap th{text-align:start;color:var(--muted,inherit);font-size:10px;font-weight:650;background:color-mix(in srgb,var(--muted,#888) 6%,var(--surface,transparent));padding:10px 12px}
 .org-roles__table-wrap td{padding:9px 12px;border-top:1px solid var(--border,#8885);font-size:11px}
 .org-roles__table-wrap tbody tr{transition:background-color .16s ease}.org-roles__table-wrap tbody tr:hover{background:color-mix(in srgb,var(--purple,#8c72ff) 5%,transparent)}
 .org-roles__table-role{display:flex;align-items:center;gap:9px;white-space:nowrap}.org-roles__table-role strong{font-size:11px}
 .org-roles__table-description{max-width:320px;color:var(--muted,inherit)}
 .org-roles__table-permission-count{font-size:9px;color:var(--muted,inherit);margin-inline-start:3px}
 .org-roles__table-menu{position:relative}.org-roles__table-menu summary{list-style:none;cursor:pointer;width:28px;height:28px;display:grid;place-items:center;border-radius:7px;color:var(--muted,inherit);font-size:21px;line-height:1}
 .org-roles__table-menu summary::-webkit-details-marker{display:none}.org-roles__table-menu summary:hover{background:color-mix(in srgb,var(--muted,#888) 12%,transparent)}
 .org-roles__sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
 .org-roles__system-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,245px),1fr));grid-auto-rows:1fr;gap:12px}
 .org-roles__system-card{position:relative;min-width:0;min-height:188px;border:1px solid var(--border,#8885);border-radius:11px;background:var(--surface,rgba(130,145,170,.035));padding:13px;display:grid;grid-template-rows:auto minmax(48px,1fr) auto auto;gap:10px;transition:border-color .16s ease,background-color .16s ease}
 .org-roles__system-card:hover{border-color:color-mix(in srgb,var(--purple,#8c72ff) 48%,var(--border,#8885));background:color-mix(in srgb,var(--surface,rgba(130,145,170,.035)) 92%,var(--purple,#8c72ff))}
 .org-roles__card-top{display:flex;justify-content:space-between;align-items:center}
 .org-roles__role-mark{width:34px;height:34px;flex:0 0 34px;display:grid;place-items:center;border-radius:9px;background:color-mix(in srgb,var(--purple,#8c72ff) 13%,var(--panel,#8882));color:var(--purple,#8c72ff);font-weight:750;font-size:14px}
 .org-roles__card-menu,.org-roles__card-menu details{position:relative}
 .org-roles__card-menu summary{list-style:none;cursor:pointer;width:28px;height:28px;display:grid;place-items:center;border-radius:7px;color:var(--muted,inherit);font-size:21px;line-height:1}
 .org-roles__card-menu summary::-webkit-details-marker{display:none}.org-roles__card-menu summary:hover{background:color-mix(in srgb,var(--muted,#888) 12%,transparent);color:inherit}
 .org-roles__menu{position:absolute;z-index:5;inset-block-start:30px;inset-inline-end:0;width:190px;padding:5px;border:1px solid var(--border,#8885);border-radius:9px;background:var(--surface-raised,var(--panel));box-shadow:var(--bee-shadow);display:grid;gap:2px}
 .org-roles__menu button{display:flex;justify-content:space-between;align-items:center;gap:8px;border:0;border-radius:6px;background:transparent;color:inherit;text-align:start;padding:8px;font-size:11px}
 .org-roles__menu button:hover:not(:disabled){background:color-mix(in srgb,var(--muted,#888) 12%,transparent)}
 .org-roles__menu button:disabled{opacity:.42;cursor:not-allowed}.org-roles__menu button small{font-size:9px;color:var(--muted);white-space:nowrap}
 .org-roles__card-copy{display:grid;align-content:start;gap:5px;min-width:0}.org-roles__card-copy>strong{font-size:14px;overflow-wrap:anywhere}
 .org-roles__card-copy p{font-size:11px;line-height:1.4;min-height:31px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
 .org-roles__card-meta{display:flex;align-items:center;gap:8px;border-top:1px solid var(--border,#8885);padding-top:9px}
 .org-roles__permission-count{font-size:10px;color:var(--muted,inherit);border:1px solid var(--border,#8885);border-radius:5px;padding:4px 6px}
 .org-roles__status{margin-inline-start:auto;display:inline-flex;align-items:center;border-radius:20px;padding:4px 7px;background:color-mix(in srgb,var(--bee-status-success,#299d70) 12%,transparent);color:var(--bee-status-success,#299d70);font-size:9px;text-transform:capitalize;white-space:nowrap}
 .org-roles__status.is-inactive{background:color-mix(in srgb,var(--muted,#888) 14%,transparent);color:var(--muted,#888)}
 .org-roles__permission-preview{display:flex;align-items:center;min-width:0;min-height:22px;padding-inline-start:0}
 .org-roles__permission-preview code{position:relative;display:block;flex:0 0 112px;max-width:112px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-inline-start:-78px;padding:5px 7px;border:1px solid var(--border,#8885);border-radius:6px;background:var(--surface-raised,var(--panel));font-size:9px;color:inherit}
 .org-roles__permission-preview code:first-child{margin-inline-start:0}
 .org-roles__permission-more{position:relative;z-index:4;margin-inline-start:auto;padding-inline-start:5px;font-size:10px;color:var(--muted,inherit);white-space:nowrap}
 .org-roles__details-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:12px;border:1px solid var(--border,#8885);border-radius:10px;background:var(--surface,transparent)}
 .org-roles__details-summary>div{display:grid;gap:6px;align-content:start}.org-roles__detail-label{font-size:10px;color:var(--muted,inherit)}
 .org-roles__details-permissions{margin-top:18px}.org-roles__details-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.org-roles__details-heading h3{font-size:14px}.org-roles__details-heading>span{font-size:10px;color:var(--muted,inherit)}
 .org-roles__detail-badges{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}
 .org-roles__detail-badges>span{display:grid;gap:4px;min-width:0;padding:9px;border:1px solid var(--border,#8885);border-radius:8px;background:var(--surface,transparent)}
 .org-roles__detail-badges strong{font-size:11px}.org-roles__detail-badges code{font-size:9px;color:var(--muted,inherit);overflow-wrap:anywhere}
 .org-roles__permission-groups{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
 .org-roles__permission-group h4{text-transform:capitalize;font-size:13px;margin-bottom:10px}
 .org-roles__permission-card{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:11px 0;border-top:1px solid var(--border,#8884)}
 .org-roles__permission-copy{min-width:0;flex:1}.org-roles__permission-copy strong,.org-roles__permission-copy small,.org-roles__permission-copy code{display:block}
 .org-roles__permission-copy strong{font-size:12px}.org-roles__permission-copy small{font-size:10px;opacity:.65;margin:3px 0}.org-roles__permission-copy code{font-size:9px;opacity:.55;overflow-wrap:anywhere}
 .org-roles__permission-state{font-size:9px;white-space:nowrap;opacity:.68}.org-roles__permission-state.is-protected{color:var(--warning,#c58a35);opacity:1}
 .org-roles__footnote{font-size:11px;margin-top:14px!important}
 .org-roles__modal-backdrop{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:24px;background:var(--bee-overlay);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:orgRoleFade .16s ease-out}
 .org-roles__modal{width:min(760px,100%);max-height:min(84vh,820px);overflow:auto;border:1px solid var(--border,#8885);border-radius:16px;background:var(--surface-raised,var(--panel));box-shadow:var(--bee-shadow);padding:20px;display:grid;gap:16px;animation:orgRoleRise .2s ease-out}
 .org-roles__modal-top{display:flex;justify-content:space-between;gap:14px;align-items:center;margin:0}
 .org-roles__modal-top h2{font-size:15px;line-height:1.3;margin:3px 0 0}.org-roles__modal-top p{font-size:11px}.org-roles__modal-eyebrow{font-size:9px;letter-spacing:.15em;font-weight:700;opacity:.55}
 .org-roles__modal-close{width:34px;height:34px;flex:0 0 34px;display:grid;place-items:center;padding:0!important;font-size:18px;line-height:1;border:1px solid var(--border,#8885);border-radius:8px!important;background:var(--surface,transparent)}
 .org-roles__editor--modal{border:0;padding:0;background:transparent}.org-roles__editor--modal .org-roles__editor-heading{display:none}
 @keyframes orgRoleFade{from{opacity:0}to{opacity:1}}@keyframes orgRoleRise{from{opacity:0;transform:translateY(10px) scale(.99)}to{opacity:1;transform:translateY(0) scale(1)}}
 @media(prefers-reduced-motion:reduce){.org-roles__modal-backdrop,.org-roles__modal{animation:none}}
 .org-roles__custom-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-items:start}
 .org-roles__list-heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.org-roles__list-heading strong{font-size:12px}
 .org-roles__role-card{display:grid;width:100%;grid-template-columns:minmax(0,1fr) auto;gap:5px 8px;text-align:left;margin-top:8px;padding:11px!important}
 .org-roles__role-card.active{border-color:var(--purple,#8c72ff);background:var(--surface-raised,#8882)}
 .org-roles__role-card>span{min-width:0}.org-roles__role-card strong,.org-roles__role-card small{display:block}.org-roles__role-card strong{font-size:12px}.org-roles__role-card small{font-size:10px;opacity:.62;margin-top:3px;overflow-wrap:anywhere}
 .org-roles__role-card em{font-size:9px;font-style:normal;border:1px solid var(--border,#8885);border-radius:20px;padding:4px 7px;align-self:start}.org-roles__role-card em.is-restriction{color:var(--warning,#c58a35)}
 .org-roles__role-card .org-roles__role-meta{grid-column:1/-1}
 .org-roles__editor-heading{margin-bottom:12px}.org-roles__form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
 .org-roles__editor form>label,.org-roles__form-grid label{display:grid;gap:6px;margin:12px 0;font-size:11px;font-weight:700}
 .org-roles__editor input:not([type=checkbox]),.org-roles__editor select{width:100%;box-sizing:border-box;padding:10px 11px;border:1px solid var(--border,#8885);border-radius:8px;background:var(--surface,rgba(130,145,170,.05));color:inherit;font-size:12px}
 .org-roles__mode-hint{font-size:11px!important;margin:7px 0 12px!important}
 .org-roles__groups{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:16px 0}
 .org-roles__groups section{border:1px solid var(--border,#8885);border-radius:10px;padding:12px;min-width:0}
 .org-roles__groups h4{text-transform:capitalize;font-size:12px}
 .org-roles__permission{display:flex;align-items:flex-start;gap:9px;padding:10px 0;border-top:1px solid var(--border,#8884);font-size:11px}
 .org-roles__permission input{margin-top:3px;accent-color:var(--purple,#8c72ff)}.org-roles__permission span{flex:1;min-width:0}
 .org-roles__permission strong,.org-roles__permission small,.org-roles__permission code{display:block}.org-roles__permission small,.org-roles__permission code{font-size:9px;opacity:.65;margin-top:3px}.org-roles__permission code{overflow-wrap:anywhere}
 .org-roles__permission em{font-size:9px;color:var(--warning,#c58a35);font-style:normal;white-space:nowrap}
 .org-roles__actions{display:flex;gap:8px;flex-wrap:wrap;padding-top:14px;border-top:1px solid var(--border,#8885)}
 .org-roles__primary{background:var(--purple,#8c72ff)!important;color:#fff!important;border-color:var(--purple,#8c72ff)!important}
 .org-roles__error{color:#d65b5b!important;opacity:1!important}.org-roles__success{color:#269b70!important;opacity:1!important}
 .org-roles__notice,.org-roles__empty{padding:12px;border:1px solid var(--border,#8885);border-radius:9px;background:var(--surface,rgba(130,145,170,.04));font-size:11px}
 @media(max-width:760px){.org-roles__header,.org-roles__section-heading,.org-roles__editor-heading{align-items:flex-start;flex-direction:column}.org-roles__permission-groups,.org-roles__groups,.org-roles__form-grid,.org-roles__detail-badges{grid-template-columns:1fr}.org-roles__details-summary{grid-template-columns:1fr}}
 @media(max-width:600px){.org-roles__toolbar{align-items:stretch}.org-roles__search{width:auto;flex:1;min-width:0}.org-roles__collection-header{justify-content:space-between}.org-roles__table-wrap table{min-width:620px}}
 @media(max-width:520px){.org-roles__tab-panel{padding:13px}.org-roles__tabs{padding:0 4px}.org-roles__tabs button{padding:12px 8px}.org-roles__modal-backdrop{padding:12px}.org-roles__modal{max-height:min(90vh,820px)}}
 `]

})
export class OrganizationRolesComponent implements OnChanges{
 @Input() tenantId="";@Input() role="member";@Input() accessToken="";
 activeTab:"system"|"permissions"|"custom"="system";
 roles:CustomRole[]=[];systemRoles:SystemRole[]=[];systemSearch="";systemView:"cards"|"table"="cards";selectedSystemRole:SystemRole|null=null;name="";description="";mode:"grant"|"restriction"="grant";editingId="";loading=false;busy=false;error="";message="";modalOpen=false;
 permissions:PermissionOption[]=[];
 private tenantAssignablePermissions:string[]=[];
 get canManage():boolean{return this.role==="owner"||this.role==="super_admin";}
 get groups():string[]{return [...new Set(this.permissions.map(p=>p.group))];}
 get filteredSystemRoles():SystemRole[]{const query=this.systemSearch.trim().toLowerCase();return this.systemRoles.filter(item=>!query||item.label.toLowerCase().includes(query)||item.description.toLowerCase().includes(query)||item.permissions.some(key=>key.toLowerCase().includes(query)||this.permissionLabel(key).toLowerCase().includes(query)));}
 inGroup(group:string):PermissionOption[]{return this.permissions.filter(p=>p.group===group);}
 canGrant(item:PermissionOption):boolean{return item.customRoleAssignable&&this.tenantAssignablePermissions.includes(item.key);}
 updateMode(mode:"grant"|"restriction"):void{const previous=this.mode;this.mode=mode;const allowed=new Set<string>(this.tenantAssignablePermissions);for(const p of this.permissions)p.assignable=mode==="restriction"||(p.customRoleAssignable&&allowed.has(p.key));if(!this.editingId&&previous!==mode){for(const p of this.permissions)p.selected=mode==="grant"&&["members.read","plugins.read"].includes(p.key)&&p.assignable;}}
 ngOnChanges(changes:SimpleChanges):void{if(changes["tenantId"]||changes["role"]||changes["accessToken"]){this.reset();void this.load();}}
 trackRole(_i:number,item:CustomRole):string{return item.id;}
 private async request(path:string,method="GET",body?:unknown):Promise<any>{const response=await fetch("/api"+path,{method,headers:{authorization:"Bearer "+this.accessToken,...(body?{"content-type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw new Error(result.error||"Role request failed");return result;}
 async load():Promise<void>{if(!this.tenantId||!this.accessToken)return;this.loading=true;this.error="";try{const result=await this.request("/companies/"+encodeURIComponent(this.tenantId)+"/roles");this.roles=result.roles||[];this.systemRoles=result.systemRoles||[];this.tenantAssignablePermissions=Array.isArray(result.tenantAssignablePermissions)?result.tenantAssignablePermissions:[];const allowed=new Set<string>(this.tenantAssignablePermissions);const selected=new Set(this.permissions.filter(permission=>permission.selected).map(permission=>permission.key));this.permissions=(Array.isArray(result.permissionCatalog)?result.permissionCatalog:[]).map((item:any)=>({key:item.key,label:item.label,group:String(item.resource||item.module||"Core").replace(/^./,letter=>letter.toUpperCase()),action:item.action||"manage",description:item.description||"",sensitive:!!item.sensitive,customRoleAssignable:!!item.customRoleAssignable,assignable:this.mode==="restriction"||!!item.customRoleAssignable&&allowed.has(item.key),selected:selected.has(item.key)||(selected.size===0&&["members.read","plugins.read"].includes(item.key))}));}catch(error){this.error=error instanceof Error?error.message:"Could not load roles";}finally{this.loading=false;}}
 permissionLabel(key:string):string{return this.permissions.find(item=>item.key===key)?.label||key;}
 permissionInitials(label:string):string{return label.trim().split(/\s+/).filter(Boolean).slice(0,2).map(word=>word.charAt(0).toUpperCase()).join("");}
 createCustomRole():void{this.activeTab="custom";this.openCreate();}
 openSystemRole(item:SystemRole):void{this.selectedSystemRole=item;}
 closeSystemRole():void{this.selectedSystemRole=null;}
 openCreate():void{this.reset();this.modalOpen=true;}
 closeModal():void{this.modalOpen=false;}
 @HostListener("document:keydown.escape") onEscape():void{if(this.selectedSystemRole)this.closeSystemRole();else if(this.modalOpen)this.closeModal();}
 edit(item:CustomRole):void{this.modalOpen=true;this.editingId=item.id;this.name=item.name;this.description=item.description||"";this.mode=item.mode??"grant";this.updateMode(this.mode);for(const p of this.permissions)p.selected=item.permissions.includes(p.key);this.error="";this.message="";}
 reset():void{this.modalOpen=false;this.editingId="";this.name="";this.description="";this.mode="grant";this.updateMode(this.mode);for(const p of this.permissions)p.selected=["members.read","plugins.read"].includes(p.key)&&p.assignable;this.error="";this.message="";}
 async save(event:Event):Promise<void>{event.preventDefault();if(!this.canManage||this.busy||!this.name.trim())return;this.busy=true;this.error="";this.message="";const body={name:this.name.trim(),description:this.description.trim(),mode:this.mode,permissions:this.permissions.filter(p=>p.selected&&p.assignable).map(p=>p.key)};try{if(this.editingId)await this.request("/companies/"+encodeURIComponent(this.tenantId)+"/roles/"+encodeURIComponent(this.editingId),"PUT",body);else await this.request("/companies/"+encodeURIComponent(this.tenantId)+"/roles","POST",body);this.message=this.editingId?"Role updated.":"Role created.";this.reset();await this.load();}catch(error){this.error=error instanceof Error?error.message:"Could not save role";}finally{this.busy=false;}}
 async remove():Promise<void>{if(!this.canManage||!this.editingId||this.busy)return;this.busy=true;this.error="";this.message="";try{await this.request("/companies/"+encodeURIComponent(this.tenantId)+"/roles/"+encodeURIComponent(this.editingId),"DELETE");this.message="Role deleted.";this.reset();await this.load();}catch(error){this.error=error instanceof Error?error.message:"Could not delete role";}finally{this.busy=false;}}
}
