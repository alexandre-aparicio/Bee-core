import { createHash, randomBytes } from "node:crypto";
import type { Db } from "mongodb";
import type { PluginTenantContext } from "../../core/plugin-services.js";
import type { PluginAccessService } from "../../core/plugin-services.js";
import { ConnectedDevicesRepository, type ConnectedDeviceRecord } from "./connected-devices.repository.js";

export type ConnectedDevicePermission = { pluginId:string; key:string; module:string; resource:string; action:string; label:string; };
export type ConnectedDeviceCapability = string;
export function hashDeviceSecret(value:string):string{return createHash("sha256").update(value,"utf8").digest("hex");}
export function normalizeRequestedCapabilities(value:unknown,availablePermissions:readonly ConnectedDevicePermission[]):string[]{
 if(!Array.isArray(value)||value.length>100)throw new Error("Choose up to 100 permissions declared by installed connectors.");
 const result=[...new Set(value.map(item=>String(item??"").trim()))];
 const allowed=new Set(availablePermissions.map(permission=>permission.key));
 if(result.some(item=>!allowed.has(item)))throw new Error("One or more requested permissions are not declared by an installed, enabled connector.");
 return result;
}
export function isDeviceAdministrator(tenant:PluginTenantContext):boolean{return tenant.role==="owner"||tenant.role==="admin"||tenant.role==="super_admin";}
export function publicDevice(device:ConnectedDeviceRecord,availablePermissionKeys?:ReadonlySet<string>){
 const visible=(capabilities:string[])=>availablePermissionKeys?capabilities.filter(key=>availablePermissionKeys.has(key)):capabilities;
 return {id:device.id,name:device.name,deviceType:device.deviceType,platform:device.platform,appVersion:device.appVersion,
 requestedCapabilities:visible(device.requestedCapabilities),grantedCapabilities:visible(device.grantedCapabilities),pairingChallengeId:device.pairingChallengeId,
 status:device.status,createdAt:device.createdAt,updatedAt:device.updatedAt,approvedAt:device.approvedAt,lastSeenAt:device.lastSeenAt};
}
export function createPairingSecrets(){return {qrToken:randomBytes(32).toString("base64url"),deviceCredential:randomBytes(48).toString("base64url")};}
export async function isConnectedDeviceOwnerActive(access:PluginAccessService,device:ConnectedDeviceRecord):Promise<boolean>{
 return access.isTenantUserActive(device.tenantId,device.ownerUserId);
}
export function createConnectedDevicesServices(input:{secret:string;repository:ConnectedDevicesRepository;access:PluginAccessService}){
 const {secret,repository,access}=input;
 const dashboardTenant=async(request:any,reply:any):Promise<PluginTenantContext|null>=>{
  try{
   await request.jwtVerify();
   const tenant=await access.resolveTenantContext(request.user,secret);
   if(!tenant||tenant.client!=="dashboard"){reply.code(401).send({error:"Dashboard session required"});return null;}
   const available=await access.isPluginAvailable(tenant.tenantId,"connected-devices");
   if(!available){reply.code(403).send({error:"Connected Devices is not entitled, installed or enabled for this company."});return null;}
   return tenant;
  }catch{reply.code(401).send({error:"Unauthorized"});return null;}
 };
 const deviceFromCredential=async(credential:string):Promise<ConnectedDeviceRecord|null>=>{
  if(!credential||credential.length<40||credential.length>256)return null;
  const device=await repository.devices.findOne({credentialHash:hashDeviceSecret(credential),status:"active"});
  if(!device)return null;
  if(!await isConnectedDeviceOwnerActive(access,device)){
   await repository.devices.updateOne({tenantId:device.tenantId,id:device.id,status:"active"},{$set:{status:"revoked",revokedAt:new Date(),revokedBy:"system:membership-revoked",grantedCapabilities:[],updatedAt:new Date()}});
   return null;
  }
  const available=await access.isPluginAvailable(device.tenantId,"connected-devices");
  return available?device:null;
 };
 const authenticateDevice=async(request:any,reply:any):Promise<ConnectedDeviceRecord|null>=>{
  const header=String(request.headers.authorization??"");
  const device=await deviceFromCredential(header.startsWith("Bearer ")?header.slice(7).trim():"");
  if(!device){reply.code(401).send({error:"Invalid, revoked or inactive device credential."});return null;}
  return device;
 };
 return {secret,repository,access,dashboardTenant,deviceFromCredential,authenticateDevice,availablePermissions:(tenantId:string)=>access.getTenantConnectorPermissions(tenantId)};
}
/** Public integration contract for consuming plugins. Tenant ID must come from Core's authenticated context. */
export async function hasConnectedDeviceCapability(db:Db,access:PluginAccessService,tenantId:string,deviceId:string,capability:string):Promise<boolean>{
 if(!await access.isPluginAvailable(tenantId,"connected-devices"))return false;
 const declaredPermissions=await access.getTenantConnectorPermissions(tenantId);
 if(!declaredPermissions.some(permission=>permission.key===capability))return false;
 const device=await db.collection<ConnectedDeviceRecord>("connected_devices").findOne({tenantId,id:deviceId,status:"active",grantedCapabilities:capability});
 if(!device)return false;
 if(!await isConnectedDeviceOwnerActive(access,device)){
  await db.collection<ConnectedDeviceRecord>("connected_devices").updateOne({tenantId,id:deviceId,status:"active"},{$set:{status:"revoked",revokedAt:new Date(),revokedBy:"system:membership-revoked",grantedCapabilities:[],updatedAt:new Date()}});
  return false;
 }
 return true;
}
