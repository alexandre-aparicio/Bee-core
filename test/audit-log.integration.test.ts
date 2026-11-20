import { test } from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { appendTenantAuditEvent, ensureTenantAuditIndexes, type TenantAuditEvent } from "../src/core/audit-log.js";
import { TenantCollection } from "../src/core/tenant-collection.js";

const uri = process.env.MONGODB_TEST_URI;

test("audit events are tenant stamped and query scoped; invalid metadata is rejected", { skip: !uri }, async () => {
  const dbName = "bee_audit_test_" + Date.now();
  const client = new MongoClient(uri!);
  await client.connect();
  const db = client.db(dbName);
  const raw = db.collection<TenantAuditEvent>("tenant_audit_events");
  const event = {
    id: "audit-alpha-1",
    actorId: "actor-alpha",
    action: "auth.login" as const,
    outcome: "success" as const,
    metadata: { client: "dashboard", attempt: 1 },
    occurredAt: new Date()
  };
  try {
    await ensureTenantAuditIndexes(raw);
    await appendTenantAuditEvent(raw, { ...event, tenantId: "alpha" });
    await appendTenantAuditEvent(raw, { ...event, id: "audit-beta-1", actorId: "actor-beta", tenantId: "beta" });

    const alpha = new TenantCollection(raw, "alpha");
    const beta = new TenantCollection(raw, "beta");
    assert.equal((await alpha.findOne({ id: "audit-alpha-1" }))?.tenantId, "alpha");
    assert.equal(await alpha.findOne({ id: "audit-beta-1" }), null);
    assert.equal((await beta.findOne({ id: "audit-beta-1" }))?.tenantId, "beta");
    assert.equal(await beta.findOne({ id: "audit-alpha-1" }), null);
    assert.equal((await raw.findOne({ id: "audit-alpha-1" }))?.tenantId, "alpha");

    await assert.rejects(
      appendTenantAuditEvent(raw, { ...event, id: "invalid-key", tenantId: "alpha", metadata: { "bad key": "x" } }),
      /Invalid audit metadata key/
    );
    await assert.rejects(
      appendTenantAuditEvent(raw, { ...event, id: "long-value", tenantId: "alpha", metadata: { detail: "x".repeat(257) } }),
      /Audit metadata value too long/
    );
    await assert.rejects(
      appendTenantAuditEvent(raw, { ...event, id: "too-many", tenantId: "alpha", metadata: Object.fromEntries(Array.from({ length: 21 }, (_, i) => ["key" + i, i])) }),
      /Audit metadata entry limit exceeded/
    );
    assert.equal(await raw.countDocuments({ id: { $in: ["invalid-key", "long-value", "too-many"] } }), 0);
  } finally {
    await client.db(dbName).dropDatabase();
    await client.close();
  }
});
