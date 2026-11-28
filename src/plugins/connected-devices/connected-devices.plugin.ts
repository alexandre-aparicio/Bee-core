import type { BeePlugin } from "../../core/types.js";
import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { cancelTenantAuditOutboxEvent, commitTenantAuditOutboxEvent, dispatchTenantAuditOutbox, prepareTenantAuditOutboxEvent, type TenantAuditOutboxRecord } from "../../core/audit-log.js";
import type { PluginAccessService } from "../../core/plugin-services.js";
import { ConnectedDevicesRepository } from "./connected-devices.repository.js";
import { createConnectedDevicesServices, createInvalidatedDeviceCredential } from "./connected-devices.service.js";
import { registerConnectedDevicesRoutes } from "./connected-devices.routes.js";
import { migrateLegacyConnectedDevicesPlanAssignments } from "./connected-devices-plan-migration.js";
export const connectedDevicesPlugin:BeePlugin={
 manifest:{ requiredServices: ["mongoDbName","sessionIdSecret"], optionalServices: [],name:"connected-devices",version:"0.4.0",description:"Tenant-scoped device pairing, identity, capability grants and revocation",dependencies:["auth","organizations"],scope:"tenant",activationPolicy:"manual"},
 async initialize(ctx){
  const db:Db=ctx.mongoClient.db(String(ctx.config.mongoDbName??"bee_core"));
  const secret=String(ctx.config.sessionIdSecret??"");
  if(secret.length<32)throw new Error("Connected Devices requires the session resource ID secret.");
  const access=ctx.services?.get<PluginAccessService>("core.plugin-access");
  if(!access)throw new Error("Connected Devices requires the Core plugin access contract.");
  const repository=new ConnectedDevicesRepository(db);await repository.initializeIndexes();
  const memberships=db.collection("memberships");
  const auditOutbox=db.collection<TenantAuditOutboxRecord>("tenant_audit_outbox");
  const revokeMemberDevices=async(tenantId:string,userId:string,actorId:string)=>{
   const membership=await memberships.findOne({tenantId,userId,status:"suspended",deviceRevocationPending:true});
   if(!membership)return;
   const devices=await repository.devices.find({tenantId,ownerUserId:userId,status:{$in:["pending","active","suspended"]}}).toArray();
   const membershipVersion=new Date(membership.updatedAt??Date.now()).getTime();
   for(const device of devices){
    let idempotencyKey="membership.device.revoked:"+tenantId+":"+userId+":"+device.id+":"+membershipVersion;
    const existing=await auditOutbox.findOne({idempotencyKey});
    if(existing?.status==="cancelled"||existing?.status==="delivered")idempotencyKey+=":retry:"+randomUUID();
    const audit=await prepareTenantAuditOutboxEvent(auditOutbox,{
     tenantId,actorId,action:"device.revoked",outcome:"success",resourceType:"device",resourceId:device.id,
     metadata:{fromStatus:device.status,toStatus:"revoked",reason:"membership_suspended"},
     idempotencyKey
    });
    const invalidated=createInvalidatedDeviceCredential();
    const result=await repository.devices.updateOne(
     {tenantId,id:device.id,ownerUserId:userId,status:device.status},
     {$set:{status:"revoked",...invalidated,revokedAt:new Date(),revokedBy:"system:membership-revoked",grantedCapabilities:[],updatedAt:new Date()},$addToSet:{pendingAuditEventIds:audit.id}}
    );
    if(result.matchedCount){await commitTenantAuditOutboxEvent(auditOutbox,audit.id);continue;}
    const latest=await repository.devices.findOne({tenantId,id:device.id});
    if(latest?.status==="revoked"&&latest.pendingAuditEventIds?.includes(audit.id)){
     await commitTenantAuditOutboxEvent(auditOutbox,audit.id);
    }else if(!latest||["revoked","unlinked"].includes(latest.status)){
     await cancelTenantAuditOutboxEvent(auditOutbox,audit.id);
    }else{
     throw new Error("Connected Device changed during membership revocation; retry the membership status update.");
    }
   }
   await dispatchTenantAuditOutbox(db,ctx.logger);
   await memberships.updateOne({id:membership.id,tenantId,status:"suspended",deviceRevocationPending:true},{$set:{deviceRevocationPending:false}});
  };
  ctx.events.on("membership.status.changed",async(payload:any)=>{
   if(payload?.status==="suspended")await revokeMemberDevices(String(payload.tenantId),String(payload.userId),String(payload.actorId??"system:membership-revoked"));
  });
  const pendingRevocations=await memberships.find({status:"suspended",deviceRevocationPending:true}).toArray();
  for(const membership of pendingRevocations){
   try{await revokeMemberDevices(String(membership.tenantId),String(membership.userId),"system:membership-revocation-recovery");}
   catch(error){ctx.logger.error("Pending Connected Devices membership revocation will be retried on the next membership update or startup",{tenantId:membership.tenantId,userId:membership.userId,error});}
  }
  const services=createConnectedDevicesServices({secret,repository,access});registerConnectedDevicesRoutes(ctx,services);
  ctx.logger.info("Connected Devices plugin initialized: secure pairing and tenant device registry ready.");
 },
 async afterRuntimeLoaded(ctx){
  await migrateLegacyConnectedDevicesPlanAssignments(ctx.mongoClient.db(String(ctx.config.mongoDbName??"bee_core")));
 }
};
