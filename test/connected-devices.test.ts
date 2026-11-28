import {test} from "node:test";
import assert from "node:assert/strict";
import {createDeviceCredential,createPairingSecrets,hashDeviceSecret,isConnectedDeviceOwnerActive,isDeviceAdministrator,normalizeRequestedCapabilities,publicDevice} from "../src/plugins/connected-devices/connected-devices.service.js";
import {registerConnectedDevicesRoutes} from "../src/plugins/connected-devices/connected-devices.routes.js";
test("device permission requests are sourced from connector manifests and restricted to active package declarations",()=>{
 const declared=[{pluginId:"time-tracking-connected",key:"time-tracking-connected.clock",module:"time-tracking-connected",resource:"clock",action:"create",label:"Register working time"},{pluginId:"time-tracking-connected",key:"time-tracking-connected.location",module:"time-tracking-connected",resource:"location",action:"read",label:"Share location"}];
 assert.deepEqual(normalizeRequestedCapabilities(["time-tracking-connected.clock","time-tracking-connected.clock","time-tracking-connected.location"],declared),["time-tracking-connected.clock","time-tracking-connected.location"]);
 assert.throws(()=>normalizeRequestedCapabilities(["admin.root"],declared),/not declared/);
 assert.throws(()=>normalizeRequestedCapabilities(Array(101).fill("time-tracking-connected.clock"),declared),/up to 100/);
 assert.deepEqual(normalizeRequestedCapabilities([],[]),[]);
});
test("pairing challenge endpoint rejects non-connector plugin permissions with HTTP 400", async () => {
 const routes=new Map<string,(request:any,reply:any)=>Promise<any>>();
 const server={get:(path:string,handler:any)=>routes.set("GET "+path,handler),post:(path:string,handler:any)=>routes.set("POST "+path,handler),delete:(path:string,handler:any)=>routes.set("DELETE "+path,handler),patch:(path:string,handler:any)=>routes.set("PATCH "+path,handler)};
 const connectorPermissions=[
  {pluginId:"time-tracking-connected",key:"time-tracking-connected.clock-in",module:"time-tracking-connected",resource:"clock-in",action:"create",label:"Clock in"},
  {pluginId:"time-tracking-connected",key:"time-tracking-connected.clock-out",module:"time-tracking-connected",resource:"clock-out",action:"create",label:"Clock out"},
  {pluginId:"time-tracking-connected",key:"time-tracking-connected.records.read",module:"time-tracking-connected",resource:"records",action:"read",label:"Read records"}
 ];
 registerConnectedDevicesRoutes({server,logger:{error(){}}} as any,{
  repository:{},dashboardTenant:async()=>({tenantId:"tenant-a",userId:"user-a",client:"dashboard",role:"owner"}),
  authenticateDevice:async()=>null,access:{},availablePermissions:async()=>connectorPermissions
 });
 const handler=routes.get("POST /connected-devices/pairing-challenges")!;
 const reply:any={statusCode:200,payload:null,code(value:number){this.statusCode=value;return this;},send(value:any){this.payload=value;return value;}};
 await handler({body:{requestedCapabilities:["time-tracking.manage"]}},reply);
 assert.equal(reply.statusCode,400);
 assert.match(reply.payload.error,/not declared/);
});

test("device approval rejects a non-connector permission with HTTP 400", async () => {
 const routes=new Map<string,(request:any,reply:any)=>Promise<any>>();
 const server={get:(path:string,handler:any)=>routes.set("GET "+path,handler),post:(path:string,handler:any)=>routes.set("POST "+path,handler),delete:(path:string,handler:any)=>routes.set("DELETE "+path,handler),patch:(path:string,handler:any)=>routes.set("PATCH "+path,handler)};
 const connectorPermissions=[{pluginId:"time-tracking-connected",key:"time-tracking-connected.clock-in",module:"time-tracking-connected",resource:"clock-in",action:"create",label:"Clock in"}];
 const device:any={id:"device-1",tenantId:"tenant-a",ownerUserId:"user-a",requestedCapabilities:["time-tracking-connected.clock-in"],grantedCapabilities:[],status:"pending",pairingExpiresAt:new Date(Date.now()+60000)};
 registerConnectedDevicesRoutes({server,logger:{error(){}}} as any,{
  repository:{devices:{findOne:async()=>device}},dashboardTenant:async()=>({tenantId:"tenant-a",userId:"admin-a",client:"dashboard",role:"owner"}),
  authenticateDevice:async()=>null,access:{isTenantUserActive:async()=>true},availablePermissions:async()=>connectorPermissions
 });
 const handler=routes.get("POST /connected-devices/:deviceId/approve")!;
 const reply:any={statusCode:200,payload:null,code(value:number){this.statusCode=value;return this;},send(value:any){this.payload=value;return value;}};
 await handler({params:{deviceId:"device-1"},body:{grantedCapabilities:["time-tracking.manage"]}},reply);
 assert.equal(reply.statusCode,400);
 assert.match(reply.payload.error,/not declared/);
});

