import { CommonModule } from "@angular/common";
import { Component, Input, OnChanges, SimpleChanges } from "@angular/core";

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
   <div class="platform-roles__panel-head"><div><h3>Tenant permission delegation</h3><p>Choose which registered Core capabilities tenant owners may grant to custom roles. Built-in role permissions remain protected by Core. Disabling a capability removes it from existing tenant custom roles too.</p></div><span class="platform-roles__count">{{enabledCount}} / {{assignableCount}} enabled</span></div>
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
 .platform-roles{display:grid;gap:18px;min-width:0;color:inherit}
 .platform-roles__header,.platform-roles__panel-head,.platform-roles__footer{display:flex;align-items:center;justify-content:space-between;gap:18px}
 .platform-roles__header{margin:4px 0 8px}
 .platform-roles__heading-copy{min-width:0}
 .platform-roles__eyebrow{font-size:10px;letter-spacing:.16em;font-weight:700;opacity:.58}
 .platform-roles h1{font-size:clamp(26px,3vw,36px);margin:9px 0 6px}
 .platform-roles h3,.platform-roles h4{margin:0 0 6px}
 .platform-roles p{margin:0;color:inherit;opacity:.68;line-height:1.55}
 .platform-roles__header-actions{display:flex;align-items:center;gap:10px;flex:none}
 .platform-roles button{border:1px solid rgba(130,145,170,.3);border-radius:9px;padding:10px 14px;background:rgba(130,145,170,.07);color:inherit;cursor:pointer}
 .platform-roles button:disabled{opacity:.5;cursor:not-allowed}
 .platform-roles__scope,.platform-roles__tag,.platform-roles__count{font-size:11px;border:1px solid rgba(130,145,170,.3);border-radius:999px;padding:7px 11px;white-space:nowrap;opacity:.78}
 .platform-roles__panel{border:1px solid rgba(130,145,170,.25);border-radius:16px;padding:20px;background:rgba(130,145,170,.06);min-width:0}
 .platform-roles__panel-head{margin-bottom:15px}
 .platform-roles__role-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
 .platform-roles__role{padding:13px;border:1px solid rgba(130,145,170,.22);border-radius:11px;background:rgba(130,145,170,.035);min-width:0}
 .platform-roles__role strong,.platform-roles__role small{display:block}
 .platform-roles__role small,.platform-roles__permission small,.platform-roles__permission code{font-size:11px;opacity:.68}
 .platform-roles__role p{font-size:12px;margin-top:8px}
 .platform-roles__permission-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px}
 .platform-roles__permission-tags code{font-size:9px;padding:4px 6px;border-radius:5px;background:rgba(130,145,170,.1);color:inherit}
 .platform-roles__group{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;border-top:1px solid rgba(130,145,170,.2);padding-top:14px;margin-top:14px}
 .platform-roles__group h4{text-transform:capitalize;grid-column:1/-1;margin:0 0 2px}
 .platform-roles__permission{display:flex;align-items:flex-start;gap:12px;justify-content:space-between;padding:13px;border:1px solid rgba(130,145,170,.2);border-radius:11px;background:rgba(130,145,170,.035);min-width:0;min-height:100%}
 .platform-roles__permission-copy{flex:1;min-width:0}
 .platform-roles__permission-copy strong,.platform-roles__permission-copy small,.platform-roles__permission-copy code{display:block}
 .platform-roles__permission-copy small{margin:3px 0}
 .platform-roles__permission-copy code{font-size:10px;opacity:.62;overflow-wrap:anywhere}
 .platform-roles__permission-state{font-size:10px;opacity:.68;white-space:nowrap}
 .platform-roles__toggle{position:relative;display:inline-flex;flex:none}
 .platform-roles__toggle input{position:absolute;opacity:0;width:1px;height:1px}
 .platform-roles__toggle span{width:38px;height:22px;border-radius:99px;background:rgba(130,145,170,.48);transition:background .15s;cursor:pointer}
 .platform-roles__toggle span:after{content:"";display:block;width:16px;height:16px;border-radius:50%;background:#fff;margin:3px;transition:transform .15s}
 .platform-roles__toggle input:checked+span{background:var(--purple,#8c72ff)}
 .platform-roles__toggle input:checked+span:after{transform:translateX(16px)}
 .platform-roles__footer{border-top:1px solid rgba(130,145,170,.2);padding-top:15px;margin-top:15px}
 .platform-roles__footer p{font-size:11px;max-width:680px}
 .platform-roles__footer button{background:var(--purple,#8c72ff);color:#fff;border-color:var(--purple,#8c72ff)}
 .platform-roles__error{color:#e36b6b!important;opacity:1!important}
 .platform-roles__success{color:#2ca879!important;opacity:1!important}
 .platform-roles__empty{padding:16px;color:inherit;opacity:.65}
 @media(max-width:980px){.platform-roles__group{grid-template-columns:repeat(2,minmax(0,1fr))}}
 @media(max-width:760px){.platform-roles__role-grid{grid-template-columns:1fr}.platform-roles__header,.platform-roles__panel-head,.platform-roles__footer{align-items:flex-start;flex-direction:column}}
 @media(max-width:520px){.platform-roles__group{grid-template-columns:1fr}}
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
