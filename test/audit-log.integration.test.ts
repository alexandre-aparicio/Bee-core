import { test } from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { appendTenantAuditEvent, dispatchTenantAuditOutbox, ensureTenantAuditIndexes, ensureTenantAuditOutboxIndexes, prepareTenantAuditOutboxEvent, type TenantAuditEvent, type TenantAuditOutboxRecord } from "../src/core/audit-log.js";
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


test("plugin.uninstalled audit intent survives a worker crash after the durable job succeeds", { skip: !uri }, async () => {
  const dbName = "bee_audit_outbox_uninstall_" + Date.now();
  const client = new MongoClient(uri!);
  await client.connect();
  const db = client.db(dbName);
  const audit = db.collection<TenantAuditEvent>("tenant_audit_events");
  const outbox = db.collection<TenantAuditOutboxRecord>("tenant_audit_outbox");
  try {
    await ensureTenantAuditIndexes(audit);
    await ensureTenantAuditOutboxIndexes(outbox);
    await db.collection("plugin_install_jobs").insertOne({
      id: "uninstall-job-crash-recovery",
      tenantId: "tenant-a",
      pluginId: "workspace",
      actorId: "owner-a",
      action: "uninstall",
      status: "running"
    });
    const event = await prepareTenantAuditOutboxEvent(outbox, {
      tenantId: "tenant-a",
      actorId: "owner-a",
      action: "plugin.uninstalled",
      outcome: "success",
      resourceType: "plugin",
      resourceId: "workspace",
      metadata: { version: "0.1.0", jobId: "uninstall-job-crash-recovery" },
      idempotencyKey: "plugin.uninstalled:uninstall-job-crash-recovery"
    });

    await dispatchTenantAuditOutbox(db);
    assert.equal(await audit.countDocuments({ id: event.id }), 0, "an in-flight uninstall must not be audited as completed");

    await db.collection("plugin_install_jobs").updateOne(
      { id: "uninstall-job-crash-recovery" },
      { $set: { status: "succeeded" } }
    );
    // Simulate process termination after job success but before outbox commit/delivery.
    await dispatchTenantAuditOutbox(db);
    await dispatchTenantAuditOutbox(db);

    assert.equal(await audit.countDocuments({ tenantId: "tenant-a", id: event.id, action: "plugin.uninstalled" }), 1);
    assert.equal((await outbox.findOne({ id: event.id }))?.status, "delivered");
  } finally {
    await db.dropDatabase();
    await client.close();
  }
});
