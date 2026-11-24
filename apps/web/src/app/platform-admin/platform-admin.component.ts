import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

type PlatformCompany={id:string;name:string;slug?:string|null;status:'active'|'suspended';createdAt:string;membersCount?:number};

@Component({
 selector:'bee-platform-admin',
 standalone:true,
 imports:[CommonModule,FormsModule],
 template:`
 <section class="platform-admin">
   @if (!managedTenantId) {
     <div class="platform-admin__toolbar">
       <div class="platform-admin__toolbar-actions">
         <div class="platform-admin__view-toggle" aria-label="Company display">
           <button type="button" [class.is-active]="viewMode==='cards'" [attr.aria-pressed]="viewMode==='cards'" (click)="viewMode='cards'" title="Card view">▦</button>
           <button type="button" [class.is-active]="viewMode==='list'" [attr.aria-pressed]="viewMode==='list'" (click)="viewMode='list'" title="List view">☷</button>
         </div>
         <button type="button" class="platform-admin__create-trigger" (click)="openCreate()">＋ New tenant</button>
       </div>
     </div>
     @if(error){<p class="platform-admin__error">{{error}}</p>}
     @if(success){<p class="platform-admin__success">{{success}}</p>}
     @if(loading){<div class="platform-admin__empty">Loading companies…</div>}
     @else if(!companies.length){<div class="platform-admin__empty">No tenants have been created yet.</div>}
     @else if(viewMode==='cards'){
       <div class="platform-admin__cards">
         @for(c of companies;track c.id){
           <article class="platform-company-card">
             <div class="platform-company-card__top">
               <span class="platform-company-card__mark">{{c.name.charAt(0).toUpperCase()}}</span>
               <div class="platform-company-card__menu-wrap">
                 <button type="button" class="platform-company-card__dots" aria-label="Company actions" [attr.aria-expanded]="openMenuId===c.id" (click)="toggleMenu(c.id)">⋮</button>
                 @if(openMenuId===c.id){<div class="platform-company-card__menu">
                   <button type="button" disabled>Disable</button>
                   <button type="button" disabled>Message</button>
                   <button type="button" (click)="manageCompany.emit(c.id);openMenuId=''">Manage</button>
                 </div>}
               </div>
             </div>
             <h3>{{c.name}}</h3>
             <p class="platform-company-card__slug">{{c.slug || 'No public subdomain'}}</p>
             <div class="platform-company-card__meta">
               <span [class.is-suspended]="c.status==='suspended'"><i></i>{{c.status}}</span>
               <span>{{c.membersCount ?? 0}} members</span>
             </div>
             <div class="platform-company-card__footer"><button type="button" (click)="manageCompany.emit(c.id)">Manage tenant ↗</button></div>
           </article>
         }
       </div>
     } @else {
       <div class="platform-admin__table-wrap"><table class="platform-admin__table">
         <thead><tr><th>Tenant</th><th>Subdomain</th><th>Members</th><th>Status</th><th>Actions</th></tr></thead>
         <tbody>@for(c of companies;track c.id){<tr>
           <td><strong>{{c.name}}</strong><small>{{c.id}}</small></td>
           <td>{{c.slug || '—'}}</td><td>{{c.membersCount ?? 0}}</td>
           <td><span class="platform-company-status" [class.is-suspended]="c.status==='suspended'">{{c.status}}</span></td>
           <td><div class="platform-company-card__menu-wrap">
             <button type="button" class="platform-company-card__dots" aria-label="Company actions" [attr.aria-expanded]="openMenuId===c.id" (click)="toggleMenu(c.id)">⋮</button>
             @if(openMenuId===c.id){<div class="platform-company-card__menu">
               <button type="button" disabled>Disable</button><button type="button" disabled>Message</button>
               <button type="button" (click)="manageCompany.emit(c.id);openMenuId=''">Manage</button>
             </div>}
           </div></td>
         </tr>}</tbody>
       </table></div>
     }
   } @else {
     <div class="platform-admin__manage-head">
       <div><span class="platform-admin__eyebrow">SETTINGS / TENANTS</span><h2>{{managedCompany?.name || 'Company management'}}</h2><p>Manage this tenant and its platform-level configuration</p></div>
       <button type="button" class="platform-admin__back" (click)="backToList.emit()">All Tenants</button>
     </div>
     @if(error){<p class="platform-admin__error">{{error}}</p>}
     @if(managedCompany){
       <div class="platform-admin__tenant-summary">
         <article class="platform-admin__detail"><span>Company ID</span><strong>{{managedCompany.id}}</strong></article>
         <article class="platform-admin__detail"><span>Public subdomain</span><strong>{{managedCompany.slug || 'Not configured'}}</strong></article>
         <article class="platform-admin__detail"><span>Members</span><strong>{{managedCompany.membersCount ?? 0}}</strong></article>
         <article class="platform-admin__detail"><span>Status</span><strong class="platform-company-status" [class.is-suspended]="managedCompany.status==='suspended'">{{managedCompany.status}}</strong></article>
       </div>
       <nav class="platform-admin__tenant-tabs" role="tablist" aria-label="Tenant details">
         <button type="button" role="tab" [class.is-active]="tenantTab==='general'" [attr.aria-selected]="tenantTab==='general'" (click)="tenantTab='general'">General</button>
         <button type="button" role="tab" [class.is-active]="tenantTab==='users'" [attr.aria-selected]="tenantTab==='users'" (click)="tenantTab='users';loadTenantUsers()">Users <span>{{managedCompany.membersCount ?? 0}}</span></button>
         <button type="button" role="tab" [class.is-active]="tenantTab==='plugins'" [attr.aria-selected]="tenantTab==='plugins'" (click)="tenantTab='plugins';loadTenantPlugins()">Plugins <span>{{tenantPlugins.length}}</span></button>
       </nav>
       @if(tenantTab==='general'){
         <div class="platform-admin__tenant-tab-content">
           <div class="platform-admin__manage-section">
             <div><h3>Company status</h3><p>Control whether this company is active on the platform.</p></div>
             <button type="button" (click)="toggle(managedCompany)" [disabled]="busy">{{managedCompany.status==='active'?'Suspend company':'Activate company'}}</button>
           </div>
           <article class="platform-admin__detail"><span>Tenant identity</span><strong>{{managedCompany.name}}</strong><small>{{managedCompany.slug || 'No public subdomain configured'}}</small></article>
         </div>
       } @else if(tenantTab==='users'){
         <div class="platform-admin__tenant-tab-content">
           @if(usersLoading){<div class="platform-admin__empty">Loading tenant users…</div>}
           @else if(!tenantUsers.length){<div class="platform-admin__empty">No active or invited memberships found.</div>}
           @else {<div class="platform-admin__tenant-list">
             @for(user of tenantUsers;track user.userId){<article class="platform-admin__tenant-row">
               <span class="platform-admin__tenant-avatar">{{(user.email||'?').charAt(0).toUpperCase()}}</span>
               <div class="platform-admin__tenant-user"><strong>{{user.email}}</strong><small>{{user.status}}</small></div>
               <span class="platform-admin__tenant-role">{{user.role}}</span>
             </article>}
           </div>}
         </div>
       } @else {
         <div class="platform-admin__tenant-tab-content">
           @if(tenantPluginsLoading){<div class="platform-admin__empty">Loading tenant plugins…</div>}
           @else if(!tenantPlugins.length){<div class="platform-admin__empty">No plugin catalogue entries available.</div>}
           @else {<div class="platform-admin__tenant-list">
             @for(plugin of tenantPlugins;track plugin.id){<article class="platform-admin__tenant-plugin">
               <div class="platform-admin__tenant-plugin-main"><span class="platform-admin__tenant-plugin-mark">⌘</span><div><strong>{{plugin.name}}</strong><small>{{plugin.description || plugin.id}} · v{{plugin.version}}</small></div></div>
               <div class="platform-admin__tenant-plugin-status"><span class="platform-company-status" [class.is-suspended]="!plugin.installed||!plugin.enabled||!plugin.entitled">{{plugin.installed?(plugin.enabled?(plugin.entitled?'Active':'Blocked'):'Inactive'):'Not installed on platform'}}</span><small>{{!plugin.installed?'Platform package unavailable':plugin.enabled?(plugin.entitled?'Active for this company':'Enabled but access is not granted'):plugin.entitled?'Available · inactive for this company':'Access not granted'}}</small></div>
               @if(plugin.installed && (plugin.enabled || plugin.entitled)){<button type="button" class="platform-admin__tenant-plugin-action" (click)="toggleTenantPlugin(managedCompany,plugin)" [disabled]="busy||pluginBusyId===managedCompany.id || (!plugin.enabled && !plugin.entitled)">{{plugin.enabled ? 'Deactivate' : 'Activate'}}</button>}
               @if(plugin.installed && !plugin.entitled){<button type="button" class="platform-admin__tenant-plugin-action" (click)="setTenantPluginGrant(managedCompany,plugin,true)" [disabled]="pluginBusyId===managedCompany.id">Grant access</button>}
               @else if(plugin.installed && plugin.accessSource==='manual'){<button type="button" class="platform-admin__tenant-plugin-action" (click)="setTenantPluginGrant(managedCompany,plugin,false)" [disabled]="pluginBusyId===managedCompany.id">Revoke grant</button>}
             </article>}
           </div>}
         </div>
       }
     } @else {<div class="platform-admin__empty">The requested company could not be found.</div>}
   }
   @if(showCreateModal){
     <div class="platform-admin__modal-backdrop" (click)="closeCreate()">
       <section class="platform-admin__modal" role="dialog" aria-modal="true" aria-labelledby="platform-create-title" (click)="$event.stopPropagation()">
         <div class="platform-admin__modal-head"><div><span class="platform-admin__eyebrow">TENANT MANAGEMENT</span><h2 id="platform-create-title">Create a tenant</h2><p>Create a tenant and configure its first owner.</p></div><button type="button" aria-label="Close" (click)="closeCreate()">×</button></div>
         <form class="platform-admin-form" (ngSubmit)="create()">
           <label>Company name</label><input name="companyName" [(ngModel)]="name" required minlength="2" maxlength="120" placeholder="Dragchart">
           <label>Public subdomain slug</label><input name="companySlug" [(ngModel)]="slug" pattern="[a-z0-9-]+" maxlength="48" placeholder="dragchart">
           <small>Public address: {{slug || '[company-slug]'}}.beecore.beeprojects.net</small>
           <label>Owner email</label><input name="ownerEmail" type="email" [(ngModel)]="ownerEmail" required placeholder="owner@company.com">
           <label>Initial password (new user only)</label><input name="ownerPassword" type="password" [(ngModel)]="ownerPassword" minlength="12" placeholder="At least 12 characters">
           @if(error){<p class="platform-admin__error">{{error}}</p>}
           <div class="platform-admin__modal-actions"><button type="button" class="platform-admin__cancel" (click)="closeCreate()">Cancel</button><button type="submit" [disabled]="busy">{{busy?'Creating…':'Create tenant'}}</button></div>
         </form>
       </section>
     </div>
   }
 </section>`
})
export class PlatformAdminComponent implements OnInit {
 @Input() token='';
 @Input() managedTenantId='';
 @Output() manageCompany=new EventEmitter<string>();
 @Output() backToList=new EventEmitter<void>();
 companies:PlatformCompany[]=[];

