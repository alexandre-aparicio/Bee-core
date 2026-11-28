import { randomUUID } from "node:crypto";

import { createPairingSecrets, hashDeviceSecret, isConnectedDeviceOwnerActive, isDeviceAdministrator, normalizeRequestedCapabilities, publicDevice } from "./connected-devices.service.js";
import type { ConnectedDeviceRecord } from "./connected-devices.repository.js";
const clean=(value:unknown,max=80):string=>String(value??"").replace(/[<>\u0000-\u001f]/g,"").trim().slice(0,max);

export function registerConnectedDevicesRoutes(ctx:any,deps:any):void{
 const {repository,dashboardTenant,authenticateDevice,access,availablePermissions}=deps;
 ctx.server.get("/connected-devices/permissions",async(request:any,reply:any)=>{
  const tenant=await dashboardTenant(request,reply);if(!tenant)return;
  return {permissions:await availablePermissions(tenant.tenantId)};
 });
 ctx.server.post("/connected-devices/pairing-challenges",async(request:any,reply:any)=>{
  const tenant=await dashboardTenant(request,reply);if(!tenant)return;
  const permissions=await availablePermissions(tenant.tenantId);
  let requestedCapabilities:string[];try{requestedCapabilities=normalizeRequestedCapabilities(request.body?.requestedCapabilities??[],permissions);}catch(error){return reply.code(400).send({error:error instanceof Error?error.message:"Invalid permissions"});}
  if(!permissions.length)return reply.code(409).send({error:"No installed connector has declared device permissions for this company."});
  const now=new Date();
  const outstanding=await repository.challenges.countDocuments({tenantId:tenant.tenantId,userId:tenant.userId,status:"issued",expiresAt:{$gt:now}});
  if(outstanding>=5)return reply.code(429).send({error:"You already have five active pairing codes. Cancel one or wait for them to expire."});
  const qrToken=createPairingSecrets().qrToken;
  const challenge={id:randomUUID(),tenantId:tenant.tenantId,userId:tenant.userId,tokenHash:hashDeviceSecret(qrToken),requestedCapabilities,status:"issued" as const,expiresAt:new Date(now.getTime()+5*60_000),createdAt:now,claimedAt:null,deviceId:null};
  await repository.challenges.insertOne(challenge);
  return reply.code(201).send({challengeId:challenge.id,qrPayload:"bee-device://pair?token="+qrToken,expiresAt:challenge.expiresAt,requestedCapabilities});
 });
 ctx.server.post("/connected-devices/pairing-challenges/:challengeId/cancel",async(request:any,reply:any)=>{
  const tenant=await dashboardTenant(request,reply);if(!tenant)return;
  const id=clean(request.params.challengeId,64),filter:any={tenantId:tenant.tenantId,id,status:{$in:["issued","claimed"]}};
  if(!isDeviceAdministrator(tenant))filter.userId=tenant.userId;
  const challenge=await repository.challenges.findOne(filter);
  if(!challenge)return reply.code(404).send({error:"Active pairing challenge not found."});
  const cancelled=await repository.challenges.updateOne({tenantId:tenant.tenantId,id,status:challenge.status},{$set:{status:"cancelled"}});
  if(!cancelled.modifiedCount)return reply.code(409).send({error:"The pairing request changed. Refresh and try again."});
  if(challenge.status==="claimed"&&challenge.deviceId){
   await repository.devices.updateOne({tenantId:tenant.tenantId,id:challenge.deviceId,status:{$in:["pending","active"]}},{$set:{status:"revoked",revokedAt:new Date(),revokedBy:tenant.userId,grantedCapabilities:[],updatedAt:new Date()}});
  }
  return {success:true};
 });
 // Public companion exchange: the one-time QR token is consumed once. The returned
 // credential is separate and remains unusable until tenant-admin approval.
 ctx.server.post("/connected-devices/pair",async(request:any,reply:any)=>{
  let challengeId:string|null=null;
  try{
   const token=clean(request.body?.token,256);
   if(token.length<40)return reply.code(400).send({error:"Invalid pairing token."});
   const challenge=await repository.challenges.findOne({tokenHash:hashDeviceSecret(token),status:"issued",expiresAt:{$gt:new Date()}});
   if(!challenge)return reply.code(410).send({error:"Pairing code is invalid, expired or already used."});
   challengeId=challenge.id;
   const [available,ownerActive,permissions]=await Promise.all([
    access.isPluginAvailable(challenge.tenantId,"connected-devices"),
    access.isTenantUserActive(challenge.tenantId,challenge.userId),
    availablePermissions(challenge.tenantId)
   ]);
   if(!available||!ownerActive)return reply.code(403).send({error:"Connected Devices, company or pairing user is no longer active."});
   const name=clean(request.body?.name,80),deviceType=clean(request.body?.deviceType,40)||"companion",platform=clean(request.body?.platform,40)||"unknown";
   if(!name)return reply.code(400).send({error:"Device name is required."});
   if(challenge.requestedCapabilities.some((permission:string)=>!permissions.some((item:any)=>item.key===permission)))return reply.code(409).send({error:"A requested connector permission is no longer available. Generate a new pairing QR code."});
   const {deviceCredential}=createPairingSecrets(),now=new Date(),deviceId=randomUUID();
   const device:ConnectedDeviceRecord={
    id:deviceId,tenantId:challenge.tenantId,ownerUserId:challenge.userId,requestedBy:challenge.userId,
    pairingChallengeId:challenge.id,name,deviceType,platform,appVersion:clean(request.body?.appVersion,40)||null,
    requestedCapabilities:normalizeRequestedCapabilities(challenge.requestedCapabilities,permissions),grantedCapabilities:[],
    credentialHash:hashDeviceSecret(deviceCredential),status:"pending",pairingExpiresAt:new Date(now.getTime()+15*60_000),
    createdAt:now,updatedAt:now,approvedAt:null,approvedBy:null,revokedAt:null,revokedBy:null,lastSeenAt:null
   };
   const claimed=await repository.challenges.updateOne({id:challenge.id,status:"issued",expiresAt:{$gt:now}},{$set:{status:"claimed",claimedAt:now,deviceId}});
   if(!claimed.modifiedCount)return reply.code(410).send({error:"Pairing code has already been used."});
   try{
    await repository.devices.insertOne(device);
   }catch(error){
    await repository.challenges.updateOne({id:challenge.id,status:"claimed",deviceId},{$set:{status:"issued",claimedAt:null,deviceId:null}});
    throw error;
   }
   // Keep both names during the migration so older Android builds can complete pairing.
   return reply.code(201).send({
    deviceId,pairingSecret:deviceCredential,deviceCredential,status:"pending",
    approvalExpiresAt:device.pairingExpiresAt,requestedPermissions:device.requestedCapabilities,
    availablePermissions:permissions
   });
  }catch(error){
   const details=error instanceof Error?{name:error.name,message:error.message,stack:error.stack}: {message:String(error)};
   ctx.logger.error("Connected Devices pairing request failed",{challengeId,error:details});
   return reply.code(500).send({error:"Unable to process pairing request. Check Bee Core logs for the pairing error."});
  }
 });
 ctx.server.get("/connected-devices/pairing-status",async(request:any,reply:any)=>{
  const secret=clean(request.headers["x-device-pairing-secret"],256);if(secret.length<40)return reply.code(401).send({error:"Pairing secret required."});
  const device=await repository.devices.findOne({credentialHash:hashDeviceSecret(secret)});
  if(!device||(device.pairingExpiresAt<=new Date()&&device.status==="pending"))return reply.code(404).send({error:"Pairing request expired."});
  const [available,ownerActive]=await Promise.all([access.isPluginAvailable(device.tenantId,"connected-devices"),isConnectedDeviceOwnerActive(access,device)]);
  if(!available||!ownerActive){
   if(!ownerActive)await repository.devices.updateOne({tenantId:device.tenantId,id:device.id,status:{$ne:"revoked"}},{$set:{status:"revoked",revokedAt:new Date(),revokedBy:"system:membership-revoked",grantedCapabilities:[],updatedAt:new Date()}});
   return reply.code(403).send({error:"Connected Devices or the device owner membership is no longer active."});
  }
  if(device.status==="revoked"||device.status==="suspended"||device.status==="unlinked")return reply.code(403).send({error:"Device access is not active."});
  const permissions=await availablePermissions(device.tenantId);
  const availableKeys=new Set(permissions.map((permission:any)=>permission.key));
  const granted=device.grantedCapabilities.filter((key:string)=>availableKeys.has(key));
  return {status:device.status,deviceId:device.id,requestedPermissions:device.requestedCapabilities,grantedCapabilities:device.status==="active"?granted:[],grantedPermissions:device.status==="active"?granted:[],availablePermissions:permissions};
 });
 ctx.server.get("/connected-devices",async(request:any,reply:any)=>{
  const tenant=await dashboardTenant(request,reply);if(!tenant)return;
  const canManage=isDeviceAdministrator(tenant),now=new Date(),filter:any={tenantId:tenant.tenantId};
  await repository.devices.updateMany({tenantId:tenant.tenantId,status:"pending",pairingExpiresAt:{$lte:now}},{$set:{status:"expired",updatedAt:now}});
  if(!canManage)filter.ownerUserId=tenant.userId;
  const devices=await repository.devices.find(filter).sort({createdAt:-1}).limit(200).toArray();
  const ownerIds=[...new Set(devices.map((device:ConnectedDeviceRecord)=>device.ownerUserId))];
  const owners=canManage&&ownerIds.length?await access.getTenantUserSummaries(tenant.tenantId,ownerIds):[];
  const ownerById=new Map(owners.map((owner:any)=>[owner.id,{name:owner.name,email:owner.email}]));
  return {devices:devices.map((device:ConnectedDeviceRecord)=>({...publicDevice(device),...(canManage?{owner:ownerById.get(device.ownerUserId)??{name:"Former member",email:""}}:{})})),canManage};
 });
 ctx.server.post("/connected-devices/:deviceId/approve",async(request:any,reply:any)=>{
  const tenant=await dashboardTenant(request,reply);if(!tenant)return;
  if(!isDeviceAdministrator(tenant))return reply.code(403).send({error:"Organization administrator approval required."});
  const id=clean(request.params.deviceId,64),device=await repository.devices.findOne({tenantId:tenant.tenantId,id,status:"pending",pairingExpiresAt:{$gt:new Date()}});
  if(!device)return reply.code(404).send({error:"Pending device not found or pairing request expired."});
  if(!await isConnectedDeviceOwnerActive(access,device))return reply.code(403).send({error:"The device owner is no longer an active organization member."});
  const permissions=await availablePermissions(tenant.tenantId);
  let granted:string[];try{granted=normalizeRequestedCapabilities(request.body?.grantedCapabilities??[],permissions);}catch(error){return reply.code(400).send({error:error instanceof Error?error.message:"Invalid permissions"});}
  if(granted.some(capability=>!device.requestedCapabilities.includes(capability)))return reply.code(400).send({error:"Granted capabilities must be a subset of the device request."});
  const now=new Date(),result=await repository.devices.updateOne({tenantId:tenant.tenantId,id,status:"pending",pairingExpiresAt:{$gt:now}},{$set:{status:"active",grantedCapabilities:granted,approvedAt:now,approvedBy:tenant.userId,updatedAt:now}});
  if(!result.modifiedCount)return reply.code(409).send({error:"The device request changed. Refresh and try again."});
  const updated=await repository.devices.findOne({tenantId:tenant.tenantId,id});return {success:true,device:updated?publicDevice(updated):null,availablePermissions:permissions};
 });
 ctx.server.post("/connected-devices/:deviceId/suspend",async(request:any,reply:any)=>{
  const tenant=await dashboardTenant(request,reply);if(!tenant)return;
  if(!isDeviceAdministrator(tenant))return reply.code(403).send({error:"Organization administrator permission required."});
  const id=clean(request.params.deviceId,64),now=new Date();
  const result=await repository.devices.updateOne({tenantId:tenant.tenantId,id,status:"active"},{$set:{status:"suspended",updatedAt:now}});
  if(!result.modifiedCount)return reply.code(404).send({error:"Active device not found."});
  return {success:true};
 });
 ctx.server.post("/connected-devices/:deviceId/activate",async(request:any,reply:any)=>{
  const tenant=await dashboardTenant(request,reply);if(!tenant)return;
  if(!isDeviceAdministrator(tenant))return reply.code(403).send({error:"Organization administrator permission required."});
  const id=clean(request.params.deviceId,64),device=await repository.devices.findOne({tenantId:tenant.tenantId,id,status:"suspended"});
  if(!device)return reply.code(404).send({error:"Suspended device not found."});
  if(!await isConnectedDeviceOwnerActive(access,device))return reply.code(403).send({error:"The device owner is no longer an active organization member."});
  const result=await repository.devices.updateOne({tenantId:tenant.tenantId,id,status:"suspended"},{$set:{status:"active",updatedAt:new Date()}});
  if(!result.modifiedCount)return reply.code(409).send({error:"The device state changed. Refresh and try again."});
  return {success:true};
 });

 ctx.server.post("/connected-devices/:deviceId/unlink",async(request:any,reply:any)=>{
  const tenant=await dashboardTenant(request,reply);if(!tenant)return;
  const id=clean(request.params.deviceId,64),filter:any={tenantId:tenant.tenantId,id,status:{$nin:["revoked","unlinked"]}};
  if(!isDeviceAdministrator(tenant))filter.ownerUserId=tenant.userId;
  const now=new Date(),invalidatedCredential=hashDeviceSecret(createPairingSecrets().deviceCredential);
  const result=await repository.devices.updateOne(filter,{$set:{status:"unlinked",credentialHash:invalidatedCredential,grantedCapabilities:[],unlinkedAt:now,unlinkedBy:tenant.userId,updatedAt:now}});
  if(!result.modifiedCount)return reply.code(404).send({error:"Device not found or already unlinked."});
  return {success:true};
 });
 ctx.server.delete("/connected-devices/:deviceId",async(request:any,reply:any)=>{
  const tenant=await dashboardTenant(request,reply);if(!tenant)return;
  if(!isDeviceAdministrator(tenant))return reply.code(403).send({error:"Organization administrator permission required to delete device records."});
  const id=clean(request.params.deviceId,64),device=await repository.devices.findOne({tenantId:tenant.tenantId,id});
  if(!device)return reply.code(404).send({error:"Device not found."});
  await repository.devices.deleteOne({tenantId:tenant.tenantId,id});
  await repository.challenges.updateMany({tenantId:tenant.tenantId,deviceId:id,status:"claimed"},{$set:{status:"cancelled"}});
  return {success:true};
 });
 ctx.server.post("/connected-devices/:deviceId/revoke",async(request:any,reply:any)=>{
  const tenant=await dashboardTenant(request,reply);if(!tenant)return;
  const id=clean(request.params.deviceId,64),filter:any={tenantId:tenant.tenantId,id,status:{$ne:"revoked"}};
  if(!isDeviceAdministrator(tenant))filter.ownerUserId=tenant.userId;
  const now=new Date(),result=await repository.devices.updateOne(filter,{$set:{status:"revoked",revokedAt:now,revokedBy:tenant.userId,grantedCapabilities:[],updatedAt:now}});
  if(!result.modifiedCount)return reply.code(404).send({error:"Device not found or access already revoked."});
  return {success:true};
 });
 ctx.server.patch("/connected-devices/:deviceId",async(request:any,reply:any)=>{
  const tenant=await dashboardTenant(request,reply);if(!tenant)return;
  const id=clean(request.params.deviceId,64),name=clean(request.body?.name,80);if(!name)return reply.code(400).send({error:"A device name is required."});
  const filter:any={tenantId:tenant.tenantId,id,status:{$ne:"revoked"}};if(!isDeviceAdministrator(tenant))filter.ownerUserId=tenant.userId;
  const result=await repository.devices.updateOne(filter,{$set:{name,updatedAt:new Date()}});
  if(!result.modifiedCount)return reply.code(404).send({error:"Device not found."});return {success:true};
 });
 ctx.server.post("/connected-devices/device/unlink",async(request:any,reply:any)=>{
  const secret=clean(request.headers["x-device-pairing-secret"],256),id=clean(request.body?.deviceId,64);
  if(secret.length<40||!id)return reply.code(401).send({error:"Device pairing credential and device ID required."});
  const credentialHash=hashDeviceSecret(secret);
  const device=await repository.devices.findOne({id,credentialHash,status:{$in:["pending","active"]}});
  if(!device)return reply.code(404).send({error:"Device not found or already unlinked."});
  const now=new Date(),invalidatedCredential=hashDeviceSecret(createPairingSecrets().deviceCredential);
  const result=await repository.devices.updateOne(
   {tenantId:device.tenantId,id:device.id,credentialHash,status:{$in:["pending","active"]}},
   {$set:{status:"unlinked",credentialHash:invalidatedCredential,grantedCapabilities:[],unlinkedAt:now,unlinkedBy:"device",updatedAt:now}}
  );
  if(!result.modifiedCount)return reply.code(409).send({error:"The device state changed. Refresh and try again."});
  await repository.challenges.updateMany({tenantId:device.tenantId,deviceId:device.id,status:"claimed"},{$set:{status:"cancelled"}});
  return {success:true};
 });
 ctx.server.post("/connected-devices/device/heartbeat",async(request:any,reply:any)=>{
  const device=await authenticateDevice(request,reply);if(!device)return;
  const now=new Date();await repository.devices.updateOne({tenantId:device.tenantId,id:device.id,status:"active"},{$set:{lastSeenAt:now,updatedAt:now}});
  return {success:true,serverTime:now.toISOString()};
 });
 ctx.server.post("/connected-devices/device/rotate-credential",async(request:any,reply:any)=>{
  const device=await authenticateDevice(request,reply);if(!device)return;
  const current=String(request.headers.authorization??"").slice(7).trim(),next=createPairingSecrets().deviceCredential;
  const result=await repository.devices.updateOne({tenantId:device.tenantId,id:device.id,status:"active",credentialHash:hashDeviceSecret(current)},{$set:{credentialHash:hashDeviceSecret(next),updatedAt:new Date()}});
  if(!result.modifiedCount)return reply.code(409).send({error:"Credential changed. Authenticate again and retry."});
  return {credential:next,rotatedAt:new Date().toISOString()};
 });
 ctx.server.get("/connected-devices/device/me",async(request:any,reply:any)=>{
  const device=await authenticateDevice(request,reply);if(!device)return;
  const permissions=await availablePermissions(device.tenantId);
  const availableKeys=new Set(permissions.map((permission:any)=>permission.key));
  const granted=device.grantedCapabilities.filter((key:string)=>availableKeys.has(key));
  return {device:{...publicDevice(device),grantedCapabilities:granted,grantedPermissions:granted},availablePermissions:permissions};
 });
}
