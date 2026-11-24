import { Injectable } from "@angular/core";

/** API boundary for the Time Tracking plugin, following the DocumentsApiService pattern. */
@Injectable()
export class TimeTrackingApiService {
  readonly apiBase="/api";
  readonly routes=Object.freeze({
    status:"/time-tracking/me/status",
    sessions:"/time-tracking/me/sessions",
    schedule:"/time-tracking/me/schedule",
    corrections:"/time-tracking/me/corrections",
    teamMembers:"/time-tracking/team/members",
    teamSchedules:"/time-tracking/team/schedules",
    teamCorrections:"/time-tracking/team/corrections"
  });

  async request<T=any>(token:string,path:string,method="GET",body?:unknown):Promise<T>{
    const headers=new Headers({authorization:"Bearer "+token});
    if(body!==undefined)headers.set("content-type","application/json");
    const response=await fetch(this.apiBase+path,{method,credentials:"same-origin",headers,...(body!==undefined?{body:JSON.stringify(body)}:{})});
    let data:any={};
    try{data=await response.json();}catch{}
    if(!response.ok)throw new Error(data?.error||"Time tracking request failed");
    return data as T;
  }
}
