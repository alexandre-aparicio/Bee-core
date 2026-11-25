import type { Db, Document, Collection } from "mongodb";
import { TenantCollection } from "../../core/tenant-collection.js";

export type ClockEvent = { id:string; type:"clock_in"|"break_start"|"break_end"|"clock_out"; occurredAt:Date; source:"web"|"android"; operationId:string };
export type TimeSession = Document & { id:string; tenantId:string; userId:string; status:"working"|"on_break"|"closed"; active:boolean; startedAt:Date; endedAt:Date|null; events:ClockEvent[]; createdAt:Date; updatedAt:Date };
export type ScheduleDay={day:number;start:string;end:string;breakMinutes:number};
export type WorkSchedule=Document & {id:string;tenantId:string;userId:string;timezone:string;days:ScheduleDay[];updatedBy:string;createdAt:Date;updatedAt:Date};
export type Correction=Document & {id:string;tenantId:string;sessionId:string;userId:string;eventType:"clock_in"|"clock_out";originalAt:Date;requestedAt:Date;reason:string;status:"pending"|"approved"|"rejected";createdAt:Date;reviewedAt?:Date;reviewedBy?:string;reviewNote?:string};
export type TimeTrackingMembership=Document & {tenantId:string;userId:string;role:string;status:string};
export type TimeTrackingUser=Document & {id:string;email:string;enabled:boolean};

/** Persistence boundary: tenant-owned records are only exposed through scoped collections. */
export class TimeTrackingRepository {
 private readonly sessionCollection:Collection<TimeSession>;
 private readonly scheduleCollection:Collection<WorkSchedule>;
 private readonly correctionCollection:Collection<Correction>;
 private readonly membershipCollection:Collection<TimeTrackingMembership>;
 readonly users:Collection<TimeTrackingUser>;

 constructor(readonly db:Db){
  this.sessionCollection=db.collection<TimeSession>("tenant_time_tracking_sessions");
  this.scheduleCollection=db.collection<WorkSchedule>("tenant_time_tracking_schedules");
  this.correctionCollection=db.collection<Correction>("tenant_time_tracking_corrections");
  this.membershipCollection=db.collection<TimeTrackingMembership>("memberships");
  this.users=db.collection<TimeTrackingUser>("users");
 }

 async initializeIndexes():Promise<void>{
  await Promise.all([
   this.sessionCollection.createIndex({tenantId:1,id:1},{unique:true,name:"time_tracking_tenant_session_unique"}),
   this.sessionCollection.createIndex({tenantId:1,userId:1,startedAt:-1},{name:"time_tracking_user_history"}),
   this.sessionCollection.createIndex({tenantId:1,userId:1},{unique:true,partialFilterExpression:{active:true},name:"time_tracking_one_active_session"}),
   this.scheduleCollection.createIndex({tenantId:1,userId:1},{unique:true,name:"time_tracking_schedule_user_unique"}),
   this.correctionCollection.createIndex({tenantId:1,id:1},{unique:true,name:"time_tracking_correction_id_unique"}),
   this.correctionCollection.createIndex({tenantId:1,userId:1,createdAt:-1},{name:"time_tracking_correction_user_history"}),
   this.correctionCollection.createIndex({tenantId:1,sessionId:1,eventType:1},{unique:true,partialFilterExpression:{status:"pending"},name:"time_tracking_one_pending_correction_per_event"}),
   this.correctionCollection.createIndex({tenantId:1,status:1,createdAt:1},{name:"time_tracking_correction_review_queue"})
  ]);
 }

 sessionsForTenant(tenantId:string):TenantCollection<TimeSession>{return new TenantCollection(this.sessionCollection,tenantId);}
 schedulesForTenant(tenantId:string):TenantCollection<WorkSchedule>{return new TenantCollection(this.scheduleCollection,tenantId);}
 correctionsForTenant(tenantId:string):TenantCollection<Correction>{return new TenantCollection(this.correctionCollection,tenantId);}
 membershipsForTenant(tenantId:string):TenantCollection<TimeTrackingMembership>{return new TenantCollection(this.membershipCollection,tenantId);}
}
