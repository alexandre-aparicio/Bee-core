import { CommonModule } from "@angular/common";
import { Component, Input, OnInit } from "@angular/core";
type ClockEvent={type:string;occurredAt:string;source:string};
type TimeSession={status:"working"|"on_break"|"closed";startedAt:string;endedAt:string|null;events:ClockEvent[]};
@Component({selector:"bee-time-tracking",standalone:true,imports:[CommonModule],templateUrl:"./time-tracking.component.html",styleUrls:["./time-tracking.component.css"]})
export class BeeTimeTrackingComponent implements OnInit {
 @Input() tenantId=""; @Input() role="member"; @Input() accessToken="";
 session:TimeSession|null=null; history:TimeSession[]=[]; loading=false; busy=false; error=""; message="";
 ngOnInit():void{void this.load();}
 private async request(path:string,method="GET"):Promise<any>{
  const response=await fetch("/api"+path,{method,headers:{authorization:"Bearer "+this.accessToken,...(method==="POST"?{"content-type":"application/json"}:{})},...(method==="POST"?{body:JSON.stringify({operationId:crypto.randomUUID(),source:"web"})}:{})});
  const data=await response.json();if(!response.ok)throw new Error(data.error||"Time tracking request failed");return data;
 }
 async load():Promise<void>{if(!this.accessToken)return;this.loading=true;this.error="";try{const [status,history]=await Promise.all([this.request("/time-tracking/me/status"),this.request("/time-tracking/me/sessions?limit=10")]);this.session=status.session??null;this.history=history.sessions??[];}catch(error){this.error=error instanceof Error?error.message:"Could not load time tracking";}finally{this.loading=false;}}
 async act(action:"clock-in"|"break-start"|"break-end"|"clock-out"):Promise<void>{if(this.busy)return;this.busy=true;this.error="";this.message="";try{await this.request("/time-tracking/"+action,"POST");await this.load();this.message=({"clock-in":"Entrada registrada.","break-start":"Pausa iniciada.","break-end":"Pausa finalizada.","clock-out":"Salida registrada."} as Record<string,string>)[action];}catch(error){this.error=error instanceof Error?error.message:"Could not register the action";}finally{this.busy=false;}}
 get elapsed():string{if(!this.session)return "—";const end=this.session.endedAt?new Date(this.session.endedAt).getTime():Date.now();const mins=Math.floor(Math.max(0,end-new Date(this.session.startedAt).getTime())/60000);return Math.floor(mins/60)+" h "+String(mins%60).padStart(2,"0")+" min";}
 label(type:string):string{return ({clock_in:"Entrada",break_start:"Inicio de pausa",break_end:"Fin de pausa",clock_out:"Salida"} as Record<string,string>)[type]??type;}
 trackEvent(index:number,event:ClockEvent):string{return event.type+event.occurredAt+index;}
}