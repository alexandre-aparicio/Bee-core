import { CommonModule } from "@angular/common";
import { Component, Input, OnChanges, SimpleChanges } from "@angular/core";
import { FormsModule } from "@angular/forms";

type RoleRecord = { id?:string; key?:string; name?:string; label?:string; description?:string; mode?:"grant"|"restriction"; permissions:string[]; protected?:boolean };
type MemberRecord = { userId:string; email:string|null; role:string; customRoleId:string|null; restrictionRoleIds:string[]; status:string };
type PermissionRecord = { key:string; label:string; sensitive?:boolean; customRoleAssignable?:boolean };
type AuditRecord = { id:string; actorId:string; action:string; outcome:"success"|"denied"; resourceType?:string; resourceId?:string; metadata?:Record<string,string|number|boolean|null>; occurredAt:string };
type ConflictRecord = { member:string; permission:string; grantRole:string; restrictionRole:string; kind:"overlap"|"broad" };
type SensitiveRecord = { key:string; label:string; users:string[]; roles:string[] };
type ActivityRecord = { id:string; actor:string; target:string; action:string; summary:string; occurredAt:string; outcome:string };

@Component({
 selector:"bee-role-audit",
 standalone:true,
 imports:[CommonModule,FormsModule],
 template:`
  <section class="role-audit">
   <header class="role-audit__heading">
    <div><span class="role-audit__eyebrow">ACCESS GOVERNANCE</span><h3>Role Audit</h3><p>Review permission exposure, policy overlaps and the history of access changes in this organization.</p></div>
    <button type="button" class="role-audit__refresh" (click)="load()" [disabled]="loading">↻ <span>Refresh</span></button>
   </header>
   <div class="role-audit__error" *ngIf="error" role="alert">{{error}}</div>
   <div class="role-audit__metrics">
    <article><span class="role-audit__metric-icon is-danger">⌁</span><div><strong>{{conflicts.length}}</strong><small>Policy reviews</small></div><em>Grant / restriction overlaps</em></article>
    <article><span class="role-audit__metric-icon is-warning">◇</span><div><strong>{{sensitive.length}}</strong><small>Sensitive permissions</small></div><em>{{sensitiveUserCount}} users with access</em></article>
    <article><span class="role-audit__metric-icon is-accent">↗</span><div><strong>{{activity.length}}</strong><small>Recent access events</small></div><em>Latest {{events.length}} audit records checked</em></article>
   </div>

   <section class="role-audit__section">
    <header class="role-audit__section-heading"><div><span class="role-audit__index">01 / POLICY</span><h4>Permission Conflicts</h4><p>Explicit overlaps between granted permissions and assigned restriction roles, plus unusually broad custom grant profiles.</p></div><span class="role-audit__count" [class.is-warning]="conflicts.length">{{conflicts.length}} reviews</span></header>
    <div class="role-audit__toolbar"><label class="role-audit__search"><span>⌕</span><input [(ngModel)]="conflictSearch" placeholder="Search member, role or permission…" aria-label="Search permission conflicts"></label><span class="role-audit__hint">Detected from current assignments</span></div>
    <div class="role-audit__table-wrap" *ngIf="filteredConflicts.length; else noConflicts">
     <table><thead><tr><th>Member / Role</th><th>Permission</th><th>Grant source</th><th>Restriction</th><th>Finding</th></tr></thead>
      <tbody><tr *ngFor="let item of filteredConflicts">
       <td><strong>{{item.member}}</strong></td><td><code>{{item.permission}}</code></td><td>{{item.grantRole}}</td><td>{{item.restrictionRole}}</td>
       <td><span class="role-audit__status" [class.is-warning]="item.kind==='broad'">{{item.kind==='overlap'?'Explicit overlap':'Broad grant set'}}</span></td>
      </tr></tbody>
     </table>
    </div>
    <ng-template #noConflicts><div class="role-audit__empty"><span>✓</span><strong>{{loading?'Checking assignments…':'No policy overlaps detected'}}</strong><p>{{loading?'Loading current roles and memberships.':'No member currently has the same permission explicitly granted and denied. Broad grant profiles are also absent.'}}</p></div></ng-template>
    <p class="role-audit__footnote">An overlap is not automatically an access leak: restriction permissions take precedence. Broad profiles are review signals, not proof of misuse.</p>
   </section>

   <section class="role-audit__section">
    <header class="role-audit__section-heading"><div><span class="role-audit__index">02 / EXPOSURE</span><h4>Sensitive Permissions</h4><p>People who currently receive sensitive permissions, including the role path that grants access.</p></div><span class="role-audit__count is-warning">{{sensitiveUserCount}} users</span></header>
    <div class="role-audit__toolbar"><label class="role-audit__search"><span>⌕</span><input [(ngModel)]="sensitiveSearch" placeholder="Search permission or user…" aria-label="Search sensitive permissions"></label><span class="role-audit__hint">Effective access after restrictions</span></div>
    <div class="role-audit__table-wrap" *ngIf="filteredSensitive.length; else noSensitive">
     <table><thead><tr><th>Permission</th><th>Users with access</th><th>Granted through</th><th>Exposure</th></tr></thead>
      <tbody><tr *ngFor="let item of filteredSensitive">
       <td><strong>{{item.label}}</strong><code>{{item.key}}</code></td><td><span class="role-audit__people">{{item.users.join(', ')}}</span></td><td>{{item.roles.join(', ')}}</td><td><span class="role-audit__status is-warning">Sensitive</span></td>
      </tr></tbody>
     </table>
    </div>
    <ng-template #noSensitive><div class="role-audit__empty"><span>◇</span><strong>{{loading?'Reviewing access…':'No sensitive permissions currently assigned'}}</strong><p>{{loading?'Loading permission catalogue and active memberships.':'No active membership currently has an effective grant for a permission marked sensitive.'}}</p></div></ng-template>
   </section>

   <section class="role-audit__section">
    <header class="role-audit__section-heading"><div><span class="role-audit__index">03 / HISTORY</span><h4>Role &amp; Permission Activity</h4><p>Who assigned access, who received it, and exactly what changed in a role or membership.</p></div><span class="role-audit__count">{{activity.length}} events</span></header>
    <div class="role-audit__toolbar">
     <label class="role-audit__search"><span>⌕</span><input [(ngModel)]="activitySearch" placeholder="Search actor, member or change…" aria-label="Search role activity"></label>
     <select [(ngModel)]="activityFilter" aria-label="Filter role activity"><option value="all">All activity</option><option value="assignment">Assignments</option><option value="role">Role changes</option></select>
    </div>
    <div class="role-audit__table-wrap" *ngIf="filteredActivity.length; else noActivity">
     <table><thead><tr><th>Performed by</th><th>Target</th><th>Activity</th><th>Change details</th><th>Date</th></tr></thead>
      <tbody><tr *ngFor="let item of filteredActivity">
       <td><strong>{{item.actor}}</strong></td><td>{{item.target}}</td><td><span class="role-audit__event" [class.is-denied]="item.outcome==='denied'">{{item.action}}</span></td><td class="role-audit__summary">{{item.summary}}</td><td class="role-audit__date">{{item.occurredAt | date:'medium'}}</td>
      </tr></tbody>
     </table>
    </div>
    <ng-template #noActivity><div class="role-audit__empty"><span>↗</span><strong>{{loading?'Loading audit history…':'No role activity recorded yet'}}</strong><p>{{loading?'Retrieving the latest organization audit events.':'Role creation, edits, assignments and permission changes will appear here as they happen.'}}</p></div></ng-template>
    <div class="role-audit__footer"><span>Showing the latest {{events.length}} audit events available to this view.</span><button type="button" (click)="load()" [disabled]="loading">Refresh history</button></div>
   </section>
   <p class="role-audit__disclaimer">Audit history is append-only. Historical events created before detailed change tracking was introduced may contain less detail than new events.</p>
  </section>
 `,
 styles:[`
  :host{display:block;min-width:0}
  .role-audit{--ra-surface:var(--surface,rgba(130,145,170,.045));--ra-raised:var(--surface-raised,var(--panel));--ra-border:var(--border,#8885);--ra-muted:var(--muted,inherit);--ra-purple:var(--purple,#8c72ff);--ra-cyan:var(--cyan,#00f5d4);display:grid;gap:18px;color:inherit}
  .role-audit__heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.role-audit__eyebrow,.role-audit__index{font-size:9px;letter-spacing:.14em;font-weight:750;color:var(--ra-purple)}.role-audit__heading h3{font-size:17px;margin:4px 0}.role-audit__heading p,.role-audit__section-heading p{font-size:11px;color:var(--ra-muted);margin:4px 0 0;line-height:1.55}
  .role-audit__refresh,.role-audit__footer button{display:flex;align-items:center;gap:7px;min-height:34px;padding:0 11px;border:1px solid var(--ra-border);border-radius:8px;background:var(--ra-surface);color:inherit;font-size:10px;font-weight:650}.role-audit__refresh:hover,.role-audit__footer button:hover{border-color:var(--ra-purple);color:var(--ra-purple)}
  .role-audit__error{padding:10px 12px;border:1px solid color-mix(in srgb,var(--danger,#d65b5b) 35%,var(--ra-border));border-radius:8px;color:var(--danger,#d65b5b);font-size:11px}
  .role-audit__metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.role-audit__metrics article{display:grid;grid-template-columns:36px auto;gap:2px 10px;align-items:center;min-width:0;padding:13px;border:1px solid var(--ra-border);border-radius:11px;background:var(--ra-surface)}.role-audit__metric-icon{grid-row:span 2;display:grid;place-items:center;width:34px;height:34px;border-radius:9px;background:color-mix(in srgb,var(--ra-purple) 12%,transparent);color:var(--ra-purple);font-size:19px}.role-audit__metric-icon.is-danger{background:color-mix(in srgb,var(--danger,#d65b5b) 12%,transparent);color:var(--danger,#d65b5b)}.role-audit__metric-icon.is-warning{background:color-mix(in srgb,var(--warning,#c58a35) 13%,transparent);color:var(--warning,#c58a35)}.role-audit__metrics strong{font-size:20px;font-variant-numeric:tabular-nums;line-height:1.1}.role-audit__metrics small,.role-audit__metrics em{display:block;font-size:9px;color:var(--ra-muted);font-style:normal}.role-audit__metrics em{grid-column:2;font-size:8px;margin-top:2px}
  .role-audit__section{display:grid;gap:11px;padding:15px;border:1px solid var(--ra-border);border-radius:12px;background:var(--ra-raised);box-shadow:0 5px 20px rgba(15,23,42,.035)}.role-audit__section-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.role-audit__section-heading h4{font-size:13px;margin:3px 0 0}.role-audit__count{flex:0 0 auto;padding:5px 8px;border:1px solid var(--ra-border);border-radius:20px;font-size:9px;font-weight:650;font-variant-numeric:tabular-nums}.role-audit__count.is-warning{border-color:color-mix(in srgb,var(--warning,#c58a35) 38%,var(--ra-border));color:var(--warning,#c58a35)}
  .role-audit__toolbar{display:flex;align-items:center;gap:10px}.role-audit__search{display:flex;align-items:center;gap:8px;flex:1;min-width:160px;height:34px;padding:0 10px;border:1px solid var(--ra-border);border-radius:8px;background:var(--ra-surface)}.role-audit__search span{font-size:17px;opacity:.55}.role-audit__search input{width:100%;min-width:0;border:0!important;outline:0!important;background:transparent!important;color:inherit;font-size:10px;padding:0!important}.role-audit__toolbar select{height:34px;min-width:140px;padding:0 9px;border:1px solid var(--ra-border);border-radius:8px;background:var(--ra-surface);color:inherit;font-size:10px}.role-audit__hint{font-size:9px;color:var(--ra-muted);white-space:nowrap}
  .role-audit__table-wrap{width:100%;overflow-x:auto;border:1px solid var(--ra-border);border-radius:9px}.role-audit table{width:100%;min-width:760px;border-collapse:collapse;text-align:left}.role-audit th{padding:10px 11px;background:color-mix(in srgb,var(--ra-muted) 7%,var(--ra-surface));color:var(--ra-muted);font-size:9px;font-weight:700;white-space:nowrap}.role-audit td{padding:10px 11px;border-top:1px solid var(--ra-border);font-size:10px;vertical-align:middle}.role-audit td strong,.role-audit td code{display:block}.role-audit td code{margin-top:3px;font-size:9px;color:var(--ra-muted);overflow-wrap:anywhere}.role-audit tbody tr{transition:background .14s ease}.role-audit tbody tr:hover{background:color-mix(in srgb,var(--ra-purple) 5%,transparent)}.role-audit__status,.role-audit__event{display:inline-flex;padding:4px 7px;border:1px solid var(--ra-border);border-radius:20px;font-size:8px;font-weight:700;white-space:nowrap}.role-audit__status.is-warning{border-color:color-mix(in srgb,var(--warning,#c58a35) 35%,var(--ra-border));color:var(--warning,#c58a35)}.role-audit__event.is-denied{color:var(--danger,#d65b5b);border-color:color-mix(in srgb,var(--danger,#d65b5b) 35%,var(--ra-border))}.role-audit__people,.role-audit__summary{display:block;max-width:340px;overflow-wrap:anywhere;line-height:1.5}.role-audit__date{white-space:nowrap;color:var(--ra-muted);font-size:9px!important}
  .role-audit__empty{display:grid;justify-items:center;gap:5px;padding:24px 12px;border:1px dashed var(--ra-border);border-radius:9px;text-align:center}.role-audit__empty>span{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:color-mix(in srgb,var(--ra-purple) 10%,transparent);color:var(--ra-purple);font-size:15px}.role-audit__empty strong{font-size:11px}.role-audit__empty p,.role-audit__footnote,.role-audit__disclaimer,.role-audit__footer span{font-size:9px;color:var(--ra-muted);line-height:1.5;margin:0}.role-audit__footnote{padding-top:1px}.role-audit__footer{display:flex;align-items:center;justify-content:space-between;gap:10px}.role-audit__footer button{min-height:28px;font-size:9px}.role-audit__disclaimer{padding:0 2px}
  @media(max-width:760px){.role-audit__metrics{grid-template-columns:1fr}.role-audit__metrics article{grid-template-columns:34px 1fr auto}.role-audit__metrics article em{grid-column:3;grid-row:1/3;text-align:right}.role-audit__section{padding:11px}.role-audit__hint{display:none}}
  @media(max-width:520px){.role-audit__heading,.role-audit__section-heading{flex-direction:column}.role-audit__toolbar{align-items:stretch;flex-direction:column}.role-audit__toolbar select{width:100%}.role-audit__footer{align-items:flex-start;flex-direction:column}}
  :host-context(.bee-template-package-host--midnight[data-bee-dashboard-mode="light"]) .role-audit{--ra-surface:#f7f8fc;--ra-raised:#fff;--ra-border:#dfe5ef;--ra-muted:#68758b;--ra-purple:#5542bd;--ra-cyan:#0891b2;color:#263248}
 `]
})
export class RoleAuditComponent implements OnChanges {
 @Input() tenantId=""; @Input() role="member"; @Input() accessToken="";
 loading=false; error=""; events:AuditRecord[]=[]; conflicts:ConflictRecord[]=[]; sensitive:SensitiveRecord[]=[]; activity:ActivityRecord[]=[];
 conflictSearch=""; sensitiveSearch=""; activitySearch=""; activityFilter:"all"|"assignment"|"role"="all";
 private sequence=0;
 get canRead():boolean{return ["owner","admin","super_admin"].includes(this.role);}
 get sensitiveUserCount():number{return new Set(this.sensitive.flatMap(item=>item.users)).size;}
 get filteredConflicts():ConflictRecord[]{const q=this.conflictSearch.trim().toLowerCase();return this.conflicts.filter(x=>!q||[x.member,x.permission,x.grantRole,x.restrictionRole].some(v=>v.toLowerCase().includes(q)));}
 get filteredSensitive():SensitiveRecord[]{const q=this.sensitiveSearch.trim().toLowerCase();return this.sensitive.filter(x=>!q||[x.key,x.label,...x.users,...x.roles].some(v=>v.toLowerCase().includes(q)));}
 get filteredActivity():ActivityRecord[]{const q=this.activitySearch.trim().toLowerCase();return this.activity.filter(x=>(this.activityFilter==="all"||(this.activityFilter==="assignment"?x.action.toLowerCase().includes("member")||x.action.toLowerCase().includes("assign"):x.action.toLowerCase().includes("role")))&&(!q||[x.actor,x.target,x.action,x.summary].some(v=>v.toLowerCase().includes(q))));}
 ngOnChanges(changes:SimpleChanges):void{if(changes["tenantId"]||changes["role"]||changes["accessToken"]){this.sequence++;this.events=[];this.conflicts=[];this.sensitive=[];this.activity=[];this.loading=false;if(this.canRead&&this.tenantId&&this.accessToken)void this.load();}}
 private async get(path:string):Promise<any>{const response=await fetch("/api"+path,{headers:{authorization:"Bearer "+this.accessToken}});const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not load role audit");return data;}
 async load():Promise<void>{
  if(!this.canRead||!this.tenantId||!this.accessToken||this.loading)return;
  const requestId=++this.sequence,tenant=this.tenantId;this.loading=true;this.error="";
  try{
   const base="/companies/"+encodeURIComponent(tenant);
   const [roleData,memberData,auditData]=await Promise.all([this.get(base+"/roles"),this.get(base+"/memberships"),this.get(base+"/role-audit-events")]);
   if(requestId!==this.sequence||tenant!==this.tenantId)return;
   const customs:RoleRecord[]=(roleData.roles||[]).map((r:any)=>({...r,id:String(r.id),name:r.name,mode:r.mode??"grant",permissions:Array.isArray(r.permissions)?r.permissions:[]}));
   const native:RoleRecord[]=(roleData.systemRoles||[]).map((r:any)=>({...r,key:r.key,label:r.label,mode:"grant",permissions:Array.isArray(r.permissions)?r.permissions:[]}));
   const roleById=new Map<string,RoleRecord>(customs.map(r=>[String(r.id),r] as const)),nativeByKey=new Map<string,RoleRecord>(native.map(r=>[String(r.key),r] as const));
   const permissionCatalog:PermissionRecord[]=Array.isArray(roleData.permissionCatalog)?roleData.permissionCatalog:[];
   const sensitiveCatalog=permissionCatalog.filter(p=>p.sensitive);
   const memberships:MemberRecord[]=(memberData.memberships||[]).filter((m:any)=>m.status==="active");
   const memberNames=new Map(memberships.map(m=>[m.userId,m.email||"Organization member"]));
   const overlapRows:ConflictRecord[]=[];
   const accessMap=new Map<string,{users:Set<string>;roles:Set<string>;label:string}>();
   for(const member of memberships){
    const grant=member.role==="custom"&&member.customRoleId?roleById.get(member.customRoleId):nativeByKey.get(member.role);
    if(!grant)continue;
    const restrictions=(member.restrictionRoleIds||[]).map(id=>roleById.get(id)).filter((r):r is RoleRecord=>!!r&&r.mode==="restriction");
    const denied=new Map<string,string>();for(const restriction of restrictions)for(const key of restriction.permissions)denied.set(key,restriction.name||"Restriction role");
    const grants=new Set(grant.permissions||[]);
    for(const key of grants){if(denied.has(key)){overlapRows.push({member:member.email||"Organization member",permission:key,grantRole:grant.name||grant.label||grant.key||"Role",restrictionRole:denied.get(key)||"Restriction",kind:"overlap"});}}
    for(const permission of sensitiveCatalog){
     if(!grants.has(permission.key)||denied.has(permission.key))continue;
     const row=accessMap.get(permission.key)||{users:new Set<string>(),roles:new Set<string>(),label:permission.label||permission.key};
     row.users.add(member.email||"Organization member");row.roles.add(grant.name||grant.label||grant.key||"Role");accessMap.set(permission.key,row);
    }
   }
   const assignableCount=permissionCatalog.filter(p=>p.customRoleAssignable).length;
   for(const role of customs.filter(r=>r.mode!=="restriction")){
    const count=role.permissions.filter(key=>permissionCatalog.find(p=>p.key===key)?.customRoleAssignable).length;
    if(assignableCount>0&&count/assignableCount>=.75)overlapRows.push({member:"Role profile",permission:count+" / "+assignableCount+" assignable permissions",grantRole:role.name||"Custom role",restrictionRole:"—",kind:"broad"});
   }
   this.conflicts=overlapRows;
   this.sensitive=[...accessMap.entries()].map(([key,value])=>({key,label:value.label,users:[...value.users],roles:[...value.roles]})).sort((a,b)=>a.label.localeCompare(b.label));
   this.events=Array.isArray(auditData.events)?auditData.events:[];
   const relevant=this.events.filter(e=>["role.created","role.updated","role.deleted","member.added","member.invited","member.role_changed","member.suspended","member.activated"].includes(e.action));
   this.activity=relevant.map(e=>{
    const meta=e.metadata||{},actor=String(meta.actorEmail||memberNames.get(e.actorId)||"Organization administrator"),target=String(meta.targetEmail||((e.resourceType==="membership"&&e.resourceId)?memberNames.get(e.resourceId)||"Organization member":e.resourceType==="role"?String(meta.name||"Role"):"—"));
    const summary=String(meta.changeSummary||meta.summary||[meta.previousRole?String(meta.previousRole)+" → "+String(meta.newRole||""):"",meta.roleName||meta.name||"",meta.addedPermissionCount?String(meta.addedPermissionCount)+" permissions added":"",meta.removedPermissionCount?String(meta.removedPermissionCount)+" permissions removed":"",meta.phase||""].filter(Boolean).join(" · ")||"Details not available for this historical event");
    return {id:e.id,actor,target,action:e.action.replaceAll("."," ").replaceAll("_"," "),summary,occurredAt:e.occurredAt,outcome:e.outcome};
   });
  }catch(error){if(requestId===this.sequence)this.error=error instanceof Error?error.message:"Could not load role audit";}
  finally{if(requestId===this.sequence)this.loading=false;}
 }
}
