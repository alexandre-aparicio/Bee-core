import { CommonModule } from "@angular/common";
import { Component, Input, OnInit } from "@angular/core";
import { FormsModule } from "@angular/forms";
type ClockEvent={type:string;occurredAt:string;source:string};
type TimeSession={id:string;status:"working"|"on_break"|"closed";startedAt:string;endedAt:string|null;events:ClockEvent[]};
type TeamMember={userId:string;email:string;role:string};
type ScheduleDay={day:number;enabled:boolean;start:string;end:string;breakMinutes:number};
type Schedule={userId:string;timezone:string;days:Array<{day:number;start:string;end:string;breakMinutes:number}>};
type Correction={id:string;sessionId:string;userEmail?:string;eventType:"clock_in"|"clock_out";originalAt:string;requestedAt:string;reason:string;status:string;createdAt:string;reviewNote?:string};
@Component({selector:"bee-time-tracking",standalone:true,imports:[CommonModule,FormsModule],templateUrl:"./time-tracking.component.html",styleUrls:["./time-tracking.component.css"]})
export class BeeTimeTrackingComponent implements OnInit {
 @Input() tenantId=""; @Input() role="member"; @Input() accessToken="";
 session:TimeSession|null=null; history:TimeSession[]=[]; corrections:Correction[]=[]; teamCorrections:Correction[]=[]; members:TeamMember[]=[];
 loading=false; busy=false; error=""; message=""; activeTab:"my-time"|"schedules"|"requests"="my-time";
 selectedUserId=""; timezone="Europe/Madrid";
 scheduleDraft:ScheduleDay[]=Array.from({length:7},(_,day)=>({day,enabled:false,start:"09:00",end:"17:00",breakMinutes:0}));
 correctionTarget:{sessionId:string;eventType:"clock_in"|"clock_out";originalAt:string}|null=null;
 requestedAt=""; correctionReason="";
 ngOnInit():void{void this.load();}
 get canManage():boolean{return ["owner","admin","manager","super_admin","superadmin"].includes(this.role.toLowerCase());}
 private async request(path:string,method="GET",body?:unknown):Promise<any>{
  const response=await fetch("/api"+path,{method,headers:{authorization:"Bearer "+this.accessToken,...(body!==undefined?{"content-type":"application/json"}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const data=await response.json();if(!response.ok)throw new Error(data.error||"Time tracking request failed");return data;
 }
 async load():Promise<void>{
  if(!this.accessToken)return;this.loading=true;this.error="";
  try{
   const [status,history,corrections]=await Promise.all([this.request("/time-tracking/me/status"),this.request("/time-tracking/me/sessions?limit=30"),this.request("/time-tracking/me/corrections")]);
   this.session=status.session??null;this.history=history.sessions??[];this.corrections=corrections.corrections??[];
   if(this.canManage)await this.loadTeam();
  }catch(error){this.error=error instanceof Error?error.message:"Could not load time tracking";}finally{this.loading=false;}
 }
 async loadTeam():Promise<void>{
  const [members,corrections]=await Promise.all([this.request("/time-tracking/team/members"),this.request("/time-tracking/team/corrections?status=pending")]);
  this.members=members.members??[];this.teamCorrections=corrections.corrections??[];
  if(!this.selectedUserId&&this.members.length)this.selectedUserId=this.members[0].userId;
 }
 async act(action:"clock-in"|"break-start"|"break-end"|"clock-out"):Promise<void>{
  if(this.busy)return;this.busy=true;this.error="";this.message="";
  try{await this.request("/time-tracking/"+action,"POST",{operationId:crypto.randomUUID(),source:"web"});await this.load();this.message=({"clock-in":"Entrada registrada.","break-start":"Pausa iniciada.","break-end":"Pausa finalizada.","clock-out":"Salida registrada."} as Record<string,string>)[action];}
  catch(error){this.error=error instanceof Error?error.message:"Could not register the action";}finally{this.busy=false;}
 }
 get elapsed():string{if(!this.session)return "—";const end=this.session.endedAt?new Date(this.session.endedAt).getTime():Date.now();const mins=Math.floor(Math.max(0,end-new Date(this.session.startedAt).getTime())/60000);return Math.floor(mins/60)+" h "+String(mins%60).padStart(2,"0")+" min";}
 label(type:string):string{return ({clock_in:"Entrada",break_start:"Inicio de pausa",break_end:"Fin de pausa",clock_out:"Salida"} as Record<string,string>)[type]??type;}
 trackEvent(index:number,event:ClockEvent):string{return event.type+event.occurredAt+index;}
 openCorrection(session:TimeSession,eventType:"clock_in"|"clock_out",originalAt:string):void{
  this.correctionTarget={sessionId:session.id,eventType,originalAt};this.requestedAt=this.toLocalInput(originalAt);this.correctionReason="";this.message="";this.error="";
 }
 closeCorrection():void{this.correctionTarget=null;}
 private toLocalInput(value:string):string{const date=new Date(value);const offset=date.getTimezoneOffset();return new Date(date.getTime()-offset*60000).toISOString().slice(0,16);}
 async submitCorrection():Promise<void>{
  if(!this.correctionTarget||!this.requestedAt||this.correctionReason.trim().length<5)return;
  this.busy=true;this.error="";this.message="";
  try{await this.request("/time-tracking/me/corrections","POST",{...this.correctionTarget,requestedAt:new Date(this.requestedAt).toISOString(),reason:this.correctionReason.trim()});this.closeCorrection();await this.load();this.message="Solicitud de corrección enviada para su revisión.";}
  catch(error){this.error=error instanceof Error?error.message:"No se pudo enviar la solicitud";}finally{this.busy=false;}
 }
 async selectMember(userId:string):Promise<void>{this.selectedUserId=userId;this.scheduleDraft=this.emptySchedule();this.timezone="Europe/Madrid";try{const result=await this.request("/time-tracking/team/schedules");const schedule=(result.schedules??[]).find((item:Schedule)=>item.userId===userId) as Schedule|undefined;if(schedule){this.timezone=schedule.timezone;for(const day of schedule.days){this.scheduleDraft[day.day]={...day,enabled:true};}}}catch(error){this.error=error instanceof Error?error.message:"No se pudo cargar el horario";}}
 private emptySchedule():ScheduleDay[]{return Array.from({length:7},(_,day)=>({day,enabled:false,start:"09:00",end:"17:00",breakMinutes:0}));}
 async saveSchedule():Promise<void>{
  if(!this.selectedUserId)return;const days=this.scheduleDraft.filter(day=>day.enabled).map(({day,start,end,breakMinutes})=>({day,start,end,breakMinutes}));
  this.busy=true;this.error="";this.message="";
  try{await this.request("/time-tracking/team/schedules/"+encodeURIComponent(this.selectedUserId),"PUT",{timezone:this.timezone,days});this.message="Horario guardado."; }
  catch(error){this.error=error instanceof Error?error.message:"No se pudo guardar el horario";}finally{this.busy=false;}
 }
 async reviewCorrection(item:Correction,decision:"approved"|"rejected"):Promise<void>{
  const reviewNote=decision==="rejected"?(typeof prompt==="function"?prompt("Motivo del rechazo (opcional):")??"": ""):"";
  this.busy=true;this.error="";this.message="";
  try{await this.request("/time-tracking/team/corrections/"+encodeURIComponent(item.id),"PATCH",{decision,reviewNote});await this.load();this.message=decision==="approved"?"Corrección aprobada y aplicada.":"Solicitud rechazada.";}
  catch(error){this.error=error instanceof Error?error.message:"No se pudo revisar la solicitud";}finally{this.busy=false;}
 }
}
