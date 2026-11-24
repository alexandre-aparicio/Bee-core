import type { Db, Document, Collection } from "mongodb";
import { TenantCollection } from "../../core/tenant-collection.js";

export type ClockEvent = { id:string; type:"clock_in"|"break_start"|"break_end"|"clock_out"; occurredAt:Date; source:"web"|"android"; operationId:string };
export type TimeSession = Document & { id:string; tenantId:string; userId:string; status:"working"|"on_break"|"closed"; active:boolean; startedAt:Date; endedAt:Date|null; events:ClockEvent[]; createdAt:Date; updatedAt:Date };
export type ScheduleDay={day:number;start:string;end:string;breakMinutes:number};
export type WorkSchedule=Document & {id:string;tenantId:string;userId:string;timezone:string;days:ScheduleDay[];updatedBy:string;createdAt:Date;updatedAt:Date};
export type Correction=Document & {id:string;tenantId:string;sessionId:string;userId:string;eventType:"clock_in"|"clock_out";originalAt:Date;requestedAt:Date;reason:string;status:"pending"|"approved"|"rejected";createdAt:Date;reviewedAt?:Date;reviewedBy?:string;reviewNote?:string};

/** Persistence boundary: all collections, tenant-scoping and indexes belong to this plugin. */
export class TimeTrackingRepository {
 readonly sessions:Collection<TimeSession>;
 readonly schedules:Collection<WorkSchedule>;
 readonly corrections:Collection<Correction>;
 readonly memberships:Collection<{userId:string;tenantId:string;role:string;status:string}>;
 readonly users:Collection<{id:string;email:string;enabled:boolean}>;
 constructor(readonly db:Db){
  this.sessions=db.collection<TimeSession>("tenant_time_tracking_sessions");
  this.schedules=db.collection<WorkSchedule>("tenant_time_tracking_schedules");
  this.corrections=db.collection<Correction>("tenant_time_tracking_corrections");
  this.memberships=db.collection("memberships");
  this.users=db.collection("users");
 }
 async initializeIndexes():Promise<void>{
  await Promise.all([
   this.sessions.createIndex({tenantId:1,id:1},{unique:true,name:"time_tracking_tenant_session_unique"}),
   this.sessions.createIndex({tenantId:1,userId:1,startedAt:-1},{name:"time_tracking_user_history"}),
   this.sessions.createIndex({tenantId:1,userId:1},{unique:true,partialFilterExpression:{active:true},name:"time_tracking_one_active_session"}),
   this.schedules.createIndex({tenantId:1,userId:1},{unique:true,name:"time_tracking_schedule_user_unique"}),
   this.corrections.createIndex({tenantId:1,id:1},{unique:true,name:"time_tracking_correction_id_unique"}),
   this.corrections.createIndex({tenantId:1,userId:1,createdAt:-1},{name:"time_tracking_correction_user_history"}),
   this.corrections.createIndex({tenantId:1,sessionId:1,eventType:1},{unique:true,partialFilterExpression:{status:"pending"},name:"time_tracking_one_pending_correction_per_event"}),
   this.corrections.createIndex({tenantId:1,status:1,createdAt:1},{name:"time_tracking_correction_review_queue"})
  ]);
 }
 sessionsForTenant(tenantId:string):TenantCollection<TimeSession>{return new TenantCollection(this.sessions,tenantId);}
}
