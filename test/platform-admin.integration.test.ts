import {test} from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import {MongoClient} from "mongodb";
import bcrypt from "bcryptjs";
import {createHmac} from "node:crypto";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {base32Decode} from "../src/core/totp.js";
import {maskResourceId} from "../src/core/session-id.js";
import {registerRuntimePlugin,unregisterRuntimePlugin} from "../src/core/runtime-plugin-registry.js";
import {authPlugin} from "../src/plugins/auth/auth.plugin.js";
import {organizationsPlugin} from "../src/plugins/organizations/organizations.plugin.js";
import {marketplacePlugin} from "../src/plugins/marketplace/marketplace.plugin.js";
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
 const dbName="bee_platform_test_"+Date.now(),client=new MongoClient(uri!);await client.connect();const db=client.db(dbName);const pluginPackagePath=await mkdtemp(join(tmpdir(),"bee-platform-packages-"));
 const app=Fastify(),logger:BeeLogger={info(){},warn(){},error(){}};
 app.register(jwt,{secret:jwtSecret});
 const ctx:BeeContext={appName:"Platform test",version:"test",events:new BeeEventBus(),logger,server:app,mongoClient:client,config:{jwtSecret,mongoUri:uri!,mongoDbName:dbName,pluginPackagePath,authAdminEmail:"platform@example.test",authAdminPassword:"Platform-test-12345",authMfaEncryptionKey:Buffer.alloc(32).toString("base64")}};
 try{
  await authPlugin.initialize?.(ctx);await organizationsPlugin.initialize?.(ctx);await marketplacePlugin.initialize?.(ctx);await platformAdminPlugin.initialize?.(ctx);await app.ready();
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
  const platformMe=await app.inject({method:"GET",url:"/platform/me",headers:rootHeaders});assert.equal(platformMe.statusCode,200);assert.equal(platformMe.json().role,"super_admin");

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
  await db.collection("platform_plugin_packages").insertOne({pluginId:"hello-world",name:"Hola Mundo",version:"0.1.0",description:"External test package",category:"test",dependencies:[],status:"installed",source:"zip",runtimeState:"loaded",createdAt:new Date(),updatedAt:new Date()});
  await db.collection("plugin_catalog").insertOne({id:"hello-world",name:"Hola Mundo",version:"0.1.0",description:"External test package",category:"test",dependencies:[],status:"published",codeAvailable:true});
  await db.collection("tenant_plugin_installations").insertOne({id:"hello-world-install",tenantId:rawCompany.id,pluginId:"hello-world",version:"0.1.0",status:"installed",enabled:true});
  await db.collection("tenant_plugin_data").insertOne({tenantId:rawCompany.id,pluginId:"hello-world",value:"keep-me"});
  const packageList=await app.inject({method:"GET",url:"/platform/plugin-packages",headers:rootHeaders});
  assert.equal(packageList.statusCode,200);
  const helloWorldPackage=packageList.json().packages.find((item:any)=>item.pluginKey==="hello-world");
  assert.ok(helloWorldPackage?.id,"platform package routes must use opaque resource references");
  const packageUsage=await app.inject({method:"GET",url:"/platform/plugin-packages/"+encodeURIComponent(helloWorldPackage.id)+"/tenants",headers:rootHeaders});
  assert.equal(packageUsage.statusCode,200);assert.equal(packageUsage.json().installedCount,1);assert.equal(packageUsage.json().canRemove,false);
  assert.equal(packageUsage.json().tenants[0].name,"Acme Test");
  const blockedPackageRemoval=await app.inject({method:"DELETE",url:"/platform/plugin-packages/"+encodeURIComponent(helloWorldPackage.id),headers:rootHeaders});
  assert.equal(blockedPackageRemoval.statusCode,409,"global package removal must be blocked while a tenant still has it installed");
  assert.ok(await db.collection("platform_plugin_packages").findOne({pluginId:"hello-world",status:"installed"}),"blocked removal must leave the global package intact");
  await db.collection("tenant_plugin_installations").updateOne({tenantId:rawCompany.id,pluginId:"hello-world"},{$set:{enabled:false}});
  const deactivatedPackageUsage=await app.inject({method:"GET",url:"/platform/plugin-packages/"+encodeURIComponent(helloWorldPackage.id)+"/tenants",headers:rootHeaders});
  assert.equal(deactivatedPackageUsage.statusCode,200);
  assert.equal(deactivatedPackageUsage.json().installedCount,0);
  assert.equal(deactivatedPackageUsage.json().inactiveCount,1);
  assert.equal(deactivatedPackageUsage.json().canRemove,true);
  const safePackageRemoval=await app.inject({method:"DELETE",url:"/platform/plugin-packages/"+encodeURIComponent(helloWorldPackage.id),headers:rootHeaders});
  assert.equal(safePackageRemoval.statusCode,200);assert.equal(safePackageRemoval.json().tenantDataPreserved,true);
  assert.equal(await db.collection("platform_plugin_packages").findOne({pluginId:"hello-world"}),null);
  assert.ok(await db.collection("tenant_plugin_data").findOne({tenantId:rawCompany.id,value:"keep-me"}),"global package removal must preserve tenant-owned data");
  assert.equal((await db.collection("tenant_plugin_installations").findOne({tenantId:rawCompany.id,pluginId:"hello-world"}))?.status,"uninstalled");
  assert.equal((await db.collection("plugin_catalog").findOne({id:"hello-world"}))?.status,"deprecated");
  const superOrganization=await db.collection("tenants").findOne({kind:"super"});
  assert.ok(superOrganization,"platform installation must be owned by the Super Organization");

  // A signed ZIP is intentionally catalogued with codeAvailable=false. It must
  // still be discoverable and activatable when its global runtime is mounted.
  const zipRuntimePlugin={manifest:{name:"zip-only-test",version:"0.1.0",description:"Signed ZIP regression fixture",dependencies:[]}} as any;
  const failedRuntimePlugin={manifest:{name:"zip-failed-test",version:"0.1.0",description:"Failed ZIP regression fixture",dependencies:[]}} as any;
  registerRuntimePlugin(zipRuntimePlugin);
  registerRuntimePlugin(failedRuntimePlugin);
  await db.collection("platform_plugin_packages").insertMany([
   {pluginId:"zip-only-test",name:"ZIP Only Test",version:"0.1.0",description:"Signed ZIP regression fixture",category:"test",dependencies:[],status:"installed",source:"zip",runtimeState:"loaded",createdAt:new Date(),updatedAt:new Date()},
   {pluginId:"zip-failed-test",name:"ZIP Failed Test",version:"0.1.0",description:"Failed ZIP regression fixture",category:"test",dependencies:[],status:"installed",source:"zip",runtimeState:"failed",createdAt:new Date(),updatedAt:new Date()}
  ]);
  await db.collection("plugin_catalog").insertMany([
   {id:"zip-only-test",name:"ZIP Only Test",version:"0.1.0",description:"Signed ZIP regression fixture",category:"test",dependencies:[],status:"published",codeAvailable:false},
   {id:"zip-failed-test",name:"ZIP Failed Test",version:"0.1.0",description:"Failed ZIP regression fixture",category:"test",dependencies:[],status:"published",codeAvailable:false}
  ]);
  const sessionContext={sessionId:rootSession.id,expiresAt:rootSession.expiresAt};
  const superOrganizationRef=maskResourceId(superOrganization.id,"tenant",sessionContext,jwtSecret);
  const zipPluginRef=maskResourceId("zip-only-test","plugin",sessionContext,jwtSecret);
  const failedPluginRef=maskResourceId("zip-failed-test","plugin",sessionContext,jwtSecret);
  const superPlugins=await app.inject({method:"GET",url:"/platform/companies/"+encodeURIComponent(superOrganizationRef)+"/plugins",headers:rootHeaders});
  assert.equal(superPlugins.statusCode,200);
  const zipRow=superPlugins.json().plugins.find((plugin:any)=>plugin.pluginKey==="zip-only-test");
  assert.ok(zipRow?.installed&&!zipRow.enabled,"a loaded signed ZIP must be listed as installed and initially disabled in Super Organization");
  assert.equal(superPlugins.json().plugins.find((plugin:any)=>plugin.pluginKey==="zip-failed-test"),undefined,"a ZIP whose runtime failed must not be listed as activatable");
  const activateZip=await app.inject({method:"PUT",url:"/platform/companies/"+encodeURIComponent(superOrganizationRef)+"/plugins/"+encodeURIComponent(zipPluginRef),headers:rootHeaders,payload:{enabled:true}});
  assert.equal(activateZip.statusCode,200,"Super Organization must activate a loaded signed ZIP without requiring codeAvailable=true");
  assert.equal(activateZip.json().enabled,true);
  assert.ok(await db.collection("tenant_plugin_installations").findOne({tenantId:superOrganization.id,pluginId:"zip-only-test",status:"installed",enabled:true}));
  const activateFailedZip=await app.inject({method:"PUT",url:"/platform/companies/"+encodeURIComponent(superOrganizationRef)+"/plugins/"+encodeURIComponent(failedPluginRef),headers:rootHeaders,payload:{enabled:true}});
  assert.equal(activateFailedZip.statusCode,404,"a ZIP with a failed runtime must not be activatable");
  const helloWorld=platformPlugins.json().plugins.find((plugin:any)=>plugin.name==="Hola Mundo");
  assert.equal(helloWorld,undefined,"Hello Mundo must not be exposed as a bundled platform plugin; it is available only after a signed ZIP upload");
  const pluginRows=platformPlugins.json().plugins as Array<{id:string;name:string;installed:boolean;enabled:boolean;system:boolean}>;
  const documentsPlugin=pluginRows.find(plugin=>plugin.name==="Documents")!;
  const filesPlugin=pluginRows.find(plugin=>plugin.name==="Private Files")!;
  assert.ok(documentsPlugin.installed&&documentsPlugin.enabled,"new tenants should start with Documents enabled");
  assert.ok(filesPlugin.installed&&filesPlugin.enabled,"new tenants should start with Files enabled");
  const disableFilesWhileDocumentsActive=await app.inject({method:"PUT",url:"/platform/companies/"+encodeURIComponent(companyId)+"/plugins/"+encodeURIComponent(filesPlugin.id),headers:rootHeaders,payload:{enabled:false}});
  assert.equal(disableFilesWhileDocumentsActive.statusCode,409,"Files cannot be disabled while Documents depends on it");
  const disableDocuments=await app.inject({method:"PUT",url:"/platform/companies/"+encodeURIComponent(companyId)+"/plugins/"+encodeURIComponent(documentsPlugin.id),headers:rootHeaders,payload:{enabled:false}});
  assert.equal(disableDocuments.statusCode,200);assert.equal(disableDocuments.json().enabled,false);
  const storedDocuments=await db.collection("tenant_plugin_installations").findOne({tenantId:rawCompany.id,pluginId:"documents"});
  assert.equal(storedDocuments?.status,"installed","deactivation must not uninstall the plugin");
  assert.equal(storedDocuments?.enabled,false,"deactivation must persist independently of installation");
  const activateDocuments=await app.inject({method:"PUT",url:"/platform/companies/"+encodeURIComponent(companyId)+"/plugins/"+encodeURIComponent(documentsPlugin.id),headers:rootHeaders,payload:{enabled:true}});
  assert.equal(activateDocuments.statusCode,200);assert.equal(activateDocuments.json().enabled,true);
  assert.ok(await db.collection("platform_audit_events").findOne({actorId:"bootstrap-admin",action:"plugin.disabled",resourceId:"documents"}),"plugin deactivation must be audited");
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
 }finally{unregisterRuntimePlugin("zip-only-test");unregisterRuntimePlugin("zip-failed-test");await marketplacePlugin.stop?.();await app.close().catch(()=>{});await client.db(dbName).dropDatabase();await rm(pluginPackagePath,{recursive:true,force:true});await client.close();}
});
