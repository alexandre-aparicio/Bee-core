import type { BeePlugin } from "../../core/types.js";
import { type Db, type Collection } from "mongodb";
import { randomUUID } from "node:crypto";
import { resolveTenantContext, type TenantClaims } from "../../core/tenant-context.js";
import { BoundedTicketStore, realtimeConnectionLimiterFor } from "../../core/realtime-limits.js";

type NotificationRecord = { id:string; tenantId:string; userId:string; scope:"tenant"|"global"; type:string; category:string; priority:"low"|"normal"|"high"; title:string; message:string; action?:{label:string;route:string}; metadata?:Record<string,unknown>; readAt:Date|null; createdAt:Date; expiresAt?:Date };
type RealtimeTicket = { userId:string; tenantId:string; sessionId:string; ip:string };
type SocketClient = { socket:any; userId:string; tenantId:string; sessionId:string; release:()=>void };
const safeRoute=(value:unknown)=>typeof value==="string"&&/^\/(?!\/)[^\\\s]*$/.test(value)&&!/%5c/i.test(value)?value:"";
export const notificationsPlugin:BeePlugin={
 manifest:{ requiredServices: ["mongoDbName","sessionIdSecret"], optionalServices: [],name:"notifications",version:"0.1.0",description:"Tenant-safe notifications and realtime WebSocket delivery",dependencies:["auth"]},
 async initialize(ctx){
  const db:Db=ctx.mongoClient.db(String(ctx.config.mongoDbName??"bee_core"));
  const collection:Collection<NotificationRecord>=db.collection("notifications");
  await Promise.all([collection.createIndex({userId:1,tenantId:1,createdAt:-1},{name:"notifications_user_tenant_created"}),collection.createIndex({userId:1,tenantId:1,readAt:1},{name:"notifications_user_tenant_read"}),collection.createIndex({expiresAt:1},{expireAfterSeconds:0,sparse:true,name:"notifications_ttl"})]);
  const tickets=new BoundedTicketStore<RealtimeTicket>(5_000,30_000);
  const connectionLimiter=realtimeConnectionLimiterFor(ctx.server);
  const clients=new Set<SocketClient>();
  const authContext=async(req:any,reply:any)=>{try{await req.jwtVerify();const claims=req.user as TenantClaims;const c=await resolveTenantContext(db,claims,{},String(ctx.config.sessionIdSecret??""));if(!c||c.client!=="dashboard"){reply.code(401).send({error:"Valid dashboard session required"});return null;}return c;}catch{reply.code(401).send({error:"Unauthorized"});return null;}};
  const sendToUser=(userId:string,tenantId:string,record:NotificationRecord)=>{const payload=JSON.stringify({type:"notification:new",notification:record});for(const client of clients){if(client.userId===userId&&client.tenantId===tenantId&&client.socket.readyState===1)client.socket.send(payload);}};
  const createNotification=async(input:{userId:string;tenantId:string;title:string;message:string;type?:string;category?:string;priority?:"low"|"normal"|"high";action?:{label:string;route:string};metadata?:Record<string,unknown>})=>{
   const title=String(input.title??"").trim().slice(0,160),message=String(input.message??"").trim().slice(0,1000);
   if(!input.userId||!input.tenantId||!title||!message)return null;
   const record:NotificationRecord={id:randomUUID(),tenantId:input.tenantId,userId:input.userId,scope:"tenant",type:String(input.type??"system.notice").slice(0,100),category:String(input.category??"system").slice(0,40),priority:input.priority??"normal",title,message,...(input.action&&safeRoute(input.action.route)?{action:{label:String(input.action.label).slice(0,60),route:safeRoute(input.action.route)}}:{}),...(input.metadata?{metadata:input.metadata}:{}),readAt:null,createdAt:new Date()};
   await collection.insertOne(record);sendToUser(record.userId,record.tenantId,record);return record;
  };
  ctx.server.post("/notifications/realtime-ticket",async(req,reply)=>{const context=await authContext(req,reply);if(!context)return;const issued=tickets.issue({userId:context.userId,tenantId:context.tenantId,sessionId:context.sessionId,ip:req.ip});if(!issued)return reply.code(429).send({error:"Too many pending realtime tickets"});return issued;});
  ctx.server.get<{Querystring:{limit?:string;unread?:string}}>("/notifications",async(req,reply)=>{const context=await authContext(req,reply);if(!context)return;const limit=Math.max(1,Math.min(100,Number(req.query.limit)||30)),unread=req.query.unread==="true";const query={userId:context.userId,tenantId:context.tenantId,...(unread?{readAt:null}:{})};const items=await collection.find(query).sort({createdAt:-1}).limit(limit).toArray();return {notifications:items};});
  ctx.server.get("/notifications/unread-count",async(req,reply)=>{const context=await authContext(req,reply);if(!context)return;const count=await collection.countDocuments({userId:context.userId,tenantId:context.tenantId,readAt:null});return {count};});
  ctx.server.patch<{Params:{id:string}}>("/notifications/:id/read",async(req,reply)=>{const context=await authContext(req,reply);if(!context)return;const result=await collection.updateOne({id:req.params.id,userId:context.userId,tenantId:context.tenantId,readAt:null},{$set:{readAt:new Date()}});return {success:true,modified:result.modifiedCount};});
  ctx.server.patch("/notifications/read-all",async(req,reply)=>{const context=await authContext(req,reply);if(!context)return;const result=await collection.updateMany({userId:context.userId,tenantId:context.tenantId,readAt:null},{$set:{readAt:new Date()}});return {success:true,modified:result.modifiedCount};});
  ctx.server.delete<{Params:{id:string}}>("/notifications/:id",async(req,reply)=>{const context=await authContext(req,reply);if(!context)return;await collection.deleteOne({id:req.params.id,userId:context.userId,tenantId:context.tenantId});return {success:true};});
  ctx.server.get<{Querystring:{ticket?:string}}>("/realtime", {websocket:true},(socket,req)=>{
   const ticket=String((req.query as any)?.ticket??""),record=tickets.consume(ticket);
   if(!record||record.ip!==req.ip){socket.close(1008,"Ticket expired or invalid");return;}
   const release=connectionLimiter.tryAcquire(record.ip,record.userId);
   if(!release){socket.close(1013,"Realtime connection limit reached");return;}
   let client:SocketClient|undefined;
   const releaseClient=()=>{if(client)clients.delete(client);release();};
   socket.on("close",releaseClient);socket.on("error",releaseClient);
   void (async()=>{
    const [session,user,membership,company]=await Promise.all([
     db.collection<{id:string;userId:string;tenantId:string;client:string;expiresAt:Date;revokedAt:Date|null}>("refresh_sessions").findOne({id:record.sessionId,userId:record.userId,tenantId:record.tenantId,client:"dashboard",revokedAt:null,expiresAt:{$gt:new Date()}}),
     db.collection<{id:string;enabled:boolean;allowedClients?:string[]}>("users").findOne({id:record.userId,enabled:true}),
     db.collection("memberships").findOne({userId:record.userId,tenantId:record.tenantId,status:"active"}),
     db.collection<{id:string;status?:string}>("tenants").findOne({id:record.tenantId})
    ]);
    if(!session||!user||!user.allowedClients?.includes("dashboard")||!membership||!company||company.status==="suspended"){releaseClient();socket.close(1008,"Session no longer valid");return;}
    if(socket.readyState!==1){releaseClient();return;}
    client={socket,userId:record.userId,tenantId:record.tenantId,sessionId:record.sessionId,release};
    clients.add(client);socket.send(JSON.stringify({type:"realtime:connected"}));
   })().catch(()=>{releaseClient();socket.close(1011,"Realtime authorization failed");});
  });
  const onRequest=ctx.events.on("notification.request",async(payload:any)=>{if(!payload||typeof payload!=="object")return;const userId=String(payload.userId??""),tenantId=String(payload.tenantId??"");await createNotification({userId,tenantId,title:String(payload.title??""),message:String(payload.message??""),type:payload.type,category:payload.category,priority:payload.priority,action:payload.action,metadata:payload.metadata});});
  const onLogin=ctx.events.on("auth.login",async(payload:any)=>{if(!payload?.userId)return;const user=await db.collection<{id:string;tenantId?:string}>("users").findOne({id:String(payload.userId)});if(!user?.tenantId)return;await createNotification({userId:user.id,tenantId:user.tenantId,title:"New sign-in",message:"A new session was started for your account.",type:"auth.login",category:"security",priority:"low"});});
  ctx.server.addHook("onClose",async()=>{onRequest();onLogin();for(const c of clients){c.release();c.socket.close(1001,"Server shutting down");}clients.clear();tickets.clear();});
  ctx.logger.info("Notifications and realtime WebSocket initialized",{websocket:"/realtime",storage:"mongodb"});
 }
};