test("legacy pending requests with non-connector capabilities cannot be approved", async () => {
 const routes=new Map<string,(request:any,reply:any)=>Promise<any>>();
 const server={get:(path:string,handler:any)=>routes.set("GET "+path,handler),post:(path:string,handler:any)=>routes.set("POST "+path,handler),delete:(path:string,handler:any)=>routes.set("DELETE "+path,handler),patch:(path:string,handler:any)=>routes.set("PATCH "+path,handler)};
 const connectorPermissions=[{pluginId:"time-tracking-connected",key:"time-tracking-connected.clock-in",module:"time-tracking-connected",resource:"clock-in",action:"create",label:"Clock in"}];
 const device:any={id:"device-1",tenantId:"tenant-a",ownerUserId:"user-a",requestedCapabilities:["time-tracking.manage"],grantedCapabilities:[],status:"pending",pairingExpiresAt:new Date(Date.now()+60000)};
 registerConnectedDevicesRoutes({server,logger:{error(){}}} as any,{
  repository:{devices:{findOne:async()=>device}},dashboardTenant:async()=>({tenantId:"tenant-a",userId:"admin-a",client:"dashboard",role:"owner"}),
  authenticateDevice:async()=>null,access:{isTenantUserActive:async()=>true},availablePermissions:async()=>connectorPermissions
 });
 const handler=routes.get("POST /connected-devices/:deviceId/approve")!;
 const reply:any={statusCode:200,payload:null,code(value:number){this.statusCode=value;return this;},send(value:any){this.payload=value;return value;}};
 await handler({params:{deviceId:"device-1"},body:{grantedCapabilities:[]}},reply);
 assert.equal(reply.statusCode,409);
 assert.match(reply.payload.error,/no longer available/);
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
 const device:any={id:"device-1",tenantId:"tenant-1",ownerUserId:"user-1",requestedBy:"user-1",name:"Scanner",deviceType:"mobile",platform:"android",appVersion:null,requestedCapabilities:["time-tracking.manage","time-tracking-connected.clock-in"],grantedCapabilities:["time-tracking.manage","time-tracking-connected.clock-in"],credentialHash:"secret-hash",pairingExpiresAt:new Date(),status:"pending",createdAt:new Date(),updatedAt:new Date(),approvedAt:null,approvedBy:null,revokedAt:null,revokedBy:null,lastSeenAt:null};
 const projected=publicDevice(device,new Set(["time-tracking-connected.clock-in"]));
 assert.deepEqual(projected.requestedCapabilities,["time-tracking-connected.clock-in"]);
 assert.deepEqual(projected.grantedCapabilities,["time-tracking-connected.clock-in"]);
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
test("device owner activity is delegated to the host access contract",async()=>{
 const device:any={tenantId:"tenant-1",ownerUserId:"user-1"};
 const calls:Array<[string,string]>=[];
 const access={isTenantUserActive:async(tenantId:string,userId:string)=>{calls.push([tenantId,userId]);return true;}};
 assert.equal(await isConnectedDeviceOwnerActive(access as any,device),true);
 assert.deepEqual(calls,[["tenant-1","user-1"]]);
 access.isTenantUserActive=async()=>false;
 assert.equal(await isConnectedDeviceOwnerActive(access as any,device),false);
});
