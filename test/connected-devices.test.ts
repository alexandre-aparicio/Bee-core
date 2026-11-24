import {test} from "node:test";
import assert from "node:assert/strict";
import {CONNECTED_DEVICE_CAPABILITIES,createPairingSecrets,hashDeviceSecret,isConnectedDeviceOwnerActive,isDeviceAdministrator,normalizeRequestedCapabilities,publicDevice} from "../src/plugins/connected-devices/connected-devices.service.js";
import {registerConnectedDevicesRoutes} from "../src/plugins/connected-devices/connected-devices.routes.js";
import type {Db} from "mongodb";
test("capability requests are unique, bounded and restricted to the supported vocabulary",()=>{
 assert.deepEqual(normalizeRequestedCapabilities(["scanner.use","scanner.use","catalog.read"]),["scanner.use","catalog.read"]);
 assert.throws(()=>normalizeRequestedCapabilities(["admin.root"]),/not supported/);
 assert.throws(()=>normalizeRequestedCapabilities(Array(11).fill("scanner.use")),/up to 10/);
 assert.equal(CONNECTED_DEVICE_CAPABILITIES.includes("pos.order.write"),true);
});
test("device credentials are stored as one-way SHA-256 hashes",()=>{
 const secret="a".repeat(64),digest=hashDeviceSecret(secret);
 assert.notEqual(digest,secret);assert.equal(digest,hashDeviceSecret(secret));assert.equal(digest.length,64);
});

test("pairing and device credentials are independent high-entropy secrets",()=>{
 const first=createPairingSecrets(),second=createPairingSecrets();
 assert.equal(first.qrToken.length,43);
 assert.equal(first.deviceCredential.length,64);
 assert.notEqual(first.qrToken,first.deviceCredential);
 assert.notEqual(first.qrToken,second.qrToken);
 assert.notEqual(first.deviceCredential,second.deviceCredential);
});
test("public device projection never exposes credential or pairing secrets",()=>{
 const device:any={id:"device-1",tenantId:"tenant-1",ownerUserId:"user-1",requestedBy:"user-1",name:"Scanner",deviceType:"mobile",platform:"android",appVersion:null,requestedCapabilities:["scanner.use"],grantedCapabilities:[],credentialHash:"secret-hash",pairingExpiresAt:new Date(),status:"pending",createdAt:new Date(),updatedAt:new Date(),approvedAt:null,approvedBy:null,revokedAt:null,revokedBy:null,lastSeenAt:null};
 const projected=publicDevice(device);
 assert.equal("credentialHash" in projected,false);
 assert.equal("ownerUserId" in projected,false);
 assert.equal("pairingExpiresAt" in projected,false);
});
test("only tenant owners and admins can manage the tenant device registry",()=>{
 const context=(role:string)=>({role} as any);
 assert.equal(isDeviceAdministrator(context("owner")),true);
 assert.equal(isDeviceAdministrator(context("admin")),true);
 assert.equal(isDeviceAdministrator(context("manager")),false);
 assert.equal(isDeviceAdministrator(context("member")),false);
});
test("device access requires an active user, membership and tenant",async()=>{
 const device:any={tenantId:"tenant-1",ownerUserId:"user-1"};
 const makeDb=(membership:any,user:any,tenant:any)=>({
  collection:(name:string)=>({findOne:async()=>name==="memberships"?membership:name==="users"?user:tenant})
 }) as unknown as Db;
 assert.equal(await isConnectedDeviceOwnerActive(makeDb({_id:1},{_id:1},{_id:1}),device),true);
 assert.equal(await isConnectedDeviceOwnerActive(makeDb(null,{_id:1},{_id:1}),device),false);
 assert.equal(await isConnectedDeviceOwnerActive(makeDb({_id:1},null,{_id:1}),device),false);
 assert.equal(await isConnectedDeviceOwnerActive(makeDb({_id:1},{_id:1},null),device),false);
});

