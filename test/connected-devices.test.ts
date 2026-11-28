import {test} from "node:test";
import assert from "node:assert/strict";
import {createPairingSecrets,hashDeviceSecret,isConnectedDeviceOwnerActive,isDeviceAdministrator,normalizeRequestedCapabilities,publicDevice} from "../src/plugins/connected-devices/connected-devices.service.js";
test("device permission requests are sourced from connector manifests and restricted to active package declarations",()=>{
 const declared=[{pluginId:"time-tracking-connected",key:"time-tracking-connected.clock",module:"time-tracking-connected",resource:"clock",action:"create",label:"Register working time"},{pluginId:"time-tracking-connected",key:"time-tracking-connected.location",module:"time-tracking-connected",resource:"location",action:"read",label:"Share location"}];
 assert.deepEqual(normalizeRequestedCapabilities(["time-tracking-connected.clock","time-tracking-connected.clock","time-tracking-connected.location"],declared),["time-tracking-connected.clock","time-tracking-connected.location"]);
 assert.throws(()=>normalizeRequestedCapabilities(["admin.root"],declared),/not declared/);
 assert.throws(()=>normalizeRequestedCapabilities(Array(101).fill("time-tracking-connected.clock"),declared),/up to 100/);
 assert.deepEqual(normalizeRequestedCapabilities([],[]),[]);
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
test("device owner activity is delegated to the host access contract",async()=>{
 const device:any={tenantId:"tenant-1",ownerUserId:"user-1"};
 const calls:Array<[string,string]>=[];
 const access={isTenantUserActive:async(tenantId:string,userId:string)=>{calls.push([tenantId,userId]);return true;}};
 assert.equal(await isConnectedDeviceOwnerActive(access as any,device),true);
 assert.deepEqual(calls,[["tenant-1","user-1"]]);
 access.isTenantUserActive=async()=>false;
 assert.equal(await isConnectedDeviceOwnerActive(access as any,device),false);
});
