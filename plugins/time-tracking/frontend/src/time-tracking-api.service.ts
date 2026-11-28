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

  async request<T=any>(token:string,path:string,method="GET",body?:unknown,translate:(key:string)=>string=(key=>key)):Promise<T>{
    const headers=new Headers({authorization:"Bearer "+token});
    if(body!==undefined)headers.set("content-type","application/json");
    const response=await fetch(this.apiBase+path,{method,credentials:"same-origin",headers,...(body!==undefined?{body:JSON.stringify(body)}:{})});
    let data:any={};
    try{data=await response.json();}catch{}
    if(!response.ok){const code=typeof data?.errorCode==="string"?data.errorCode:"request_failed";const key=code==="request_failed"?"request_failed":"error_"+code;throw new Error(translate(key));}
    return data as T;
  }
}
