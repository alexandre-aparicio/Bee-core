import type { BeePlugin } from "../../core/types.js";
import type { Db, Document } from "mongodb";
import { randomUUID } from "node:crypto";
import { TenantCollection } from "../../core/tenant-collection.js";
import { requireAuth, requireTenantPermissions, type AuthenticatedRequest } from "../auth/auth.guard.js";
import { requireInstalledPlugin } from "../../core/plugin-entitlements.js";

type ClockEvent = { id:string; type:"clock_in"|"break_start"|"break_end"|"clock_out"; occurredAt:Date; source:"web"|"android"; operationId:string };
type TimeSession = Document & { id:string; tenantId:string; userId:string; status:"working"|"on_break"|"closed"; active:boolean; startedAt:Date; endedAt:Date|null; events:ClockEvent[]; createdAt:Date; updatedAt:Date };

export const timeTrackingPlugin:BeePlugin={
 manifest:{name:"time-tracking",version:"0.1.0",description:"Employee time clock, breaks and work-session history",dependencies:["auth","organizations","marketplace"],frontend:{routes:[{path:"/dashboard/time-tracking",component:"bee-time-tracking"}]}},
 async initialize(ctx){
  const db:Db=ctx.mongoClient.db(String(ctx.config.mongoDbName??"bee_core"));
  const sessions=db.collection<TimeSession>("tenant_time_tracking_sessions");
  await Promise.all([
   sessions.createIndex({tenantId:1,id:1},{unique:true,name:"time_tracking_tenant_session_unique"}),
   sessions.createIndex({tenantId:1,userId:1,startedAt:-1},{name:"time_tracking_user_history"}),
   sessions.createIndex({tenantId:1,userId:1},{unique:true,partialFilterExpression:{active:true},name:"time_tracking_one_active_session"})
  ]);
  const secret=String(ctx.config.sessionIdSecret??ctx.config.jwtSecret??"");
  const read=[requireAuth(db,"dashboard",secret),requireTenantPermissions("time-tracking.read"),requireInstalledPlugin(db,"time-tracking")];
  const clock=[requireAuth(db,"dashboard",secret),requireTenantPermissions("time-tracking.read","time-tracking.clock"),requireInstalledPlugin(db,"time-tracking")];
  const collection=(tenantId:string)=>new TenantCollection<TimeSession>(sessions,tenantId);
  const publicSession=(row:TimeSession)=>({status:row.status,startedAt:row.startedAt,endedAt:row.endedAt,events:row.events.map(event=>({type:event.type,occurredAt:event.occurredAt,source:event.source}))});
  const operationId=(value:unknown)=>String(value??"").trim().slice(0,100);
  const sourceOf=(value:unknown):"web"|"android"=>value==="android"?"android":"web";
  ctx.server.get("/time-tracking/me/status",{preHandler:read},async(request)=>{
   const tenant=(request as AuthenticatedRequest).tenantContext;
   const active=await collection(tenant.tenantId).findOne({userId:tenant.userId,active:true});
   return {session:active?publicSession(active):null};
  });
  ctx.server.get<{Querystring:{limit?:string}}>("/time-tracking/me/sessions",{preHandler:read},async(request)=>{
   const tenant=(request as AuthenticatedRequest).tenantContext;
   const limit=Math.max(1,Math.min(100,Number(request.query.limit)||30));
   const rows=await collection(tenant.tenantId).find({userId:tenant.userId,active:false}).sort({startedAt:-1}).limit(limit).toArray();
   return {sessions:rows.map(publicSession)};
  });
  ctx.server.post<{Body:{operationId?:string;source?:string}}>("/time-tracking/clock-in",{preHandler:clock},async(request,reply)=>{
   const tenant=(request as AuthenticatedRequest).tenantContext,op=operationId(request.body?.operationId);
   if(!op)return reply.code(400).send({error:"operationId is required"});
   const own=collection(tenant.tenantId),existing=await own.findOne({userId:tenant.userId,"events.operationId":op});
   if(existing)return {session:publicSession(existing),replayed:true};
   const now=new Date(),row:Omit<TimeSession,"tenantId">={id:randomUUID(),userId:tenant.userId,status:"working",active:true,startedAt:now,endedAt:null,events:[{id:randomUUID(),type:"clock_in",occurredAt:now,source:sourceOf(request.body?.source),operationId:op}],createdAt:now,updatedAt:now};
   try{await own.insertOne(row);}catch(error){if((error as {code?:number}).code===11000)return reply.code(409).send({error:"There is already an open work session"});throw error;}
   return reply.code(201).send({session:publicSession(row as TimeSession)});
  });
  const transition=async(request:any,reply:any,from:"working"|"on_break",to:"working"|"on_break"|"closed",type:ClockEvent["type"])=>{
   const tenant=(request as AuthenticatedRequest).tenantContext,op=operationId(request.body?.operationId);
   if(!op)return reply.code(400).send({error:"operationId is required"});
   const own=collection(tenant.tenantId),existing=await own.findOne({userId:tenant.userId,"events.operationId":op});
   if(existing)return {session:publicSession(existing),replayed:true};
   const now=new Date(),event:ClockEvent={id:randomUUID(),type,occurredAt:now,source:sourceOf(request.body?.source),operationId:op};
   const update:any={$set:{status:to,updatedAt:now},$push:{events:event}};
   if(to==="closed")Object.assign(update.$set,{active:false,endedAt:now});
   const result=await own.updateOne({userId:tenant.userId,active:true,status:from},update);
   if(!result.modifiedCount)return reply.code(409).send({error:"The work session is not in the expected state. Refresh and try again."});
   const row=await own.findOne({userId:tenant.userId,"events.operationId":op});
   return {session:row?publicSession(row):null};
  };
  ctx.server.post<{Body:{operationId?:string;source?:string}}>("/time-tracking/break-start",{preHandler:clock},(request,reply)=>transition(request,reply,"working","on_break","break_start"));
  ctx.server.post<{Body:{operationId?:string;source?:string}}>("/time-tracking/break-end",{preHandler:clock},(request,reply)=>transition(request,reply,"on_break","working","break_end"));
  ctx.server.post<{Body:{operationId?:string;source?:string}}>("/time-tracking/clock-out",{preHandler:clock},(request,reply)=>transition(request,reply,"working","closed","clock_out"));
  ctx.logger.info("Time Tracking phase 1 initialized: tenant-scoped clock-in, breaks, clock-out and personal history.");
 }
};
