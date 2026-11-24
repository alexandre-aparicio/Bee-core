import type { ClockEvent, TimeSession, ScheduleDay } from "./time-tracking.repository.js";

export function normalizeOperationId(value:unknown):string{return String(value??"").trim().slice(0,100);}
export function normalizeSource(value:unknown):"web"|"android"{return value==="android"?"android":"web";}
export function validateScheduleDays(value:unknown):ScheduleDay[]|null{
 if(!Array.isArray(value)||value.length>7)return null;
 const seen=new Set<number>(),result:ScheduleDay[]=[];
 for(const raw of value){
  if(!raw||!Number.isInteger(raw.day)||raw.day<0||raw.day>6||seen.has(raw.day)||typeof raw.start!=="string"||!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw.start)||typeof raw.end!=="string"||!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw.end)||raw.start>=raw.end||!Number.isInteger(raw.breakMinutes)||raw.breakMinutes<0||raw.breakMinutes>240)return null;
  seen.add(raw.day);result.push({day:raw.day,start:raw.start,end:raw.end,breakMinutes:raw.breakMinutes});
 }
 return result.sort((a,b)=>a.day-b.day);
}
export function isChronological(session:TimeSession,eventType:"clock_in"|"clock_out",requestedAt:Date):boolean{
 return session.events.filter(event=>event.type!==eventType).every(event=>eventType==="clock_in"?requestedAt.getTime()<event.occurredAt.getTime():requestedAt.getTime()>event.occurredAt.getTime());
}
