import { CommonModule } from "@angular/common";
import { Component, Input, OnChanges, SimpleChanges } from "@angular/core";

type PermissionDefinition={key:string;module:string;resource:string;action:string;label:string;description:string;sensitive?:boolean;customRoleAssignable:boolean};
type SystemRole={key:string;label:string;scope:"platform"|"tenant";protected:boolean;description:string};

@Component({
 selector:"bee-platform-roles",
 standalone:true,
 imports:[CommonModule],
 template:`
 <section class="platform-roles">
  <header class="platform-roles__header">
   <div><span class="platform-roles__eyebrow">PLATFORM ACCESS CONTROL</span><h2>Roles &amp; Permissions</h2><p>Define the global permission catalogue and the capabilities that tenants are allowed to delegate to their own custom roles.</p></div>
   <button type="button" (click)="load()" [disabled]="loading||saving">Refresh</button>
  </header>
  <p *ngIf="error" class="platform-roles__error" role="alert">{{error}}</p>
  <p *ngIf="message" class="platform-roles__success" role="status">{{message}}</p>
  <section class="platform-roles__panel">
   <div class="platform-roles__panel-head"><div><h3>System roles and boundaries</h3><p>Reserved roles are managed by Core and cannot be recreated or elevated by a tenant.</p></div><span class="platform-roles__tag">Protected by Core</span></div>
   <div class="platform-roles__role-grid">
    <article *ngFor="let role of systemRoles" class="platform-roles__role">
     <div><strong>{{role.label}}</strong><small>{{role.scope==='platform'?'Platform':'Tenant'}} scope · {{role.protected?'Protected':'Policy based'}}</small></div>
     <p>{{role.description}}</p>
    </article>
   </div>
  </section>
  <section class="platform-roles__panel">
   <div class="platform-roles__panel-head"><div><h3>Tenant permission delegation</h3><p>Choose which registered Core capabilities tenant owners may grant to custom roles. Disabling a capability removes it from existing tenant custom roles too.</p></div><span class="platform-roles__count">{{enabledCount}} / {{assignableCount}} enabled</span></div>
   <div *ngIf="loading" class="platform-roles__empty">Loading permission catalogue…</div>
   <div *ngFor="let group of groups" class="platform-roles__group">
    <h4>{{groupLabel(group)}}</h4>
    <label *ngFor="let permission of inGroup(group)" class="platform-roles__permission">
     <span class="platform-roles__permission-copy"><strong>{{permission.label}}</strong><small>{{permission.description}}</small><code>{{permission.key}}</code></span>
     <span class="platform-roles__permission-state" *ngIf="!permission.customRoleAssignable">System protected</span>
     <span class="platform-roles__toggle" *ngIf="permission.customRoleAssignable"><input type="checkbox" [checked]="enabled.has(permission.key)" (change)="toggle(permission.key,$any($event.target).checked)" [disabled]="loading||saving"><span></span></span>
    </label>
   </div>
   <footer class="platform-roles__footer"><p>Protected operations such as membership administration, plugin administration, billing administration and mailbox administration remain reserved to built-in roles.</p><button type="button" (click)="save()" [disabled]="loading||saving||!dirty">{{saving?'Saving…':'Save platform policy'}}</button></footer>
  </section>
 </section>`,
 styles:[`
 .platform-roles{display:grid;gap:18px;color:var(--text-primary,#172033)}.platform-roles__header,.platform-roles__panel-head,.platform-roles__footer{display:flex;align-items:center;justify-content:space-between;gap:18px}.platform-roles__header{margin-bottom:4px}.platform-roles__eyebrow{font-size:10px;letter-spacing:.14em;font-weight:700;opacity:.58}.platform-roles h2{font-size:clamp(24px,3vw,34px);margin:7px 0}.platform-roles h3,.platform-roles h4{margin:0 0 6px}.platform-roles p{margin:0;color:var(--text-muted,#778197);line-height:1.55}.platform-roles button{border:1px solid var(--border-color,#dce1ea);border-radius:9px;padding:10px 14px;background:var(--surface,#fff);color:inherit;cursor:pointer}.platform-roles button:disabled{opacity:.5;cursor:not-allowed}.platform-roles__panel{border:1px solid var(--border-color,#dce1ea);border-radius:14px;padding:18px;background:var(--surface,#fff)}.platform-roles__panel-head{margin-bottom:15px}.platform-roles__tag,.platform-roles__count{font-size:11px;border:1px solid var(--border-color,#dce1ea);border-radius:999px;padding:6px 10px;white-space:nowrap;opacity:.8}.platform-roles__role-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.platform-roles__role{padding:12px;border:1px solid var(--border-color,#dce1ea);border-radius:10px}.platform-roles__role strong,.platform-roles__role small{display:block}.platform-roles__role small,.platform-roles__permission small,.platform-roles__permission code{font-size:11px;color:var(--text-muted,#778197)}.platform-roles__role p{font-size:12px;margin-top:8px}.platform-roles__group{border-top:1px solid var(--border-subtle,#edf0f5);padding-top:14px;margin-top:14px}.platform-roles__group h4{text-transform:capitalize}.platform-roles__permission{display:flex;align-items:center;gap:15px;justify-content:space-between;padding:11px 4px;border-top:1px solid var(--border-subtle,#edf0f5)}.platform-roles__permission-copy{flex:1;min-width:0}.platform-roles__permission-copy strong,.platform-roles__permission-copy small,.platform-roles__permission-copy code{display:block}.platform-roles__permission-copy small{margin:3px 0}.platform-roles__permission-state{font-size:10px;color:var(--text-muted,#778197);white-space:nowrap}.platform-roles__toggle{position:relative;display:inline-flex;flex:none}.platform-roles__toggle input{position:absolute;opacity:0;width:1px;height:1px}.platform-roles__toggle span{width:38px;height:22px;border-radius:99px;background:#aab2c0;transition:background .15s;cursor:pointer}.platform-roles__toggle span:after{content:"";display:block;width:16px;height:16px;border-radius:50%;background:white;margin:3px;transition:transform .15s}.platform-roles__toggle input:checked+span{background:var(--accent,#625cf5)}.platform-roles__toggle input:checked+span:after{transform:translateX(16px)}.platform-roles__footer{border-top:1px solid var(--border-subtle,#edf0f5);padding-top:15px;margin-top:15px}.platform-roles__footer p{font-size:11px;max-width:680px}.platform-roles__footer button{background:var(--accent,#625cf5);color:white;border-color:var(--accent,#625cf5)}.platform-roles__error{color:#b42318!important}.platform-roles__success{color:#16794b!important}.platform-roles__empty{padding:16px;color:var(--text-muted,#778197)}@media(max-width:760px){.platform-roles__role-grid{grid-template-columns:1fr}.platform-roles__header,.platform-roles__panel-head,.platform-roles__footer{align-items:flex-start;flex-direction:column}}
 `]
})
export class PlatformRolesComponent implements OnChanges{
 @Input() accessToken="";
 catalog:PermissionDefinition[]=[];
 systemRoles:SystemRole[]=[];
 enabled=new Set<string>();
 original=new Set<string>();
 loading=false;saving=false;error="";message="";
 private readonly api="/api";
 get groups():string[]{return [...new Set(this.catalog.map(item=>item.module))];}
 get assignableCount():number{return this.catalog.filter(item=>item.customRoleAssignable).length;}
 get enabledCount():number{return this.enabled.size;}
 get dirty():boolean{return this.enabled.size!==this.original.size||[...this.enabled].some(key=>!this.original.has(key));}
 ngOnChanges(changes:SimpleChanges):void{if(changes["accessToken"]&&this.accessToken)void this.load();}
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
   this.enabled=new Set(result.tenantAssignablePermissions||[]);this.original=new Set(this.enabled);this.message="Platform permission policy saved. Revoked capabilities were removed from existing tenant custom roles.";
  }catch(error){this.error=error instanceof Error?error.message:"Could not save platform policy";}finally{this.saving=false;}
 }
}
