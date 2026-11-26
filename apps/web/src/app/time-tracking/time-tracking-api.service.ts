import { Injectable } from "@angular/core";
import { BeeI18nService } from "../i18n/bee-i18n.service";

/** API boundary for the Time Tracking plugin, following the DocumentsApiService pattern. */
@Injectable()
export class TimeTrackingApiService {
  constructor(private readonly i18n:BeeI18nService){}
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
    if(!response.ok){const code=typeof data?.errorCode==="string"?data.errorCode:"request_failed";throw new Error(this.i18n.t("time-tracking:error_"+code));}
    return data as T;
  }
}
