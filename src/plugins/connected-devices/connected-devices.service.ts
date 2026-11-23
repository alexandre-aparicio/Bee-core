import { createHash, randomBytes } from "node:crypto";
import type { Db } from "mongodb";
import { resolveTenantContext, type TenantContext } from "../../core/tenant-context.js";
import { hasPluginEntitlement, isPluginEnabled, isPluginInstalled } from "../../core/plugin-entitlements.js";
import { ConnectedDevicesRepository, type ConnectedDeviceRecord } from "./connected-devices.repository.js";

export const CONNECTED_DEVICE_CAPABILITIES = Object.freeze([
 "device.status.write","scanner.use","camera.capture","catalog.read","inventory.read",
 "inventory.write","pos.session.read","pos.order.write","location.read","notifications.receive"
] as const);
export type ConnectedDeviceCapability=typeof CONNECTED_DEVICE_CAPABILITIES[number];
export function hashDeviceSecret(value:string):string{return createHash("sha256").update(value,"utf8").digest("hex");}
export function normalizeRequestedCapabilities(value:unknown):string[]{
 if(!Array.isArray(value)||value.length>10)throw new Error("Choose up to 10 supported capabilities.");
 const result=[...new Set(value.map(item=>String(item??"").trim()))];
 if(result.some(item=>!CONNECTED_DEVICE_CAPABILITIES.includes(item as ConnectedDeviceCapability)))throw new Error("One or more requested capabilities are not supported.");
 return result;
}
export function isDeviceAdministrator(tenant:TenantContext):boolean{return tenant.role==="owner"||tenant.role==="admin"||tenant.role==="super_admin";}
export function publicDevice(device:ConnectedDeviceRecord){
 return {id:device.id,name:device.name,deviceType:device.deviceType,platform:device.platform,appVersion:device.appVersion,
 requestedCapabilities:device.requestedCapabilities,grantedCapabilities:device.grantedCapabilities,
 status:device.status,createdAt:device.createdAt,updatedAt:device.updatedAt,approvedAt:device.approvedAt,lastSeenAt:device.lastSeenAt};
}
export function createPairingSecrets(){return {qrToken:randomBytes(32).toString("base64url"),deviceCredential:randomBytes(48).toString("base64url")};}
export async function isConnectedDeviceOwnerActive(db:Db,device:ConnectedDeviceRecord):Promise<boolean>{
 const [membership,user,tenant]=await Promise.all([
  db.collection("memberships").findOne({tenantId:device.tenantId,userId:device.ownerUserId,status:"active"},{projection:{_id:1}}),
  db.collection("users").findOne({id:device.ownerUserId,enabled:true},{projection:{_id:1}}),
  db.collection("tenants").findOne({id:device.tenantId,$or:[{status:"active"},{status:null}]},{projection:{_id:1}})
 ]);
 return Boolean(membership&&user&&tenant);
}
export function createConnectedDevicesServices(input:{db:Db;secret:string;repository:ConnectedDevicesRepository}){
 const {db,secret,repository}=input;
 const dashboardTenant=async(request:any,reply:any):Promise<TenantContext|null>=>{
  try{
   await request.jwtVerify();
   const tenant=await resolveTenantContext(db,request.user,{},secret);
   if(!tenant||tenant.client!=="dashboard"){reply.code(401).send({error:"Dashboard session required"});return null;}
   const available=await hasPluginEntitlement(db,tenant.tenantId,"connected-devices")&&await isPluginInstalled(db,tenant.tenantId,"connected-devices")&&await isPluginEnabled(db,tenant.tenantId,"connected-devices");
   if(!available){reply.code(403).send({error:"Connected Devices is not entitled, installed or enabled for this company."});return null;}
   return tenant;
  }catch{reply.code(401).send({error:"Unauthorized"});return null;}
 };
 const deviceFromCredential=async(credential:string):Promise<ConnectedDeviceRecord|null>=>{
  if(!credential||credential.length<40||credential.length>256)return null;
  const device=await repository.devices.findOne({credentialHash:hashDeviceSecret(credential),status:"active"});
  if(!device)return null;
  if(!await isConnectedDeviceOwnerActive(db,device)){
   await repository.devices.updateOne({tenantId:device.tenantId,id:device.id,status:"active"},{$set:{status:"revoked",revokedAt:new Date(),revokedBy:"system:membership-revoked",grantedCapabilities:[],updatedAt:new Date()}});
   return null;
  }
  const available=await hasPluginEntitlement(db,device.tenantId,"connected-devices")&&await isPluginInstalled(db,device.tenantId,"connected-devices")&&await isPluginEnabled(db,device.tenantId,"connected-devices");
  return available?device:null;
 };
 const authenticateDevice=async(request:any,reply:any):Promise<ConnectedDeviceRecord|null>=>{
  const header=String(request.headers.authorization??"");
  const device=await deviceFromCredential(header.startsWith("Bearer ")?header.slice(7).trim():"");
  if(!device){reply.code(401).send({error:"Invalid, revoked or inactive device credential."});return null;}
  return device;
 };
 return {db,secret,repository,dashboardTenant,deviceFromCredential,authenticateDevice};
}
/** Public integration contract for consuming plugins. Tenant ID must come from Core's authenticated context. */
export async function hasConnectedDeviceCapability(db:Db,tenantId:string,deviceId:string,capability:string):Promise<boolean>{
 if(!CONNECTED_DEVICE_CAPABILITIES.includes(capability as ConnectedDeviceCapability))return false;
 const [entitled,installed,enabled]=await Promise.all([hasPluginEntitlement(db,tenantId,"connected-devices"),isPluginInstalled(db,tenantId,"connected-devices"),isPluginEnabled(db,tenantId,"connected-devices")]);
 if(!entitled||!installed||!enabled)return false;
 const device=await db.collection<ConnectedDeviceRecord>("connected_devices").findOne({tenantId,id:deviceId,status:"active",grantedCapabilities:capability});
 if(!device)return false;
 if(!await isConnectedDeviceOwnerActive(db,device)){
  await db.collection<ConnectedDeviceRecord>("connected_devices").updateOne({tenantId,id:deviceId,status:"active"},{$set:{status:"revoked",revokedAt:new Date(),revokedBy:"system:membership-revoked",grantedCapabilities:[],updatedAt:new Date()}});
  return false;
 }
 return true;
}
