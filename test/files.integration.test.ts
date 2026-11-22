import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { authPlugin } from "../src/plugins/auth/auth.plugin.js";
import { organizationsPlugin } from "../src/plugins/organizations/organizations.plugin.js";
import { filesPlugin } from "../src/plugins/files/files.plugin.js";
import { BeeEventBus } from "../src/core/event-bus.js";
import type { BeeContext, BeeLogger } from "../src/core/types.js";

const uri = process.env.MONGODB_TEST_URI;

test("private files and images are isolated by active company", { skip: !uri }, async () => {
  const dbName = "bee_files_test_" + Date.now();
  const storagePath = await mkdtemp(join(tmpdir(), "bee-files-test-"));
  const client = new MongoClient(uri!);
  await client.connect();
  const db = client.db(dbName);
  const passwordHash = await bcrypt.hash("Test-password-12345", 10);
  await db.collection("tenants").insertMany([
    { id: "files-alpha", name: "Files Alpha", createdAt: new Date(), status: "active" },
    { id: "files-beta", name: "Files Beta", createdAt: new Date(), status: "active" }
  ]);
  await db.collection("users").insertMany([
    { id: "files-owner-alpha", email: "files-alpha@example.test", passwordHash, roles: ["user"], enabled: true, allowedClients: ["dashboard","public"], tenantId: "files-alpha", createdAt: new Date(), updatedAt: new Date() },
    { id: "files-manager-beta", email: "files-beta@example.test", passwordHash, roles: ["user"], enabled: true, allowedClients: ["dashboard"], tenantId: "files-beta", createdAt: new Date(), updatedAt: new Date() },
    { id: "files-member-beta", email: "files-member@example.test", passwordHash, roles: ["user"], enabled: true, allowedClients: ["dashboard"], tenantId: "files-beta", createdAt: new Date(), updatedAt: new Date() }
  ]);
  await db.collection("memberships").insertMany([
    { id: "files-membership-alpha", userId: "files-owner-alpha", tenantId: "files-alpha", role: "owner", status: "active", createdAt: new Date(), updatedAt: new Date() },
    { id: "files-membership-beta-manager", userId: "files-manager-beta", tenantId: "files-beta", role: "manager", status: "active", createdAt: new Date(), updatedAt: new Date() },
    { id: "files-membership-beta-member", userId: "files-member-beta", tenantId: "files-beta", role: "member", status: "active", createdAt: new Date(), updatedAt: new Date() }
  ]);

  const app = Fastify();
  const logger: BeeLogger = { info(){}, warn(){}, error(){} };
  const ctx: BeeContext = {
    appName: "Bee files test",
    version: "test",
    events: new BeeEventBus(),
    logger,
    server: app,
    mongoClient: client,
    config: {
      jwtSecret: "01234567890123456789012345678901",
      mongoUri: uri!,
      mongoDbName: dbName,
      authAdminEmail: "",
      authAdminPassword: "",
      fileStoragePath: storagePath
    }
  };

  try {
    await authPlugin.initialize?.(ctx);
    await organizationsPlugin.initialize?.(ctx);
    await filesPlugin.initialize?.(ctx);
    await app.ready();

    const login = async (email: string) => {
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email, password: "Test-password-12345", client: "dashboard" }
      });
      assert.equal(response.statusCode, 200);
      return response.json().accessToken as string;
    };
    const alphaToken = await login("files-alpha@example.test");
    const alphaSecondSessionToken = await login("files-alpha@example.test");
    const publicLogin=await app.inject({method:"POST",url:"/auth/login",payload:{email:"files-alpha@example.test",password:"Test-password-12345",client:"public"}});
    assert.equal(publicLogin.statusCode,200);
    const publicFileList=await app.inject({method:"GET",url:"/files",headers:{authorization:"Bearer "+publicLogin.json().accessToken}});
    assert.equal(publicFileList.statusCode,403,"public-client tokens must not access private file management");
    const betaManagerToken = await login("files-beta@example.test");
    const betaMemberToken = await login("files-member@example.test");
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);

    const alphaUpload = await app.inject({
      method: "POST",
      url: "/files",
      headers: {
        authorization: "Bearer " + alphaToken,
        "content-type": "application/octet-stream",
        "x-file-content-type": "image/png",
        "x-file-name": "../../private-alpha.png"
      },
      payload: png
    });
    assert.equal(alphaUpload.statusCode, 201);
    const alphaFileId = alphaUpload.json().file.id as string;
    assert.ok(!/^[0-9a-f-]{36}$/i.test(alphaFileId), "file IDs returned to clients must be opaque references");
    assert.equal(alphaUpload.json().file.name, "private-alpha.png");

    const betaUpload = await app.inject({
      method: "POST",
      url: "/files",
      headers: {
        authorization: "Bearer " + betaManagerToken,
        "content-type": "application/octet-stream",
        "x-file-content-type": "image/png",
        "x-file-name": "beta.png"
      },
      payload: png
    });
    assert.equal(betaUpload.statusCode, 201);
    const betaFileId = betaUpload.json().file.id as string;
    assert.notEqual(alphaFileId, betaFileId);

    const alphaList = await app.inject({ method: "GET", url: "/files", headers: { authorization: "Bearer " + alphaToken } });
    const betaList = await app.inject({ method: "GET", url: "/files", headers: { authorization: "Bearer " + betaMemberToken } });
    assert.deepEqual(alphaList.json().files.map((file: { id: string }) => [file.id]), [[alphaFileId]]);
    assert.deepEqual(betaList.json().files.map((file: { id: string }) => [file.id]), [[betaFileId]]);

    const crossSessionRead = await app.inject({ method: "GET", url: "/files/" + alphaFileId, headers: { authorization: "Bearer " + alphaSecondSessionToken } });
    assert.equal(crossSessionRead.statusCode, 404, "a file reference must not resolve in another session of the same user");
    const crossRead = await app.inject({ method: "GET", url: "/files/" + alphaFileId, headers: { authorization: "Bearer " + betaManagerToken } });
    assert.equal(crossRead.statusCode, 404);
    const crossDelete = await app.inject({ method: "DELETE", url: "/files/" + alphaFileId, headers: { authorization: "Bearer " + betaManagerToken } });
    assert.equal(crossDelete.statusCode, 404);

    const alphaDownload = await app.inject({ method: "GET", url: "/files/" + alphaFileId, headers: { authorization: "Bearer " + alphaToken } });
    assert.equal(alphaDownload.statusCode, 200);
    assert.equal(alphaDownload.headers["content-type"], "image/png");
    assert.ok(alphaDownload.rawPayload.equals(png));

    const memberWrite = await app.inject({
      method: "POST",
      url: "/files",
      headers: {
        authorization: "Bearer " + betaMemberToken,
        "content-type": "application/octet-stream",
        "x-file-content-type": "image/png",
        "x-file-name": "denied.png"
      },
      payload: png
    });
    assert.equal(memberWrite.statusCode, 403);

    const unsupported = await app.inject({
      method: "POST",
      url: "/files",
      headers: {
        authorization: "Bearer " + alphaToken,
        "content-type": "application/octet-stream",
        "x-file-content-type": "text/html",
        "x-file-name": "unsafe.html"
      },
      payload: Buffer.from("<script>alert(1)</script>")
    });
    assert.equal(unsupported.statusCode, 415);
    const spoofedImage = await app.inject({
      method: "POST",
      url: "/files",
      headers: {
        authorization: "Bearer " + alphaToken,
        "content-type": "application/octet-stream",
        "x-file-content-type": "image/png",
        "x-file-name": "spoofed.png"
      },
      payload: Buffer.from("<script>not an image</script>")
    });
    assert.equal(spoofedImage.statusCode, 400);
    await db.collection("plugin_plans").updateOne({ id: "starter" }, { $set: { storageMb: 0 } });
    const overCompanyQuota = await app.inject({
      method: "POST",
      url: "/files",
      headers: {
        authorization: "Bearer " + alphaToken,
        "content-type": "application/octet-stream",
        "x-file-content-type": "text/plain",
        "x-file-name": "over-quota.txt"
      },
      payload: Buffer.from("over quota")
    });
    assert.equal(overCompanyQuota.statusCode, 413);
    assert.equal(overCompanyQuota.json().error, "Company storage quota exceeded");

  } finally {
    await app.close();
    await filesPlugin.stop?.(ctx);
    await organizationsPlugin.stop?.(ctx);
    await client.db(dbName).dropDatabase();
    await client.close();
    await rm(storagePath, { recursive: true, force: true });
  }
});