 pluginBusyId='';name='';slug='';ownerEmail='';ownerPassword='';busy=false;loading=false;error='';success='';tenantTab:'general'|'users'|'plugins'='general';tenantUsers:Array<{userId:string;email:string;role:string;status:string;createdAt?:string}>=[];tenantPlugins:Array<{id:string;name:string;description:string;version:string;installed:boolean;enabled:boolean;status:string;system:boolean;dependencies?:string[];entitled?:boolean;accessSource?:string|null;activationPolicy?:string}>=[];usersLoading=false;tenantPluginsLoading=false;
 viewMode:'cards'|'list'='cards';showCreateModal=false;openMenuId='';
 get managedCompany():PlatformCompany|undefined{return this.companies.find(company=>company.id===this.managedTenantId);}
 ngOnInit(){void this.load();}
 private headers(){return {authorization:'Bearer '+this.token};}
 openCreate(){this.error='';this.success='';this.showCreateModal=true;}
 closeCreate(){if(this.busy)return;this.showCreateModal=false;this.error='';}
 toggleMenu(id:string){this.openMenuId=this.openMenuId===id?'':id;}
 async setTenantPluginGrant(company:PlatformCompany,plugin:any,granted:boolean){
  if(this.pluginBusyId)return;this.pluginBusyId=company.id;
  try{const r=await fetch("/api/platform/companies/"+encodeURIComponent(company.id)+"/plugin-entitlements/"+encodeURIComponent(plugin.id),{method:"PUT",headers:{...this.headers(),"content-type":"application/json"},body:JSON.stringify({granted})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to update tenant access");await this.loadTenantPlugins();}
  catch(e){this.error=e instanceof Error?e.message:"Unable to update tenant access";}
  finally{this.pluginBusyId="";}
 }
 async load(){this.loading=true;this.error='';try{const r=await fetch('/api/platform/companies',{headers:this.headers()});const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to list tenants');this.companies=d.companies??[];}catch(e){this.error=e instanceof Error?e.message:'Request failed';}finally{this.loading=false;}}
 async loadTenantUsers(){if(!this.managedTenantId||this.usersLoading)return;this.usersLoading=true;try{const r=await fetch('/api/platform/companies/'+encodeURIComponent(this.managedTenantId)+'/users',{headers:this.headers()});const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to load users');this.tenantUsers=d.users??[];}catch(e){this.error=e instanceof Error?e.message:'Could not load tenant users';}finally{this.usersLoading=false;}}
 async loadTenantPlugins(){if(!this.managedTenantId||this.tenantPluginsLoading)return;this.tenantPluginsLoading=true;try{const r=await fetch('/api/platform/companies/'+encodeURIComponent(this.managedTenantId)+'/plugins',{headers:this.headers()});const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to load plugins');this.tenantPlugins=d.plugins??[];}catch(e){this.error=e instanceof Error?e.message:'Could not load tenant plugins';}finally{this.tenantPluginsLoading=false;}}
 async toggleTenantPlugin(c:PlatformCompany,plugin:any){if(this.pluginBusyId)return;this.pluginBusyId=c.id;try{const r=await fetch('/api/platform/companies/'+encodeURIComponent(c.id)+'/plugins/'+encodeURIComponent(plugin.id),{method:'PUT',headers:{...this.headers(),'content-type':'application/json'},body:JSON.stringify({enabled:!plugin.enabled})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Plugin change failed');await this.loadTenantPlugins();}catch(e){this.error=e instanceof Error?e.message:'Plugin operation failed';}finally{this.pluginBusyId='';}}
 async create(){this.busy=true;this.error='';this.success='';try{const r=await fetch('/api/platform/companies',{method:'POST',headers:{...this.headers(),'content-type':'application/json'},body:JSON.stringify({name:this.name,slug:this.slug||undefined,ownerEmail:this.ownerEmail,ownerPassword:this.ownerPassword||undefined})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Creation failed');this.success='Tenant created successfully.';this.name='';this.slug='';this.ownerEmail='';this.ownerPassword='';this.showCreateModal=false;await this.load();}catch(e){this.error=e instanceof Error?e.message:'Request failed';}finally{this.busy=false;}}
 async toggle(c:PlatformCompany){this.busy=true;this.error='';try{const r=await fetch('/api/platform/companies/'+encodeURIComponent(c.id),{method:'PATCH',headers:{...this.headers(),'content-type':'application/json'},body:JSON.stringify({status:c.status==='active'?'suspended':'active'})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Status change failed');await this.load();}catch(e){this.error=e instanceof Error?e.message:'Request failed';}finally{this.busy=false;}}
}