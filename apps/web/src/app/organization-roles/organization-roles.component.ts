import { CommonModule } from "@angular/common";
import { Component, Input, OnChanges, SimpleChanges } from "@angular/core";
import { FormsModule } from "@angular/forms";
type CustomRole={id:string;name:string;description:string;permissions:string[];mode?:"grant"|"restriction"};
type SystemRole={key:string;label:string;description:string;protected:boolean;permissions:string[]};
type PermissionOption={key:string;label:string;group:string;action:string;description:string;sensitive?:boolean;customRoleAssignable:boolean;assignable:boolean;selected:boolean};

@Component({
 selector:"bee-organization-roles",standalone:true,imports:[CommonModule,FormsModule],
 template:`
 <section class="org-roles">
  <header class="org-roles__header"><div><span class="org-roles__eyebrow">ORGANIZATION ACCESS</span><h2>Roles &amp; Permissions</h2><p>Review system roles, explore the permissions available to this organization and manage custom access profiles.</p></div><button type="button" (click)="load()" [disabled]="loading||busy">Refresh</button></header>
  <p class="org-roles__error" *ngIf="error" role="alert">{{error}}</p><p class="org-roles__success" *ngIf="message" role="status">{{message}}</p>
  <p class="org-roles__notice" *ngIf="!canManage">You can view roles. Only the organization owner or Super Admin can create, edit or delete custom roles.</p>
  <nav class="org-roles__tabs" aria-label="Roles and permissions sections">
   <button type="button" [class.is-active]="activeTab==='system'" [attr.aria-selected]="activeTab==='system'" (click)="activeTab='system'"><span>01</span>System Roles <small>{{systemRoles.length}}</small></button>
   <button type="button" [class.is-active]="activeTab==='permissions'" [attr.aria-selected]="activeTab==='permissions'" (click)="activeTab='permissions'"><span>02</span>Available Permissions <small>{{permissions.length}}</small></button>
   <button type="button" [class.is-active]="activeTab==='custom'" [attr.aria-selected]="activeTab==='custom'" (click)="activeTab='custom'"><span>03</span>Custom Roles <small>{{roles.length}}</small></button>
  </nav>
  <section class="org-roles__tab-panel" *ngIf="activeTab==='system'">
   <div class="org-roles__section-heading"><div><h3>System roles</h3><p>Built-in roles maintained by Core. Their baseline permissions and protected boundaries cannot be replaced by custom roles.</p></div><span class="org-roles__section-tag">Core managed</span></div>
   <div class="org-roles__system-grid">
    <article class="org-roles__system-card" *ngFor="let item of systemRoles">
     <div class="org-roles__card-top"><div><strong>{{item.label}}</strong><small>{{item.protected?'Protected system role':'Standard system role'}}</small></div><span class="org-roles__permission-count">{{item.permissions.length}} permissions</span></div>
     <p>{{item.description}}</p>
     <div class="org-roles__chips"><code *ngFor="let permission of item.permissions">{{permission}}</code></div>
    </article>
   </div>
  </section>
  <section class="org-roles__tab-panel" *ngIf="activeTab==='permissions'">
   <div class="org-roles__section-heading"><div><h3>Available permissions</h3><p>Core capabilities that can be reviewed and, subject to platform policy, assigned to custom grant roles. Restriction roles can deny permissions without granting new access.</p></div><span class="org-roles__section-tag">{{permissions.length}} registered</span></div>
   <div *ngIf="loading" class="org-roles__empty">Loading permission catalogue…</div>
   <div class="org-roles__permission-groups">
    <section class="org-roles__permission-group" *ngFor="let group of groups"><h4>{{group}}</h4>
     <article class="org-roles__permission-card" *ngFor="let item of inGroup(group)">
      <div class="org-roles__permission-copy"><strong>{{item.label}}</strong><small>{{item.action}} · {{item.description}}</small><code>{{item.key}}</code></div>
      <span class="org-roles__permission-state" [class.is-protected]="!item.assignable">{{item.assignable?'Available for role configuration':'System protected'}}</span>
     </article>
    </section>
   </div>
   <p class="org-roles__footnote">The global delegation policy controls which capabilities may be granted to tenant custom roles. Protected capabilities remain unavailable for grants. Backend authorization remains authoritative.</p>
  </section>
  <section class="org-roles__tab-panel" *ngIf="activeTab==='custom'">
   <div class="org-roles__section-heading"><div><h3>Custom roles</h3><p>Create reusable permission profiles or additional restrictions. Denials always take priority over permissions granted by the primary role.</p></div><button *ngIf="canManage" type="button" class="org-roles__primary" (click)="reset()">+ Create custom role</button></div>
   <div class="org-roles__custom-layout">
    <aside class="org-roles__custom-list">
     <div class="org-roles__list-heading"><strong>Saved roles</strong><span>{{roles.length}}</span></div>
     <p *ngIf="loading">Loading roles…</p><p *ngIf="!loading&&!roles.length" class="org-roles__empty">No custom roles yet. Create one to define reusable access.</p>
     <button class="org-roles__role-card" *ngFor="let item of roles;trackBy:trackRole" type="button" [class.active]="editingId===item.id" (click)="edit(item)"><span><strong>{{item.name}}</strong><small>{{item.description||'No description'}}</small></span><em [class.is-restriction]="item.mode==='restriction'">{{item.mode==='restriction'?'Restriction':'Grant'}}</em><small class="org-roles__role-meta">{{item.permissions.length}} {{item.mode==='restriction'?'denials':'permissions'}}</small></button>
    </aside>
    <div class="org-roles__editor">
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
  </section>
 </section>`,
 styles:[`
 .org-roles{margin-top:18px;color:var(--text-primary,#172033)}.org-roles__header,.org-roles__layout,.org-roles__actions{display:flex;gap:18px}.org-roles__header{align-items:center;justify-content:space-between;margin-bottom:16px}.org-roles h2,.org-roles h3,.org-roles h4{margin:0 0 7px}.org-roles p{color:var(--text-muted,#778197);margin:0 0 12px}.org-roles button{border:1px solid var(--border-color,#dce1ea);border-radius:9px;padding:9px 13px;background:var(--surface,#fff);color:inherit;cursor:pointer}.org-roles button:disabled{opacity:.55;cursor:not-allowed}.org-roles__list{width:250px;flex:0 0 250px;border:1px solid var(--border-color,#dce1ea);border-radius:12px;padding:14px}.org-roles__role{display:flex;width:100%;justify-content:space-between;align-items:center;text-align:left;margin:8px 0}.org-roles__role small,.org-roles__permission small,.org-roles__permission code{display:block;color:var(--text-muted,#778197);font-size:11px}.org-roles__role.active{border-color:var(--accent,#625cf5);background:var(--surface-raised,#f6f7ff)}.org-roles__new{width:100%;margin-top:8px}.org-roles__system-role{display:grid;gap:4px;padding:10px 0;border-top:1px solid var(--border-subtle,#edf0f5)}.org-roles__system-role small,.org-roles__system-role code{font-size:11px;color:var(--text-muted,#778197)}.org-roles__system-permissions{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}.org-roles__system-permissions code{font-size:9px;padding:3px 5px;border-radius:5px;background:var(--surface-raised,#f6f7fa)}.org-roles__custom-heading{margin-top:20px!important}.org-roles__mode-hint{font-size:12px!important;margin:6px 0 14px!important}.org-roles__editor{flex:1;min-width:0;border:1px solid var(--border-color,#dce1ea);border-radius:12px;padding:18px}.org-roles__editor form>label{display:block;margin:12px 0;font-size:13px;font-weight:600}.org-roles__editor input:not([type=checkbox]){display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:10px;border:1px solid var(--border-color,#dce1ea);border-radius:8px;background:var(--surface,#fff);color:inherit}.org-roles__groups{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:20px 0}.org-roles__groups section{border:1px solid var(--border-color,#dce1ea);border-radius:10px;padding:12px}.org-roles__permission{display:flex;align-items:flex-start;gap:9px;padding:10px 0;border-top:1px solid var(--border-subtle,#edf0f5);font-size:13px}.org-roles__permission input{margin-top:3px}.org-roles__permission span{flex:1}.org-roles__permission em{font-size:10px;color:#a65b18;font-style:normal}.org-roles__actions{flex-wrap:wrap}.org-roles__actions button:first-child{background:var(--accent,#625cf5);color:white;border-color:var(--accent,#625cf5)}.org-roles__error{color:#b42318!important}.org-roles__success{color:#16794b!important}.org-roles__notice{padding:12px;border-radius:9px;background:var(--surface-raised,#f6f7fa);margin-bottom:14px}@media(max-width:760px){.org-roles__layout{flex-direction:column}.org-roles__list{width:auto;flex:auto}.org-roles__groups{grid-template-columns:1fr}}
 `]
})
export class OrganizationRolesComponent implements OnChanges{
 @Input() tenantId="";@Input() role="member";@Input() accessToken="";
 roles:CustomRole[]=[];systemRoles:SystemRole[]=[];name="";description="";mode:"grant"|"restriction"="grant";editingId="";loading=false;busy=false;error="";message="";
 permissions:PermissionOption[]=[];
 private tenantAssignablePermissions:string[]=[];
 get canManage():boolean{return this.role==="owner"||this.role==="super_admin";}
 get groups():string[]{return [...new Set(this.permissions.map(p=>p.group))];}
 inGroup(group:string):PermissionOption[]{return this.permissions.filter(p=>p.group===group);}
 updateMode(mode:"grant"|"restriction"):void{const previous=this.mode;this.mode=mode;const allowed=new Set<string>(this.tenantAssignablePermissions);for(const p of this.permissions)p.assignable=mode==="restriction"||(p.customRoleAssignable&&allowed.has(p.key));if(!this.editingId&&previous!==mode){for(const p of this.permissions)p.selected=mode==="grant"&&["members.read","plugins.read"].includes(p.key)&&p.assignable;}}
 ngOnChanges(changes:SimpleChanges):void{if(changes["tenantId"]||changes["role"]||changes["accessToken"]){this.reset();void this.load();}}
 trackRole(_i:number,item:CustomRole):string{return item.id;}
 private async request(path:string,method="GET",body?:unknown):Promise<any>{const response=await fetch("/api"+path,{method,headers:{authorization:"Bearer "+this.accessToken,...(body?{"content-type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw new Error(result.error||"Role request failed");return result;}
 async load():Promise<void>{if(!this.tenantId||!this.accessToken)return;this.loading=true;this.error="";try{const result=await this.request("/companies/"+encodeURIComponent(this.tenantId)+"/roles");this.roles=result.roles||[];this.systemRoles=result.systemRoles||[];this.tenantAssignablePermissions=Array.isArray(result.tenantAssignablePermissions)?result.tenantAssignablePermissions:[];const allowed=new Set<string>(this.tenantAssignablePermissions);const selected=new Set(this.permissions.filter(permission=>permission.selected).map(permission=>permission.key));this.permissions=(Array.isArray(result.permissionCatalog)?result.permissionCatalog:[]).map((item:any)=>({key:item.key,label:item.label,group:String(item.resource||item.module||"Core").replace(/^./,letter=>letter.toUpperCase()),action:item.action||"manage",description:item.description||"",sensitive:!!item.sensitive,customRoleAssignable:!!item.customRoleAssignable,assignable:this.mode==="restriction"||!!item.customRoleAssignable&&allowed.has(item.key),selected:selected.has(item.key)||(selected.size===0&&["members.read","plugins.read"].includes(item.key))}));}catch(error){this.error=error instanceof Error?error.message:"Could not load roles";}finally{this.loading=false;}}
 edit(item:CustomRole):void{this.editingId=item.id;this.name=item.name;this.description=item.description||"";this.mode=item.mode??"grant";this.updateMode(this.mode);for(const p of this.permissions)p.selected=item.permissions.includes(p.key);this.error="";this.message="";}
 reset():void{this.editingId="";this.name="";this.description="";this.mode="grant";this.updateMode(this.mode);for(const p of this.permissions)p.selected=["members.read","plugins.read"].includes(p.key)&&p.assignable;this.error="";this.message="";}
 async save(event:Event):Promise<void>{event.preventDefault();if(!this.canManage||this.busy||!this.name.trim())return;this.busy=true;this.error="";this.message="";const body={name:this.name.trim(),description:this.description.trim(),mode:this.mode,permissions:this.permissions.filter(p=>p.selected&&p.assignable).map(p=>p.key)};try{if(this.editingId)await this.request("/companies/"+encodeURIComponent(this.tenantId)+"/roles/"+encodeURIComponent(this.editingId),"PUT",body);else await this.request("/companies/"+encodeURIComponent(this.tenantId)+"/roles","POST",body);this.message=this.editingId?"Role updated.":"Role created.";this.reset();await this.load();}catch(error){this.error=error instanceof Error?error.message:"Could not save role";}finally{this.busy=false;}}
 async remove():Promise<void>{if(!this.canManage||!this.editingId||this.busy)return;this.busy=true;this.error="";this.message="";try{await this.request("/companies/"+encodeURIComponent(this.tenantId)+"/roles/"+encodeURIComponent(this.editingId),"DELETE");this.message="Role deleted.";this.reset();await this.load();}catch(error){this.error=error instanceof Error?error.message:"Could not delete role";}finally{this.busy=false;}}
}
