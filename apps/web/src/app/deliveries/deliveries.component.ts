import { CommonModule } from "@angular/common";
import { Component, Input, OnChanges, OnInit, SimpleChanges } from "@angular/core";
import { FormsModule } from "@angular/forms";

type Delivery = { id:string; reference:string; kind:"delivery"|"pickup"; status:string; recipient:string; phone:string; address:string; notes:string; assignedToMe:boolean; assigned:boolean; assignedToId:string|null; plannedAt:string|null; createdAt:string };
type DeliveryMember = { userId:string; email:string|null; role:string; status:string };
@Component({
  selector:"bee-deliveries", standalone:true, imports:[CommonModule,FormsModule],
  template:`
<section class="panel bee-deliveries">
  <header class="bee-deliveries__header">
    <div><p class="bee-deliveries__eyebrow">OPERACIONES</p><h2>Entregas y Recogidas</h2><p>Organiza servicios, asigna responsables y sigue cada operación.</p></div>
    <button type="button" (click)="load()" [disabled]="loading">Actualizar</button>
  </header>
  <form class="bee-deliveries__form" (ngSubmit)="create()" *ngIf="canWrite">
    <h3>Nueva operación</h3>
    <div class="bee-deliveries__fields">
      <label>Tipo<select name="kind" [(ngModel)]="draft.kind"><option value="delivery">Entrega</option><option value="pickup">Recogida</option></select></label>
      <label>Destinatario<input name="recipient" [(ngModel)]="draft.recipient" maxlength="120" required></label>
      <label>Teléfono<input name="phone" [(ngModel)]="draft.phone" maxlength="40"></label>
      <label>Fecha prevista<input name="plannedAt" type="datetime-local" [(ngModel)]="draft.plannedAt"></label>
      <label class="wide">Dirección<input name="address" [(ngModel)]="draft.address" maxlength="500" required></label>
      <label class="wide">Notas<textarea name="notes" [(ngModel)]="draft.notes" maxlength="2000" rows="2"></textarea></label>
    </div>
    <button type="submit" [disabled]="saving || !draft.recipient.trim() || !draft.address.trim()">{{saving ? "Guardando…" : "Crear operación"}}</button>
  </form>
  <p *ngIf="error" class="bee-deliveries__error" role="alert">{{error}}</p>
  <p *ngIf="message" class="bee-deliveries__message" role="status">{{message}}</p>
  <div *ngIf="loading" class="bee-deliveries__empty">Cargando operaciones…</div>
  <div *ngIf="!loading && deliveries.length===0" class="bee-deliveries__empty">Todavía no hay entregas ni recogidas.</div>
  <div class="bee-deliveries__filters">
    <label>Estado<select [(ngModel)]="statusFilter" [ngModelOptions]="{standalone:true}" (ngModelChange)="load()"><option value="">Todos los estados</option><option value="draft">Borrador</option><option value="assigned">Asignada</option><option value="picked_up">Recogida</option><option value="in_transit">En tránsito</option><option value="delivered">Entregada</option><option value="failed">Incidencia</option><option value="cancelled">Cancelada</option></select></label>
    <label *ngIf="canManage">Responsable<select [(ngModel)]="assignmentFilter" [ngModelOptions]="{standalone:true}" (ngModelChange)="load()"><option value="all">Todos</option><option value="mine">Asignadas a mí</option><option value="unassigned">Sin asignar</option></select></label>
  </div>
  <div class="bee-deliveries__list">
    <article *ngFor="let item of deliveries;trackBy:track" class="bee-deliveries__item">
      <div class="bee-deliveries__main"><div><strong>{{item.reference}}</strong><span class="bee-deliveries__tag">{{item.kind==="pickup"?"Recogida":"Entrega"}}</span></div><h3>{{item.recipient}}</h3><p>{{item.address}}</p><small>{{item.phone}} <span *ngIf="item.plannedAt">· {{item.plannedAt | date:'short'}}</span></small></div>
      <div class="bee-deliveries__side"><span class="bee-deliveries__status">{{statusLabel(item.status)}}</span><label *ngIf="canManage" class="bee-deliveries__assignee">Responsable<select [ngModel]="item.assignedToId || ''" (ngModelChange)="assign(item,$event)" [ngModelOptions]="{standalone:true}" [disabled]="saving"><option value="">Sin asignar</option><option *ngFor="let member of members" [value]="member.userId">{{member.email || member.userId}} · {{member.role}}</option></select></label><small *ngIf="!canManage && item.assignedToMe">Asignada a ti</small><select *ngIf="canUpdate(item)" [ngModel]="item.status" (ngModelChange)="changeStatus(item,$event)" [ngModelOptions]="{standalone:true}" aria-label="Estado de la operación"><option *ngFor="let status of nextStatuses(item.status)" [value]="status">{{statusLabel(status)}}</option></select></div>
    </article>
  </div>
</section>`,
  styles:[`
.bee-deliveries{display:grid;gap:1.2rem}.bee-deliveries__header{display:flex;justify-content:space-between;align-items:center;gap:1rem}.bee-deliveries__header h2{margin:.15rem 0}.bee-deliveries__header p{margin:.25rem 0;color:var(--muted,#718096)}.bee-deliveries__eyebrow{font-size:.7rem;letter-spacing:.12em;font-weight:700}.bee-deliveries button{border:0;border-radius:9px;padding:.65rem 1rem;background:var(--accent,#e87524);color:white;cursor:pointer}.bee-deliveries button:disabled{opacity:.55}.bee-deliveries__form{padding:1rem;border:1px solid var(--border,#e5e7eb);border-radius:12px}.bee-deliveries__fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem}.bee-deliveries label{display:grid;gap:.35rem;font-size:.85rem}.bee-deliveries input,.bee-deliveries textarea,.bee-deliveries select{width:100%;min-width:0;padding:.65rem;border:1px solid var(--border,#d8dee8);border-radius:8px;background:var(--surface,#fff);color:inherit}.bee-deliveries .wide{grid-column:1/-1}.bee-deliveries__form>button{margin-top:.8rem}.bee-deliveries__filters{display:flex;gap:.8rem;flex-wrap:wrap}.bee-deliveries__filters label{display:grid;gap:.3rem;min-width:180px;font-size:.8rem}.bee-deliveries__list{display:grid;gap:.65rem}.bee-deliveries__item{display:flex;justify-content:space-between;gap:1rem;padding:1rem;border:1px solid var(--border,#e5e7eb);border-radius:12px}.bee-deliveries__main h3{margin:.45rem 0 .2rem}.bee-deliveries__main p{margin:.2rem 0}.bee-deliveries__main small{color:var(--muted,#718096)}.bee-deliveries__tag,.bee-deliveries__status{display:inline-block;margin-left:.5rem;padding:.2rem .55rem;border-radius:99px;background:var(--surface-muted,#f1f5f9);font-size:.75rem}.bee-deliveries__side{display:flex;flex-direction:column;align-items:flex-end;gap:.5rem;min-width:130px}.bee-deliveries__side select{max-width:220px}.bee-deliveries__assignee{display:grid;gap:.25rem;font-size:.75rem;color:var(--muted,#718096)}.bee-deliveries__empty{padding:1.5rem;text-align:center;color:var(--muted,#718096)}.bee-deliveries__error{color:#b42318}.bee-deliveries__message{color:#16794b}@media(max-width:650px){.bee-deliveries__header,.bee-deliveries__item{align-items:stretch;flex-direction:column}.bee-deliveries__side{align-items:flex-start}.bee-deliveries__fields{grid-template-columns:1fr}.bee-deliveries .wide{grid-column:auto}}`
  ]
})
export class BeeDeliveriesComponent implements OnInit,OnChanges {
  @Input() tenantId=""; @Input() role="member"; @Input() accessToken="";
  deliveries:Delivery[]=[]; members:DeliveryMember[]=[]; statusFilter=""; assignmentFilter:"all"|"mine"|"unassigned"="all"; loading=false; saving=false; error=""; message="";
  draft={kind:"delivery" as "delivery"|"pickup",recipient:"",phone:"",address:"",notes:"",plannedAt:""};
  get canWrite():boolean{return ["owner","admin","manager","super_admin"].includes(this.role);}
  get canManage():boolean{return this.canWrite;}
  ngOnInit():void{void this.load();}
  ngOnChanges(changes:SimpleChanges):void{if(changes["accessToken"]&&!changes["accessToken"].firstChange)void this.load();}
  track(_i:number,item:Delivery):string{return item.id;}
  private async request(url:string,method="GET",body?:unknown):Promise<any>{
    const response=await fetch(url,{method,headers:{authorization:"Bearer "+this.accessToken,...(body?{"content-type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const result=await response.json();if(!response.ok)throw new Error(result.error||"No se pudo completar la operación.");return result;
  }
  async load():Promise<void>{if(!this.accessToken)return;this.loading=true;this.error="";try{
    const params=new URLSearchParams();if(this.statusFilter)params.set("status",this.statusFilter);if(this.canManage&&this.assignmentFilter!=="all")params.set("assignment",this.assignmentFilter);
    const result=await this.request("/api/deliveries"+(params.size?"?"+params.toString():""));
    this.deliveries=result.deliveries||[];
    if(this.canManage && this.tenantId){
      const directory=await this.request("/api/companies/"+encodeURIComponent(this.tenantId)+"/memberships");
      this.members=(directory.memberships||[]).filter((member:DeliveryMember)=>member.status==="active");
    } else this.members=[];
  }catch(e){this.error=e instanceof Error?e.message:"No se pudieron cargar las operaciones.";this.deliveries=[];this.members=[];}finally{this.loading=false;}}
  async create():Promise<void>{if(this.saving||!this.draft.recipient.trim()||!this.draft.address.trim())return;this.saving=true;this.error="";this.message="";try{await this.request("/api/deliveries","POST",{...this.draft,plannedAt:this.draft.plannedAt?new Date(this.draft.plannedAt).toISOString():undefined});this.draft={kind:"delivery",recipient:"",phone:"",address:"",notes:"",plannedAt:""};await this.load();this.message="Operación creada.";}catch(e){this.error=e instanceof Error?e.message:"No se pudo crear la operación.";}finally{this.saving=false;}}
  async assign(item:Delivery,userId:string):Promise<void>{await this.update(item,{assignedToUserId:userId||null});}
  async changeStatus(item:Delivery,status:string):Promise<void>{await this.update(item,{status});}
  private async update(item:Delivery,body:unknown):Promise<void>{if(this.saving)return;this.saving=true;this.error="";try{await this.request("/api/deliveries/"+encodeURIComponent(item.id),"PATCH",body);await this.load();}catch(e){this.error=e instanceof Error?e.message:"No se pudo actualizar la operación.";}finally{this.saving=false;}}
  canUpdate(item:Delivery):boolean{return this.canManage||item.assignedToMe;}
  nextStatuses(status:string):string[]{const map:Record<string,string[]>={draft:["assigned","cancelled"],assigned:["picked_up","in_transit","failed","cancelled"],picked_up:["in_transit","failed","cancelled"],in_transit:["delivered","failed"],failed:["assigned","cancelled"]};return map[status]||[];}
  statusLabel(status:string):string{return ({draft:"Borrador",assigned:"Asignada",picked_up:"Recogida",in_transit:"En tránsito",delivered:"Entregada",failed:"Incidencia",cancelled:"Cancelada"} as Record<string,string>)[status]||status;}
}
