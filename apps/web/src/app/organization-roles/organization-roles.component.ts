import { CommonModule } from "@angular/common";
import { Component, Input, OnChanges, SimpleChanges } from "@angular/core";
import { FormsModule } from "@angular/forms";
type CustomRole={id:string;name:string;description:string;permissions:string[]};
type PermissionOption={key:string;label:string;group:string;description:string;sensitive?:boolean;selected:boolean};

@Component({
 selector:"bee-organization-roles",standalone:true,imports:[CommonModule,FormsModule],
 template:`
 <section class="org-roles">
  <div class="org-roles__header"><div><h2>Roles &amp; Permissions</h2><p>Configure what each custom role can do in this organization.</p></div><button type="button" (click)="load()" [disabled]="loading">Refresh</button></div>
  <p class="org-roles__error" *ngIf="error" role="alert">{{error}}</p><p class="org-roles__success" *ngIf="message" role="status">{{message}}</p>
  <p class="org-roles__notice" *ngIf="!canManage">You can view roles. Only the organization owner can create, edit or delete custom roles.</p>
  <div class="org-roles__layout">
   <aside class="org-roles__list"><h3>Custom roles</h3><p *ngIf="loading">Loading roles…</p><p *ngIf="!loading&&!roles.length">No custom roles yet.</p>
    <button class="org-roles__role" *ngFor="let item of roles;trackBy:trackRole" type="button" [class.active]="editingId===item.id" (click)="edit(item)"><strong>{{item.name}}</strong><small>{{item.permissions.length}} permissions</small></button>
    <button *ngIf="canManage" class="org-roles__new" type="button" (click)="reset()">+ Create custom role</button>
   </aside>
   <div class="org-roles__editor"><h3>{{editingId?'Edit role':'New custom role'}}</h3>
    <form (submit)="save($event)">
     <label>Role name<input name="roleName" [(ngModel)]="name" maxlength="48" required [disabled]="!canManage"></label>
     <label>Description<input name="roleDescription" [(ngModel)]="description" maxlength="240" [disabled]="!canManage"></label>
     <div class="org-roles__groups"><section *ngFor="let group of groups"><h4>{{group}}</h4>
      <label class="org-roles__permission" *ngFor="let item of inGroup(group)"><input type="checkbox" [checked]="item.selected" (change)="item.selected=$any($event.target).checked" [disabled]="!canManage"><span><strong>{{item.label}}</strong><small>{{item.description}}</small><code>{{item.key}}</code></span><em *ngIf="item.sensitive">Sensitive</em></label>
     </section></div>
     <div class="org-roles__actions" *ngIf="canManage"><button type="submit" [disabled]="busy||!name.trim()">{{busy?'Saving…':editingId?'Save changes':'Create role'}}</button><button type="button" *ngIf="editingId" (click)="remove()" [disabled]="busy">Delete role</button><button type="button" (click)="reset()" [disabled]="busy">Cancel</button></div>
    </form>
   </div>
  </div>
 </section>`,
 styles:[`
 .org-roles{margin-top:18px;color:var(--text-primary,#172033)}.org-roles__header,.org-roles__layout,.org-roles__actions{display:flex;gap:18px}.org-roles__header{align-items:center;justify-content:space-between;margin-bottom:16px}.org-roles h2,.org-roles h3,.org-roles h4{margin:0 0 7px}.org-roles p{color:var(--text-muted,#778197);margin:0 0 12px}.org-roles button{border:1px solid var(--border-color,#dce1ea);border-radius:9px;padding:9px 13px;background:var(--surface,#fff);color:inherit;cursor:pointer}.org-roles button:disabled{opacity:.55;cursor:not-allowed}.org-roles__list{width:250px;flex:0 0 250px;border:1px solid var(--border-color,#dce1ea);border-radius:12px;padding:14px}.org-roles__role{display:flex;width:100%;justify-content:space-between;align-items:center;text-align:left;margin:8px 0}.org-roles__role small,.org-roles__permission small,.org-roles__permission code{display:block;color:var(--text-muted,#778197);font-size:11px}.org-roles__role.active{border-color:var(--accent,#625cf5);background:var(--surface-raised,#f6f7ff)}.org-roles__new{width:100%;margin-top:8px}.org-roles__editor{flex:1;min-width:0;border:1px solid var(--border-color,#dce1ea);border-radius:12px;padding:18px}.org-roles__editor form>label{display:block;margin:12px 0;font-size:13px;font-weight:600}.org-roles__editor input:not([type=checkbox]){display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:10px;border:1px solid var(--border-color,#dce1ea);border-radius:8px;background:var(--surface,#fff);color:inherit}.org-roles__groups{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:20px 0}.org-roles__groups section{border:1px solid var(--border-color,#dce1ea);border-radius:10px;padding:12px}.org-roles__permission{display:flex;align-items:flex-start;gap:9px;padding:10px 0;border-top:1px solid var(--border-subtle,#edf0f5);font-size:13px}.org-roles__permission input{margin-top:3px}.org-roles__permission span{flex:1}.org-roles__permission em{font-size:10px;color:#a65b18;font-style:normal}.org-roles__actions{flex-wrap:wrap}.org-roles__actions button:first-child{background:var(--accent,#625cf5);color:white;border-color:var(--accent,#625cf5)}.org-roles__error{color:#b42318!important}.org-roles__success{color:#16794b!important}.org-roles__notice{padding:12px;border-radius:9px;background:var(--surface-raised,#f6f7fa);margin-bottom:14px}@media(max-width:760px){.org-roles__layout{flex-direction:column}.org-roles__list{width:auto;flex:auto}.org-roles__groups{grid-template-columns:1fr}}
 `]
})
export class OrganizationRolesComponent implements OnChanges{
 @Input() tenantId="";@Input() role="member";@Input() accessToken="";
 roles:CustomRole[]=[];name="";description="";editingId="";loading=false;busy=false;error="";message="";
 permissions:PermissionOption[]=[
 {key:"members.read",label:"View members",group:"Organization",description:"List members and inspect membership details.",selected:true},
 {key:"members.invite",label:"Invite members",group:"Organization",description:"Create and cancel invitations.",selected:false},
 {key:"members.manage",label:"Manage memberships",group:"Organization",description:"Change membership roles and suspend members.",sensitive:true,selected:false},
 {key:"plugins.read",label:"View plugins",group:"Plugins",description:"Browse available plugins.",selected:true},
 {key:"plugins.install",label:"Install plugins",group:"Plugins",description:"Install or activate available plugins.",selected:false},
 {key:"plugins.manage",label:"Manage plugins",group:"Plugins",description:"Change plugin configuration and lifecycle.",sensitive:true,selected:false},
 {key:"billing.manage",label:"Manage billing",group:"Billing",description:"Manage plans, subscriptions and billing settings.",sensitive:true,selected:false},
 {key:"files.read",label:"View files",group:"Files",description:"List and download organization files.",selected:false},
 {key:"files.write",label:"Manage files",group:"Files",description:"Upload and modify organization files.",selected:false},
 {key:"notes.read",label:"View notes",group:"Notes",description:"Read organization notes.",selected:false},
 {key:"notes.write",label:"Manage notes",group:"Notes",description:"Create and modify organization notes.",selected:false},
 {key:"mail.read",label:"Read mail",group:"Mail",description:"Read connected mailbox messages.",selected:false},
 {key:"mail.send",label:"Send mail",group:"Mail",description:"Send messages through connected mailboxes.",selected:false},
 {key:"mail.manage",label:"Manage mailboxes",group:"Mail",description:"Configure and manage organization mailboxes.",sensitive:true,selected:false}
 ];
 get canManage():boolean{return this.role==="owner"||this.role==="super_admin";}
 get groups():string[]{return [...new Set(this.permissions.map(p=>p.group))];}
 inGroup(group:string):PermissionOption[]{return this.permissions.filter(p=>p.group===group);}
 ngOnChanges(changes:SimpleChanges):void{if(changes["tenantId"]||changes["role"]||changes["accessToken"]){this.reset();void this.load();}}
 trackRole(_i:number,item:CustomRole):string{return item.id;}
 private async request(path:string,method="GET",body?:unknown):Promise<any>{const response=await fetch("/api"+path,{method,headers:{authorization:"Bearer "+this.accessToken,...(body?{"content-type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw new Error(result.error||"Role request failed");return result;}
 async load():Promise<void>{if(!this.tenantId||!this.accessToken)return;this.loading=true;this.error="";try{const result=await this.request("/companies/"+encodeURIComponent(this.tenantId)+"/roles");this.roles=result.roles||[];}catch(error){this.error=error instanceof Error?error.message:"Could not load roles";}finally{this.loading=false;}}
 edit(item:CustomRole):void{this.editingId=item.id;this.name=item.name;this.description=item.description||"";for(const p of this.permissions)p.selected=item.permissions.includes(p.key);this.error="";this.message="";}
 reset():void{this.editingId="";this.name="";this.description="";for(const p of this.permissions)p.selected=["members.read","plugins.read"].includes(p.key);this.error="";this.message="";}
 async save(event:Event):Promise<void>{event.preventDefault();if(!this.canManage||this.busy||!this.name.trim())return;this.busy=true;this.error="";this.message="";const body={name:this.name.trim(),description:this.description.trim(),permissions:this.permissions.filter(p=>p.selected).map(p=>p.key)};try{if(this.editingId)await this.request("/companies/"+encodeURIComponent(this.tenantId)+"/roles/"+encodeURIComponent(this.editingId),"PUT",body);else await this.request("/companies/"+encodeURIComponent(this.tenantId)+"/roles","POST",body);this.message=this.editingId?"Role updated.":"Role created.";this.reset();await this.load();}catch(error){this.error=error instanceof Error?error.message:"Could not save role";}finally{this.busy=false;}}
 async remove():Promise<void>{if(!this.canManage||!this.editingId||this.busy)return;this.busy=true;this.error="";this.message="";try{await this.request("/companies/"+encodeURIComponent(this.tenantId)+"/roles/"+encodeURIComponent(this.editingId),"DELETE");this.message="Role deleted.";this.reset();await this.load();}catch(error){this.error=error instanceof Error?error.message:"Could not delete role";}finally{this.busy=false;}}
}
