import { CommonModule } from "@angular/common";
import { Component, HostListener, Input, OnChanges, SimpleChanges } from "@angular/core";

type PermissionDefinition={key:string;module:string;resource:string;action:string;label:string;description:string;sensitive?:boolean;customRoleAssignable:boolean};
type SystemRole={key:string;label:string;scope:"platform"|"tenant";protected:boolean;description:string;permissions:string[]};

@Component({
 selector:"bee-platform-roles",
 standalone:true,
 imports:[CommonModule],
 template:`
 <section class="platform-roles">
  <header class="platform-roles__header">
   <div class="platform-roles__heading-copy"><span class="platform-roles__eyebrow">GLOBAL PLATFORM</span><h1>Roles &amp; Permissions</h1><p>Manage system-role boundaries and the Core capabilities that tenants may delegate to their custom roles.</p></div>
   <div class="platform-roles__header-actions"><span class="platform-roles__scope">Platform-wide</span><button type="button" (click)="load()" [disabled]="loading||saving">Refresh</button></div>
  </header>
  <p *ngIf="error" class="platform-roles__error bee-status--danger" role="alert">{{error}}</p>
  <p *ngIf="message" class="platform-roles__success bee-status--success" role="status">{{message}}</p>
  <section class="platform-roles__panel">
   <div class="platform-roles__panel-head"><div><h3>System roles and boundaries</h3><p>Reserved roles are managed by Core and cannot be recreated or elevated by a tenant.</p></div><span class="platform-roles__tag">Protected by Core</span></div>
   <div class="platform-roles__role-grid">
    <article *ngFor="let role of systemRoles" class="platform-roles__role">
     <div><strong>{{role.label}}</strong><small>{{role.scope==='platform'?'Platform':'Tenant'}} scope · {{role.protected?'Protected':'Policy based'}}</small></div>
     <p>{{role.description}}</p><button type="button" class="platform-roles__details" (click)="openSystemRole(role)">View permissions</button>
    </article>
   </div>
  </section>
  <section class="platform-roles__panel">
   <div class="platform-roles__panel-head"><div><h3>Tenant permission delegation</h3><p>Choose which registered Core capabilities tenant owners may grant to custom roles. Built-in role permissions remain protected by Core. Disabling a capability removes it from existing tenant custom roles too.</p></div><span class="platform-roles__count">{{enabledCount}} / {{assignableCount}} enabled</span><button type="button" class="platform-roles__manage" (click)="openDelegationModal()" [disabled]="loading||saving">Manage delegation</button></div>
   <div *ngIf="loading" class="platform-roles__empty">Loading permission catalogue…</div>

   <div class="platform-roles__modal-backdrop" *ngIf="delegationModalOpen" (click)="closeDelegationModal()">
    <div class="platform-roles__modal" role="dialog" aria-modal="true" aria-labelledby="platform-delegation-title" (click)="$event.stopPropagation()">
     <div class="platform-roles__modal-top"><div><span class="platform-roles__eyebrow">GLOBAL POLICY</span><h2 id="platform-delegation-title">Tenant permission delegation</h2><p>Choose which Core capabilities tenant owners may grant to custom roles. Saving revokes disabled capabilities from existing tenant roles.</p></div><button type="button" class="platform-roles__close" aria-label="Close dialog" (click)="closeDelegationModal()">×</button></div>
   <div *ngFor="let group of groups" class="platform-roles__group">
    <h4>{{groupLabel(group)}}</h4>
    <label *ngFor="let permission of inGroup(group)" class="platform-roles__permission">
     <span class="platform-roles__permission-copy"><strong>{{permission.label}}</strong><small>{{permission.description}}</small><code>{{permission.key}}</code></span>
     <span class="platform-roles__permission-state" *ngIf="!permission.customRoleAssignable">System protected</span>
     <span class="platform-roles__toggle" *ngIf="permission.customRoleAssignable"><input type="checkbox" [checked]="enabled.has(permission.key)" (change)="toggle(permission.key,$any($event.target).checked)" [disabled]="loading||saving"><span></span></span>
    </label>
   </div>
   <footer class="platform-roles__footer"><p>Protected operations such as membership administration, plugin administration, billing administration and mailbox administration remain reserved to built-in roles.</p><button type="button" (click)="save()" [disabled]="loading||saving||!dirty">{{saving?'Saving…':'Save platform policy'}}</button></footer>
    </div>
   </div>
  </section>
  <div class="platform-roles__modal-backdrop" *ngIf="selectedSystemRole" (click)="closeSystemRole()">
   <div class="platform-roles__modal platform-roles__role-modal" role="dialog" aria-modal="true" aria-labelledby="platform-role-title" (click)="$event.stopPropagation()">
    <div class="platform-roles__modal-top"><div><span class="platform-roles__eyebrow">{{selectedSystemRole.scope}} · CORE MANAGED</span><h2 id="platform-role-title">{{selectedSystemRole.label}}</h2><p>{{selectedSystemRole.description}}</p></div><button type="button" class="platform-roles__close" aria-label="Close dialog" (click)="closeSystemRole()">×</button></div>
    <h3>Assigned permissions</h3><div class="platform-roles__role-permissions"><code *ngFor="let permission of selectedSystemRole.permissions">{{permission}}</code><p *ngIf="!selectedSystemRole.permissions.length">No explicit permission keys are listed for this role.</p></div>
   </div>
  </div>
 </section>`,
 styles:[`
 .platform-roles{display:grid;gap:18px;min-width:0;color:inherit}
 .platform-roles__modal-backdrop{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:24px;background:var(--bee-overlay);backdrop-filter:blur(7px);animation:platformRoleFade .16s ease-out}
 .platform-roles__modal{width:min(1100px,100%);max-height:min(90vh,900px);overflow:auto;border:1px solid var(--bee-border);border-radius:18px;padding:22px;background:var(--bee-surface-raised);box-shadow:0 24px 80px var(--bee-shadow-raised);animation:platformRoleRise .2s ease-out}
 .platform-roles__modal-top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px}
 .platform-roles__modal-top h2{font-size:22px;margin:6px 0}.platform-roles__modal-top p{font-size:12px;max-width:760px}
 .platform-roles .platform-roles__close{width:36px;height:36px;padding:0;font-size:22px;line-height:1;border-radius:50%}
 .platform-roles .platform-roles__manage,.platform-roles .platform-roles .platform-roles__details{background:var(--bee-accent);color:var(--bee-accent-text);border-color:var(--bee-accent)}
 .platform-roles__details{font-size:10px;padding:6px 9px;margin-top:10px}
 .platform-roles__role-permissions{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}.platform-roles__role-permissions code{font-size:10px;padding:6px 8px;border-radius:7px;background:var(--bee-surface-subtle);overflow-wrap:anywhere}
 @keyframes platformRoleFade{from{opacity:0}to{opacity:1}}@keyframes platformRoleRise{from{opacity:0;transform:translateY(10px) scale(.99)}to{opacity:1;transform:translateY(0) scale(1)}}
 @media(prefers-reduced-motion:reduce){.platform-roles__modal-backdrop,.platform-roles__modal{animation:none}}
 .platform-roles__header,.platform-roles__panel-head,.platform-roles__footer{display:flex;align-items:center;justify-content:space-between;gap:18px}
 .platform-roles__header{margin:4px 0 8px}
 .platform-roles__heading-copy{min-width:0}
 .platform-roles__eyebrow{font-size:10px;letter-spacing:.16em;font-weight:700;opacity:.58}
 .platform-roles h1{font-size:clamp(26px,3vw,36px);margin:9px 0 6px}
 .platform-roles h3,.platform-roles h4{margin:0 0 6px}
 .platform-roles p{margin:0;color:inherit;opacity:.68;line-height:1.55}
 .platform-roles__header-actions{display:flex;align-items:center;gap:10px;flex:none}
 .platform-roles button{border:1px solid color-mix(in srgb,var(--bee-border) 30%,transparent);border-radius:9px;padding:10px 14px;background:color-mix(in srgb,var(--bee-surface-subtle) 7%,transparent);color:inherit;cursor:pointer}
 .platform-roles button:disabled{opacity:.5;cursor:not-allowed}
 .platform-roles__scope,.platform-roles__tag,.platform-roles__count{font-size:11px;border:1px solid color-mix(in srgb,var(--bee-border) 30%,transparent);border-radius:999px;padding:7px 11px;white-space:nowrap;opacity:.78}
 .platform-roles__panel{border:1px solid color-mix(in srgb,var(--bee-border) 25%,transparent);border-radius:16px;padding:20px;background:color-mix(in srgb,var(--bee-surface-subtle) 6%,transparent);min-width:0}
 .platform-roles__panel-head{margin-bottom:15px}
 .platform-roles__role-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
 .platform-roles__role{padding:13px;border:1px solid color-mix(in srgb,var(--bee-border) 22%,transparent);border-radius:11px;background:color-mix(in srgb,var(--bee-surface-subtle) 4%,transparent);min-width:0}
 .platform-roles__role strong,.platform-roles__role small{display:block}
 .platform-roles__role small,.platform-roles__permission small,.platform-roles__permission code{font-size:11px;opacity:.68}
 .platform-roles__role p{font-size:12px;margin-top:8px}
 .platform-roles__permission-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px}
 .platform-roles__permission-tags code{font-size:9px;padding:4px 6px;border-radius:5px;background:color-mix(in srgb,var(--bee-surface-subtle) 10%,transparent);color:inherit}
 .platform-roles__group{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;border-top:1px solid color-mix(in srgb,var(--bee-border) 20%,transparent);padding-top:14px;margin-top:14px}
 .platform-roles__group h4{text-transform:capitalize;grid-column:1/-1;margin:0 0 2px}
 .platform-roles__permission{display:flex;align-items:flex-start;gap:12px;justify-content:space-between;padding:13px;border:1px solid color-mix(in srgb,var(--bee-border) 20%,transparent);border-radius:11px;background:color-mix(in srgb,var(--bee-surface-subtle) 4%,transparent);min-width:0;min-height:100%}
 .platform-roles__permission-copy{flex:1;min-width:0}
 .platform-roles__permission-copy strong,.platform-roles__permission-copy small,.platform-roles__permission-copy code{display:block}
 .platform-roles__permission-copy small{margin:3px 0}
 .platform-roles__permission-copy code{font-size:10px;opacity:.62;overflow-wrap:anywhere}
 .platform-roles__permission-state{font-size:10px;opacity:.68;white-space:nowrap}
 .platform-roles__toggle{position:relative;display:inline-flex;flex:none}
 .platform-roles__toggle input{position:absolute;opacity:0;width:1px;height:1px}
 .platform-roles__toggle span{width:38px;height:22px;border-radius:99px;background:color-mix(in srgb,var(--bee-surface-subtle) 48%,transparent);transition:background .15s;cursor:pointer}
 .platform-roles__toggle span:after{content:"";display:block;width:16px;height:16px;border-radius:50%;background:var(--bee-accent-text);margin:3px;transition:transform .15s}
 .platform-roles__toggle input:checked+span{background:var(--bee-accent)}
 .platform-roles__toggle input:checked+span:after{transform:translateX(16px)}
 .platform-roles__footer{border-top:1px solid color-mix(in srgb,var(--bee-border) 20%,transparent);padding-top:15px;margin-top:15px}
 .platform-roles__footer p{font-size:11px;max-width:680px}
 .platform-roles__footer button{background:var(--bee-accent);color:var(--bee-accent-text);border-color:var(--bee-accent)}
 .platform-roles .platform-roles__error{color:var(--bee-status-danger);opacity:1}
 .platform-roles .platform-roles__success{color:var(--bee-status-success);opacity:1}
 .platform-roles__empty{padding:16px;color:inherit;opacity:.65}
 @media(max-width:980px){.platform-roles__group{grid-template-columns:repeat(2,minmax(0,1fr))}}
 @media(max-width:760px){.platform-roles__role-grid{grid-template-columns:1fr}.platform-roles__header,.platform-roles__panel-head,.platform-roles__footer{align-items:flex-start;flex-direction:column}}
 @media(max-width:520px){.platform-roles__group{grid-template-columns:1fr}.platform-roles__modal-backdrop{padding:10px}.platform-roles__modal{padding:15px;max-height:94vh}.platform-roles__panel-head{gap:10px}}
 `]
})
export class PlatformRolesComponent implements OnChanges{
 @Input() accessToken="";
 catalog:PermissionDefinition[]=[];
 systemRoles:SystemRole[]=[];
 enabled=new Set<string>();
 original=new Set<string>();
 loading=false;saving=false;error="";message="";delegationModalOpen=false;selectedSystemRole:SystemRole|null=null;
 private readonly api="/api";
 get groups():string[]{return [...new Set(this.catalog.map(item=>item.module))];}
 get assignableCount():number{return this.catalog.filter(item=>item.customRoleAssignable).length;}
 get enabledCount():number{return this.enabled.size;}
 get dirty():boolean{return this.enabled.size!==this.original.size||[...this.enabled].some(key=>!this.original.has(key));}
 ngOnChanges(changes:SimpleChanges):void{if(changes["accessToken"]&&this.accessToken)void this.load();}
 openDelegationModal():void{this.delegationModalOpen=true;this.message="";}
 closeDelegationModal():void{this.delegationModalOpen=false;}
 openSystemRole(role:SystemRole):void{this.selectedSystemRole=role;}
 closeSystemRole():void{this.selectedSystemRole=null;}
 @HostListener("document:keydown.escape") onEscape():void{if(this.selectedSystemRole)this.closeSystemRole();else if(this.delegationModalOpen)this.closeDelegationModal();}
 groupLabel(group:string):string{return group.replace(/[-_]/g," ");}
 inGroup(group:string):PermissionDefinition[]{return this.catalog.filter(item=>item.module===group);}
 toggle(key:string,checked:boolean):void{if(checked)this.enabled.add(key);else this.enabled.delete(key);this.message="";}
 async load():Promise<void>{
  if(!this.accessToken)return;this.loading=true;this.error="";this.message="";
  try{const response=await fetch(this.api+"/platform/permissions",{headers:{authorization:"Bearer "+this.accessToken}});const result=await response.json();if(!response.ok)throw new Error(result.error||"Could not load platform permissions");
   this.catalog=Array.isArray(result.catalog)?result.catalog:[];this.systemRoles=Array.isArray(result.systemRoles)?result.systemRoles:[];
   this.enabled=new Set(Array.isArray(result.tenantAssignablePermissions)?result.tenantAssignablePermissions:[]);this.original=new Set(this.enabled);
  }catch(error){this.error=error instanceof Error?error.message:"Could not load platform permissions";}finally{this.loading=false;}
 }
 async save():Promise<void>{
  if(!this.dirty||this.saving)return;this.saving=true;this.error="";this.message="";
  try{const response=await fetch(this.api+"/platform/permissions",{method:"PUT",headers:{authorization:"Bearer "+this.accessToken,"content-type":"application/json"},body:JSON.stringify({tenantAssignablePermissions:[...this.enabled]})});const result=await response.json();if(!response.ok)throw new Error(result.error||"Could not save platform policy");
   this.enabled=new Set(result.tenantAssignablePermissions||[]);this.original=new Set(this.enabled);this.message="Platform permission policy saved. Revoked capabilities were removed from existing tenant custom roles.";this.delegationModalOpen=false;
  }catch(error){this.error=error instanceof Error?error.message:"Could not save platform policy";}finally{this.saving=false;}
 }
}
