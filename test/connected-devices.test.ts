import {test} from "node:test";
import assert from "node:assert/strict";
import {CONNECTED_DEVICE_CAPABILITIES,createPairingSecrets,hashDeviceSecret,isConnectedDeviceOwnerActive,isDeviceAdministrator,normalizeRequestedCapabilities,publicDevice} from "../src/plugins/connected-devices/connected-devices.service.js";
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
