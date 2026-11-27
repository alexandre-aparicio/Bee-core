import { CommonModule } from "@angular/common";
import { Component, Input, OnInit, ChangeDetectionStrategy } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { TimeTrackingApiService } from "./time-tracking-api.service";
import { TIME_TRACKING_EN, TIME_TRACKING_ES } from "../../../../apps/web/src/app/i18n/catalogs/modules/time-tracking.catalog";
type ClockEvent={type:string;occurredAt:string;source:string};
type TimeSession={id:string;status:"working"|"on_break"|"closed";startedAt:string;endedAt:string|null;events:ClockEvent[]};
type TeamMember={userId:string;email:string;role:string};
type ScheduleDay={day:number;enabled:boolean;start:string;end:string;breakMinutes:number};
type Schedule={userId:string;timezone:string;days:Array<{day:number;start:string;end:string;breakMinutes:number}>};
type Correction={id:string;sessionId:string;userEmail?:string;eventType:"clock_in"|"clock_out";originalAt:string;requestedAt:string;reason:string;status:string;createdAt:string;reviewNote?:string};
@Component({selector:"bee-time-tracking",standalone:true,providers:[TimeTrackingApiService],imports:[CommonModule,FormsModule],templateUrl:"./time-tracking.component.html",changeDetection: ChangeDetectionStrategy.Eager,
styleUrls:["./time-tracking.component.css"]})
export class BeeTimeTrackingComponent implements OnInit {
 constructor(private readonly api:TimeTrackingApiService){}
 t(key:string):string{const language=String(document.documentElement.lang??"en").toLowerCase();const catalog=language.startsWith("es")?TIME_TRACKING_ES:TIME_TRACKING_EN;return catalog[key]??key;}
 weekday(day:number):string{const names=["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];return this.t("weekday_"+(names[day]??"sunday"));}
 @Input() tenantId=""; @Input() role="member"; @Input() accessToken=""; @Input() section="";
 session:TimeSession|null=null; mySchedule:Schedule|null=null; history:TimeSession[]=[]; corrections:Correction[]=[]; teamCorrections:Correction[]=[]; members:TeamMember[]=[];
 loading=false; busy=false; error=""; message=""; activeSection:"my-day"|"schedule"|"history"|"requests"="my-day"; activeSubTab:"status"|"activity"|"mine"|"team"="status";
 selectedUserId=""; timezone="Europe/Madrid";
 scheduleDraft:ScheduleDay[]=Array.from({length:7},(_,day)=>({day,enabled:false,start:"09:00",end:"17:00",breakMinutes:0}));
 correctionTarget:{sessionId:string;eventType:"clock_in"|"clock_out";originalAt:string}|null=null;
 requestedAt=""; correctionReason="";
 ngOnInit():void{const legacy=new URLSearchParams(window.location.search).get("section");const section=this.section||legacy||"time-tracking-day";this.activeSection=section==="time-tracking-schedule"||section==="schedule"?"schedule":section==="time-tracking-history"||section==="history"?"history":section==="time-tracking-requests"||section==="requests"?"requests":"my-day";if(this.activeSection==="requests")this.activeSubTab="mine";void this.load();}
 setSection(section:"my-day"|"schedule"|"history"|"requests"):void{this.activeSection=section;if(section==="requests")this.activeSubTab="mine";}
 get canManage():boolean{return ["owner","admin","manager","super_admin","superadmin"].includes(this.role.toLowerCase());}
 private request(path:string,method="GET",body?:unknown):Promise<any>{return this.api.request(this.accessToken,path,method,body,key=>this.t(key));}
 async load():Promise<void>{
  if(!this.accessToken)return;this.loading=true;this.error="";
  try{
   const [status,history,corrections,schedule]=await Promise.all([this.request("/time-tracking/me/status"),this.request("/time-tracking/me/sessions?limit=30"),this.request("/time-tracking/me/corrections"),this.request("/time-tracking/me/schedule")]);
   this.session=status.session??null;this.history=history.sessions??[];this.corrections=corrections.corrections??[];this.mySchedule=schedule.schedule??null;
   if(this.canManage)await this.loadTeam();
  }catch(error){this.error=error instanceof Error?error.message:this.t("error_load");}finally{this.loading=false;}
 }
 async loadTeam():Promise<void>{
  const [members,corrections]=await Promise.all([this.request("/time-tracking/team/members"),this.request("/time-tracking/team/corrections?status=pending")]);
  this.members=members.members??[];this.teamCorrections=corrections.corrections??[];
  if(!this.selectedUserId&&this.members.length)this.selectedUserId=this.members[0].userId;
  if(this.selectedUserId)await this.selectMember(this.selectedUserId);
 }
 async act(action:"clock-in"|"break-start"|"break-end"|"clock-out"):Promise<void>{
  if(this.busy)return;this.busy=true;this.error="";this.message="";
  try{await this.request("/time-tracking/"+action,"POST",{operationId:crypto.randomUUID(),source:"web"});await this.load();this.message=this.t(({"clock-in":"action_clock_in_success","break-start":"action_break_start_success","break-end":"action_break_end_success","clock-out":"action_clock_out_success"} as Record<string,string>)[action]);}
  catch(error){this.error=error instanceof Error?error.message:this.t("error_action");}finally{this.busy=false;}
 }
 get elapsed():string{if(!this.session)return "—";const end=this.session.endedAt?new Date(this.session.endedAt).getTime():Date.now();const mins=Math.floor(Math.max(0,end-new Date(this.session.startedAt).getTime())/60000);return Math.floor(mins/60)+this.t("hour_abbreviation")+" "+String(mins%60).padStart(2,"0")+" "+this.t("minutes");}
 label(type:string):string{const key=({clock_in:"event_clock_in",break_start:"event_break_start",break_end:"event_break_end",clock_out:"event_clock_out"} as Record<string,string>)[type];return key?this.t(key):type;}
 trackEvent(index:number,event:ClockEvent):string{return event.type+event.occurredAt+index;}
 openCorrection(session:TimeSession,eventType:"clock_in"|"clock_out",originalAt:string):void{
  this.correctionTarget={sessionId:session.id,eventType,originalAt};this.requestedAt=this.toLocalInput(originalAt);this.correctionReason="";this.message="";this.error="";
 }
 closeCorrection():void{this.correctionTarget=null;}
 private toLocalInput(value:string):string{const date=new Date(value);const offset=date.getTimezoneOffset();return new Date(date.getTime()-offset*60000).toISOString().slice(0,16);}
 async submitCorrection():Promise<void>{
  if(!this.correctionTarget||!this.requestedAt||this.correctionReason.trim().length<5)return;
  this.busy=true;this.error="";this.message="";
  try{await this.request("/time-tracking/me/corrections","POST",{...this.correctionTarget,requestedAt:new Date(this.requestedAt).toISOString(),reason:this.correctionReason.trim()});this.closeCorrection();await this.load();this.message=this.t("correction_submitted");}
  catch(error){this.error=error instanceof Error?error.message:this.t("error_submit_correction");}finally{this.busy=false;}
 }
 async selectMember(userId:string):Promise<void>{this.selectedUserId=userId;this.scheduleDraft=this.emptySchedule();this.timezone="Europe/Madrid";try{const result=await this.request("/time-tracking/team/schedules");const schedule=(result.schedules??[]).find((item:Schedule)=>item.userId===userId) as Schedule|undefined;if(schedule){this.timezone=schedule.timezone;for(const day of schedule.days){this.scheduleDraft[day.day]={...day,enabled:true};}}}catch(error){this.error=error instanceof Error?error.message:this.t("error_load_schedule");}}
 private emptySchedule():ScheduleDay[]{return Array.from({length:7},(_,day)=>({day,enabled:false,start:"09:00",end:"17:00",breakMinutes:0}));}
 async saveSchedule():Promise<void>{
  if(!this.selectedUserId)return;const days=this.scheduleDraft.filter(day=>day.enabled).map(({day,start,end,breakMinutes})=>({day,start,end,breakMinutes}));
  this.busy=true;this.error="";this.message="";
  try{await this.request("/time-tracking/team/schedules/"+encodeURIComponent(this.selectedUserId),"PUT",{timezone:this.timezone,days});this.message=this.t("schedule_saved"); }
  catch(error){this.error=error instanceof Error?error.message:this.t("error_save_schedule");}finally{this.busy=false;}
 }
 async reviewCorrection(item:Correction,decision:"approved"|"rejected"):Promise<void>{
  const reviewNote=decision==="rejected"?(typeof prompt==="function"?prompt(this.t("reject_reason_prompt"))??"": ""):"";
  this.busy=true;this.error="";this.message="";
  try{await this.request("/time-tracking/team/corrections/"+encodeURIComponent(item.id),"PATCH",{decision,reviewNote});await this.load();this.message=this.t(decision==="approved"?"correction_approved":"correction_rejected");}
  catch(error){this.error=error instanceof Error?error.message:this.t("error_review_correction");}finally{this.busy=false;}
 }
}
