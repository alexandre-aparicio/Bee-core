import {test} from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import {MongoClient} from "mongodb";
import bcrypt from "bcryptjs";
import {authPlugin} from "../src/plugins/auth/auth.plugin.js";
import {organizationsPlugin} from "../src/plugins/organizations/organizations.plugin.js";
import {platformAdminPlugin} from "../src/plugins/platform-admin/platform-admin.plugin.js";
import {BeeEventBus} from "../src/core/event-bus.js";
import type {BeeContext,BeeLogger} from "../src/core/types.js";
const uri=process.env.MONGODB_TEST_URI;
test("platform admin integration: bootstrap superadmin, company lifecycle and tenant boundary",{skip:!uri},async()=>{
 const dbName="bee_platform_test_"+Date.now(),client=new MongoClient(uri!);await client.connect();const db=client.db(dbName);
 const app=Fastify(),logger:BeeLogger={info(){},warn(){},error(){}};
 const ctx:BeeContext={appName:"Platform test",version:"test",events:new BeeEventBus(),logger,server:app,config:{jwtSecret:"01234567890123456789012345678901",mongoUri:uri!,mongoDbName:dbName,authAdminEmail:"platform@example.test",authAdminPassword:"Platform-test-12345"}};
 try{
  await authPlugin.initialize?.(ctx);await organizationsPlugin.initialize?.(ctx);await platformAdminPlugin.initialize?.(ctx);await app.ready();
  const rootLogin=await app.inject({method:"POST",url:"/auth/login",payload:{email:"platform@example.test",password:"Platform-test-12345",client:"dashboard"}});
  assert.equal(rootLogin.statusCode,200);const rootTokens=rootLogin.json();assert.equal(rootTokens.platformRole,"superadmin");
  const rootHeaders={authorization:"Bearer "+rootTokens.accessToken};
  const platformMe=await app.inject({method:"GET",url:"/platform/me",headers:rootHeaders});assert.equal(platformMe.statusCode,200);assert.equal(platformMe.json().role,"superadmin");
  const created=await app.inject({method:"POST",url:"/platform/companies",headers:rootHeaders,payload:{name:"Acme Test",ownerEmail:"acme-owner@example.test",ownerPassword:"Acme-owner-Password-123"}});
  assert.equal(created.statusCode,201);const companyId=created.json().company.id;
  const list=await app.inject({method:"GET",url:"/platform/companies",headers:rootHeaders});assert.equal(list.statusCode,200);assert.ok(list.json().companies.some((c:any)=>c.id===companyId));
  const suspended=await app.inject({method:"PATCH",url:"/platform/companies/"+companyId,headers:rootHeaders,payload:{status:"suspended"}});assert.equal(suspended.statusCode,200);assert.equal(suspended.json().status,"suspended");
  const activated=await app.inject({method:"PATCH",url:"/platform/companies/"+companyId,headers:rootHeaders,payload:{status:"active"}});assert.equal(activated.statusCode,200);
  const tenantLogin=await app.inject({method:"POST",url:"/auth/login",payload:{email:"acme-owner@example.test",password:"Acme-owner-Password-123",client:"dashboard"}});assert.equal(tenantLogin.statusCode,200);
  const tenantHeaders={authorization:"Bearer "+tenantLogin.json().accessToken};
  const forbidden=await app.inject({method:"GET",url:"/platform/companies",headers:tenantHeaders});assert.equal(forbidden.statusCode,403,"company owners must not access global platform endpoints");
 }finally{await app.close().catch(()=>{});await client.db(dbName).dropDatabase();await client.close();}
});
