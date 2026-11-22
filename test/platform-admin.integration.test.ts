import {test} from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import {MongoClient} from "mongodb";
import bcrypt from "bcryptjs";
import {createHmac} from "node:crypto";
import {base32Decode} from "../src/core/totp.js";
import {authPlugin} from "../src/plugins/auth/auth.plugin.js";
import {organizationsPlugin} from "../src/plugins/organizations/organizations.plugin.js";
import {platformAdminPlugin} from "../src/plugins/platform-admin/platform-admin.plugin.js";
import {BeeEventBus} from "../src/core/event-bus.js";
import type {BeeContext,BeeLogger} from "../src/core/types.js";

const uri=process.env.MONGODB_TEST_URI;
const jwtSecret="01234567890123456789012345678901";
const totpCode=(secret:string,at=Date.now()):string=>{
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(at/30_000)));
 const digest=createHmac("sha1",base32Decode(secret)).update(counter).digest(),offset=digest[digest.length-1]&15;
 const binary=((digest[offset]&127)<<24)|((digest[offset+1]&255)<<16)|((digest[offset+2]&255)<<8)|(digest[offset+3]&255);
 return String(binary%1_000_000).padStart(6,"0");
};

test("platform admin requires enrolled and recent MFA and audits sensitive actions",{skip:!uri},async()=>{
 const dbName="bee_platform_test_"+Date.now(),client=new MongoClient(uri!);await client.connect();const db=client.db(dbName);
 const app=Fastify(),logger:BeeLogger={info(){},warn(){},error(){}};
 app.register(jwt,{secret:jwtSecret});
 const ctx:BeeContext={appName:"Platform test",version:"test",events:new BeeEventBus(),logger,server:app,config:{jwtSecret,mongoUri:uri!,mongoDbName:dbName,authAdminEmail:"platform@example.test",authAdminPassword:"Platform-test-12345",authMfaEncryptionKey:Buffer.alloc(32).toString("base64")}};
 try{
  await authPlugin.initialize?.(ctx);await organizationsPlugin.initialize?.(ctx);await platformAdminPlugin.initialize?.(ctx);await app.ready();
  const rootLogin=await app.inject({method:"POST",url:"/auth/login",payload:{email:"platform@example.test",password:"Platform-test-12345",client:"dashboard"}});
  assert.equal(rootLogin.statusCode,200);const rootTokens=rootLogin.json();assert.equal(rootTokens.platformRole,"superadmin");assert.equal(rootTokens.mfaSetupRequired,true);
  const rootHeaders={authorization:"Bearer "+rootTokens.accessToken};
  const deniedWithoutMfa=await app.inject({method:"GET",url:"/platform/me",headers:rootHeaders});
  assert.equal(deniedWithoutMfa.statusCode,403,"superadmin platform operations must be blocked until MFA is enrolled");
  const businessDenied=await app.inject({method:"GET",url:"/auth/me",headers:rootHeaders});
  assert.equal(businessDenied.statusCode,401,"superadmin must not use tenant/business routes before MFA enrollment");
  assert.ok(await db.collection("platform_audit_events").findOne({actorId:"bootstrap-admin",action:"security.mfa_required"}),"missing MFA denial must be audited");

  const setup=await app.inject({method:"POST",url:"/auth/mfa/setup",headers:rootHeaders});
  assert.equal(setup.statusCode,200);assert.ok(setup.json().secret);
  const enrolled=await app.inject({method:"POST",url:"/auth/mfa/confirm",headers:rootHeaders,payload:{code:totpCode(setup.json().secret)}});
  assert.equal(enrolled.statusCode,200);assert.equal(enrolled.json().success,true);
  assert.ok(await db.collection("tenant_audit_events").findOne({actorId:"bootstrap-admin",action:"auth.mfa.enrolled",outcome:"success"}),"MFA enrollment must be audited");

  const rootSession=await db.collection("refresh_sessions").findOne({userId:"bootstrap-admin",client:"dashboard",revokedAt:null});
  assert.ok(rootSession);
  await db.collection("refresh_sessions").updateOne({id:rootSession.id},{$set:{mfaVerifiedAt:new Date(Date.now()-16*60*1000)}});
  const staleMfa=await app.inject({method:"GET",url:"/platform/me",headers:rootHeaders});
  assert.equal(staleMfa.statusCode,403,"sensitive platform actions must require MFA verification within 15 minutes");
  assert.ok(await db.collection("platform_audit_events").findOne({actorId:"bootstrap-admin",action:"security.mfa_recent_required"}),"stale MFA denial must be audited");
  await db.collection("refresh_sessions").updateOne({id:rootSession.id},{$set:{mfaVerifiedAt:new Date()}});
  const platformMe=await app.inject({method:"GET",url:"/platform/me",headers:rootHeaders});assert.equal(platformMe.statusCode,200);assert.equal(platformMe.json().role,"superadmin");

  const created=await app.inject({method:"POST",url:"/platform/companies",headers:rootHeaders,payload:{name:"Acme Test",ownerEmail:"acme-owner@example.test",ownerPassword:"Acme-owner-Password-123"}});
  assert.equal(created.statusCode,201);const companyId=created.json().company.id as string;
  assert.ok(!/^[0-9a-f-]{36}$/i.test(companyId),"platform company IDs must be opaque session references");
  assert.ok(await db.collection("platform_audit_events").findOne({actorId:"bootstrap-admin",action:"company.created"}),"company creation must be audited");
  const list=await app.inject({method:"GET",url:"/platform/companies",headers:rootHeaders});assert.equal(list.statusCode,200);assert.ok(list.json().companies.some((c:any)=>c.id===companyId));
  const platformPlugins=await app.inject({method:"GET",url:"/platform/companies/"+encodeURIComponent(companyId)+"/plugins",headers:rootHeaders});
  assert.equal(platformPlugins.statusCode,200);
  assert.ok(!/^[0-9a-f-]{36}$/i.test(platformPlugins.json().tenantId));
  const rawCompany=await db.collection("tenants").findOne({slug:"acme-test"});
  assert.ok(rawCompany);
  const rawReferenceAttempt=await app.inject({method:"PATCH",url:"/platform/companies/"+rawCompany.id,headers:rootHeaders,payload:{status:"suspended"}});
  assert.equal(rawReferenceAttempt.statusCode,404,"raw database IDs must not be accepted by platform routes");
  const secondRootLogin=await app.inject({method:"POST",url:"/auth/login",payload:{email:"platform@example.test",password:"Platform-test-12345",client:"dashboard",mfaCode:totpCode(setup.json().secret,Date.now()+30_000)}});
  assert.equal(secondRootLogin.statusCode,200);
  const secondSessionAttempt=await app.inject({method:"PATCH",url:"/platform/companies/"+encodeURIComponent(companyId),headers:{authorization:"Bearer "+secondRootLogin.json().accessToken},payload:{status:"suspended"}});
  assert.equal(secondSessionAttempt.statusCode,404,"platform references must not resolve in another session");
  const suspended=await app.inject({method:"PATCH",url:"/platform/companies/"+encodeURIComponent(companyId),headers:rootHeaders,payload:{status:"suspended"}});assert.equal(suspended.statusCode,200);assert.equal(suspended.json().status,"suspended");
  const activated=await app.inject({method:"PATCH",url:"/platform/companies/"+encodeURIComponent(companyId),headers:rootHeaders,payload:{status:"active"}});assert.equal(activated.statusCode,200);
  assert.ok(await db.collection("platform_audit_events").findOne({actorId:"bootstrap-admin",action:"company.status_changed",metadata:{status:"suspended"}}),"sensitive company status changes must be audited");
  const tenantLogin=await app.inject({method:"POST",url:"/auth/login",payload:{email:"acme-owner@example.test",password:"Acme-owner-Password-123",client:"dashboard"}});assert.equal(tenantLogin.statusCode,200);
  const tenantHeaders={authorization:"Bearer "+tenantLogin.json().accessToken};
  const forbidden=await app.inject({method:"GET",url:"/platform/companies",headers:tenantHeaders});assert.equal(forbidden.statusCode,403,"company owners must not access global platform endpoints");
 }finally{await app.close().catch(()=>{});await client.db(dbName).dropDatabase();await client.close();}
});