test("connected-device dashboard routes enforce tenant scope and append tenant audit events",async()=>{
 const routes=new Map<string,(request:any,reply:any)=>Promise<any>>();
 const auditEvents:any[]=[];
 const tenant={tenantId:"tenant-alpha",userId:"admin-alpha",role:"owner"};
 const device:any={id:"device-1",tenantId:"tenant-beta",ownerUserId:"owner-beta",requestedBy:"owner-beta",name:"Scanner",deviceType:"mobile",platform:"android",appVersion:null,requestedCapabilities:["scanner.use"],grantedCapabilities:[],credentialHash:"x".repeat(64),status:"pending",pairingExpiresAt:new Date(Date.now()+60_000),createdAt:new Date(),updatedAt:new Date(),approvedAt:null,approvedBy:null,revokedAt:null,revokedBy:null,lastSeenAt:null};
 const matches=(record:any,filter:any):boolean=>{
  for(const [key,value] of Object.entries(filter??{})){
   if(key==="$and"){if(!(value as any[]).every(item=>matches(record,item)))return false;continue;}
   const actual=record[key];
   if(value&&typeof value==="object"&&!Array.isArray(value)){
    const operators=value as Record<string,unknown>;
    if("$in" in operators&&!((operators.$in as unknown[]).includes(actual)))return false;
    if("$nin" in operators&&(operators.$nin as unknown[]).includes(actual))return false;
    if("$ne" in operators&&actual===operators.$ne)return false;
    if("$gt" in operators&&!(actual instanceof Date&&actual>(operators.$gt as Date)))return false;
    if("$lte" in operators&&!(actual instanceof Date&&actual<=(operators.$lte as Date)))return false;
   }else if(actual!==value)return false;
  }
  return true;
 };
 const deviceCollection={
  findOne:async(filter:any)=>matches(device,filter)?device:null,
  updateOne:async(filter:any,update:any)=>{
   if(!matches(device,filter))return {modifiedCount:0};
   Object.assign(device,update.$set??{});return {modifiedCount:1};
  },
  deleteOne:async(filter:any)=>matches(device,filter)?{deletedCount:1}:{deletedCount:0},
  updateMany:async()=>({modifiedCount:0}),
  find:()=>({sort:()=>({limit:()=>({toArray:async()=>[]})})})
 };
 const challengeCollection={updateMany:async()=>({modifiedCount:0}),findOne:async()=>null,countDocuments:async()=>0,insertOne:async()=>({insertedId:"challenge"})};
 const db:any={collection:(name:string)=>name==="tenant_audit_events"?{insertOne:async(event:any)=>{auditEvents.push(event);return {insertedId:event.id};}}:{findOne:async()=>({_id:1})}};
 const ctx:any={server:{get:(path:string,handler:any)=>routes.set("GET "+path,handler),post:(path:string,handler:any)=>routes.set("POST "+path,handler),patch:(path:string,handler:any)=>routes.set("PATCH "+path,handler),delete:(path:string,handler:any)=>routes.set("DELETE "+path,handler)},logger:{error(){}}};
 registerConnectedDevicesRoutes(ctx,{db,repository:{devices:deviceCollection,challenges:challengeCollection},dashboardTenant:async()=>tenant,authenticateDevice:async()=>null});
 const reply=()=>({statusCode:200,payload:null as any,code(status:number){this.statusCode=status;return this;},send(payload:any){this.payload=payload;return payload;}});
 const invoke=async(key:string,request:any)=>{
  const handler=routes.get(key);assert.ok(handler,"route registered: "+key);
  const response=reply();await handler(request,response);return response;
 };
 const foreignDeviceRequest={params:{deviceId:"device-1"},body:{grantedCapabilities:["scanner.use"],name:"Changed by foreign tenant"},headers:{}};
 const foreignAttempts:Array<[string,any,string]>=[
  ["POST /connected-devices/:deviceId/approve",foreignDeviceRequest,"device.approve"],
  ["POST /connected-devices/:deviceId/suspend",foreignDeviceRequest,"device.suspend"],
  ["POST /connected-devices/:deviceId/activate",foreignDeviceRequest,"device.activate"],
  ["POST /connected-devices/:deviceId/unlink",foreignDeviceRequest,"device.unlink"],
  ["DELETE /connected-devices/:deviceId",foreignDeviceRequest,"device.delete"],
  ["POST /connected-devices/:deviceId/revoke",foreignDeviceRequest,"device.revoke"],
  ["PATCH /connected-devices/:deviceId",foreignDeviceRequest,"device.rename"],
  ["POST /connected-devices/pairing-challenges/:challengeId/cancel",{params:{challengeId:"challenge-beta"},body:{},headers:{}},"pairing.cancel"]
 ];
 for(const [key,request] of foreignAttempts){
  const response=await invoke(key,request);
  assert.equal(response.statusCode,404,key+" must hide a resource owned by another tenant");
 }
 assert.equal(device.tenantId,"tenant-beta");
 assert.equal(device.status,"pending","cross-tenant attempts must not mutate the foreign device");
 assert.equal(device.name,"Scanner","cross-tenant rename must not mutate the foreign device");
 assert.equal(auditEvents.length,foreignAttempts.length,"each cross-tenant resource denial must be audited");
 assert.ok(auditEvents.every(event=>event.tenantId==="tenant-alpha"),"denials must be written only to the requesting tenant audit stream");
 assert.ok(auditEvents.every(event=>event.actorId==="admin-alpha"&&event.action==="permission.denied"&&event.outcome==="denied"));
 assert.deepEqual(new Set(auditEvents.map(event=>event.metadata.operation)),new Set(foreignAttempts.map(([, ,operation])=>operation)));
 assert.ok(!auditEvents.some(event=>event.tenantId==="tenant-beta"),"the foreign tenant must never receive an event from the requester");

 device.tenantId="tenant-alpha";
 const approved=await invoke("POST /connected-devices/:deviceId/approve",{...foreignDeviceRequest,body:{grantedCapabilities:["scanner.use"]}});
 assert.equal(device.status,"active");
 assert.equal(approved.statusCode,200);
 assert.equal(auditEvents.length,foreignAttempts.length+1);
 const successEvent=auditEvents.at(-1);
 assert.equal(successEvent.tenantId,"tenant-alpha");
 assert.equal(successEvent.actorId,"admin-alpha");
 assert.equal(successEvent.action,"device.approved");
 assert.equal(successEvent.outcome,"success");
 assert.equal(successEvent.resourceId,"device-1");
 assert.equal(successEvent.metadata.grantedCapabilities,"scanner.use");
});