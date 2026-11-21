import { test } from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { hasTenantPermission, resolveTenantContext, type TenantClaims } from "../src/core/tenant-context.js";
import { maskTenantId, maskUserId } from "../src/core/session-id.js";

const uri = process.env.MONGODB_TEST_URI;

test("tenant context requires a valid session, active membership and company", { skip: !uri }, async () => {
  const dbName = "bee_tenant_context_" + Date.now();
  const client = new MongoClient(uri!);
  await client.connect();
  const db = client.db(dbName);
  const secret = "tenant-context-test-secret-with-at-least-32-characters";
  const expiresAt = new Date(Date.now() + 60_000);
  const sessionContext = { sessionId: "session-one", expiresAt };
  const claims: TenantClaims = {
    sub: maskUserId("user-one", sessionContext, secret),
    email: "forged@example.test",
    tenantId: maskTenantId("company-one", sessionContext, secret),
    sid: "session-one",
    client: "dashboard",
    aud: "bee-core"
  };
  try {
    await db.collection("users").insertOne({
      id: "user-one",
      email: "real@example.test",
      enabled: true,
      allowedClients: ["dashboard"]
    });
    await db.collection("tenants").insertOne({ id: "company-one", name: "Company One", status: "active" });
    await db.collection("memberships").insertOne({
      id: "membership-one",
      userId: "user-one",
      tenantId: "company-one",
      role: "manager",
      status: "active"
    });
    await db.collection("refresh_sessions").insertOne({
      id: "session-one",
      userId: "user-one",
      tenantId: "company-one",
      client: "dashboard",
      tokenHash: "hashed-refresh-token",
      expiresAt,
      revokedAt: null
    });

    const context = await resolveTenantContext(db, claims, {}, secret);
    assert.ok(context);
    assert.equal(context.userId, "user-one");
    assert.equal(context.email, "real@example.test");
    assert.equal(context.tenantId, "company-one");
    assert.equal(context.role, "manager");
    assert.ok(hasTenantPermission(context, "files.read"));
    assert.equal(hasTenantPermission(context, "members.manage"), false);

    await db.collection("company_roles").insertOne({
      id: "role-reader",
      tenantId: "company-one",
      name: "Reader",
      permissions: ["notes.read", "files.read"],
      createdBy: "user-one",
      updatedBy: "user-one",
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await db.collection("memberships").updateOne({ id: "membership-one" }, { $set: { role: "custom", customRoleId: "role-reader" } });
    const customContext = await resolveTenantContext(db, claims, {}, secret);
    assert.ok(customContext);
    assert.equal(customContext.role, "custom");
    assert.equal(customContext.customRoleId, "role-reader");
    assert.ok(hasTenantPermission(customContext, "notes.read"));
    assert.equal(hasTenantPermission(customContext, "notes.write"), false);
    await db.collection("memberships").updateOne({ id: "membership-one" }, { $set: { role: "manager" }, $unset: { customRoleId: "" } });

    assert.equal(await resolveTenantContext(db, { ...claims, tenantId: "company-two" }, {}, secret), null);
    assert.equal(await resolveTenantContext(db, { ...claims, sid: "unknown-session" }, {}, secret), null);
    assert.equal(await resolveTenantContext(db, { ...claims, client: "public" }, {}, secret), null);

    await db.collection("memberships").updateOne({ id: "membership-one" }, { $set: { status: "suspended" } });
    assert.equal(await resolveTenantContext(db, claims, {}, secret), null);
    await db.collection("memberships").updateOne({ id: "membership-one" }, { $set: { status: "active" } });

    await db.collection("tenants").updateOne({ id: "company-one" }, { $set: { status: "suspended" } });
    assert.equal(await resolveTenantContext(db, claims, {}, secret), null);
    const allowSuspended = await resolveTenantContext(db, claims, { allowSuspendedCompany: true }, secret);
    assert.ok(allowSuspended);
  } finally {
    await client.db(dbName).dropDatabase();
    await client.close();
  }
});

test("tenant context rejects malformed claims", async () => {
  const fakeDb = {} as never;
  assert.equal(await resolveTenantContext(fakeDb, {}), null);
});
