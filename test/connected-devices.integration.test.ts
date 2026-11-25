import {test} from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import {MongoClient} from "mongodb";
import {ConnectedDevicesRepository} from "../src/plugins/connected-devices/connected-devices.repository.js";
import {registerConnectedDevicesRoutes} from "../src/plugins/connected-devices/connected-devices.routes.js";

const uri=process.env.MONGODB_TEST_URI;

test("Connected Devices routes use MongoDB tenant filters and audit cross-company references",{skip:!uri},async()=>{
 const dbName="bee_connected_devices_idor_"+Date.now();
 const client=new MongoClient(uri!);
 await client.connect();
 const db=client.db(dbName);
 const repository=new ConnectedDevicesRepository(db);
 const app=Fastify();
 const tenant={tenantId:"tenant-alpha",userId:"owner-alpha",role:"owner"};
 const now=new Date();
 try{
  await repository.initializeIndexes();
  await repository.devices.insertOne({
   id:"device-beta",tenantId:"tenant-beta",ownerUserId:"owner-beta",requestedBy:"owner-beta",
   name:"Beta scanner",deviceType:"mobile",platform:"android",appVersion:null,
   requestedCapabilities:["scanner.use"],grantedCapabilities:[],credentialHash:"b".repeat(64),
   status:"pending",pairingExpiresAt:new Date(now.getTime()+60_000),createdAt:now,updatedAt:now,
   approvedAt:null,approvedBy:null,revokedAt:null,revokedBy:null,lastSeenAt:null
  });
  await repository.challenges.insertOne({
   id:"challenge-beta",tenantId:"tenant-beta",userId:"owner-beta",tokenHash:"c".repeat(64),
   requestedCapabilities:["scanner.use"],status:"issued",expiresAt:new Date(now.getTime()+60_000),
   createdAt:now,claimedAt:null,deviceId:null
  });
  registerConnectedDevicesRoutes({server:app,logger:{error(){}}} as any,{
   db,repository,dashboardTenant:async()=>tenant,authenticateDevice:async()=>null
  });
  await app.ready();

  const attempts:Array<{method:"POST"|"PATCH"|"DELETE";url:string;payload?:unknown}>=[
   {method:"POST",url:"/connected-devices/device-beta/approve",payload:{grantedCapabilities:["scanner.use"]}},
   {method:"POST",url:"/connected-devices/device-beta/suspend"},
   {method:"POST",url:"/connected-devices/device-beta/activate"},
   {method:"POST",url:"/connected-devices/device-beta/unlink"},
   {method:"DELETE",url:"/connected-devices/device-beta"},
   {method:"POST",url:"/connected-devices/device-beta/revoke"},
   {method:"PATCH",url:"/connected-devices/device-beta",payload:{name:"Changed by Alpha"}},
   {method:"POST",url:"/connected-devices/pairing-challenges/challenge-beta/cancel"}
  ];
  for(const attempt of attempts){
   const response=await app.inject({method:attempt.method,url:attempt.url,payload:attempt.payload});
   assert.equal(response.statusCode,404,attempt.method+" "+attempt.url+" must hide the foreign tenant resource");
  }

  const foreignDevice=await repository.devices.findOne({tenantId:"tenant-beta",id:"device-beta"});
  assert.ok(foreignDevice);
  assert.equal(foreignDevice.status,"pending");
  assert.equal(foreignDevice.name,"Beta scanner");
  assert.deepEqual(foreignDevice.grantedCapabilities,[]);
  const foreignChallenge=await repository.challenges.findOne({tenantId:"tenant-beta",id:"challenge-beta"});
  assert.ok(foreignChallenge);
  assert.equal(foreignChallenge.status,"issued");

  const actorEvents=await db.collection("tenant_audit_events").find({tenantId:"tenant-alpha"}).toArray();
  assert.equal(actorEvents.length,attempts.length,"each cross-tenant reference denial must append an actor-tenant event");
  assert.ok(actorEvents.every(event=>event.actorId==="owner-alpha"&&event.action==="permission.denied"&&event.outcome==="denied"));
  assert.equal(await db.collection("tenant_audit_events").countDocuments({tenantId:"tenant-beta"}),0,"the foreign tenant must not receive the requester's denial events");
 }finally{
  await app.close();
  await db.dropDatabase();
  await client.close();
 }
});
