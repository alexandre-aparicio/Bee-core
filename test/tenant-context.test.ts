import { test } from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { hasTenantPermission, resolveTenantContext, type TenantClaims } from "../src/core/tenant-context.js";

const uri = process.env.MONGODB_TEST_URI;

test("tenant context requires a valid session, active membership and company", { skip: !uri }, async () => {
  const dbName = "bee_tenant_context_" + Date.now();
  const client = new MongoClient(uri!);
  await client.connect();
  const db = client.db(dbName);
  const claims: TenantClaims = {
    sub: "user-one",
    email: "forged@example.test",
    tenantId: "company-one",
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
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null
    });

    const context = await resolveTenantContext(db, claims);
    assert.ok(context);
    assert.equal(context.userId, "user-one");
    assert.equal(context.email, "real@example.test");
    assert.equal(context.tenantId, "company-one");
    assert.equal(context.role, "manager");
    assert.ok(hasTenantPermission(context, "files.read"));
    assert.equal(hasTenantPermission(context, "members.manage"), false);

    assert.equal(await resolveTenantContext(db, { ...claims, tenantId: "company-two" }), null);
    assert.equal(await resolveTenantContext(db, { ...claims, sid: "unknown-session" }), null);
    assert.equal(await resolveTenantContext(db, { ...claims, client: "public" }), null);

    await db.collection("memberships").updateOne({ id: "membership-one" }, { $set: { status: "suspended" } });
    assert.equal(await resolveTenantContext(db, claims), null);
    await db.collection("memberships").updateOne({ id: "membership-one" }, { $set: { status: "active" } });

    await db.collection("tenants").updateOne({ id: "company-one" }, { $set: { status: "suspended" } });
    assert.equal(await resolveTenantContext(db, claims), null);
    const allowSuspended = await resolveTenantContext(db, claims, { allowSuspendedCompany: true });
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
