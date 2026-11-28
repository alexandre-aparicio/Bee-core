import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { MongoClient } from "mongodb";
import { BeeEventBus } from "../src/core/event-bus.js";
import { connectedDevicesPlugin } from "../src/plugins/connected-devices/connected-devices.plugin.js";
import { createDeviceCredential } from "../src/plugins/connected-devices/connected-devices.service.js";

const uri = process.env.MONGODB_TEST_URI;

async function withPluginFixture(
  membership: { status: "active" | "suspended"; deviceRevocationPending: boolean },
  run: (fixture: any) => Promise<void>
): Promise<void> {
  const client = new MongoClient(uri!);
  await client.connect();
  const db = client.db("bee_connected_device_membership_" + randomUUID());
  const app = Fastify();
  const rootEvents = new BeeEventBus();
  const access = {
    resolveTenantContext: async () => null,
    isPluginAvailable: async () => true,
    isTenantUserActive: async (tenantId: string, userId: string) =>
      Boolean(await db.collection("memberships").findOne({ tenantId, userId, status: "active" })),
    getTenantConnectorPermissions: async () => [],
    getTenantPluginPermissions: async () => [],
    getTenantUserSummaries: async () => []
  };
  const credential = createDeviceCredential();
  const now = new Date();
  await db.collection("memberships").insertOne({
    id: "membership-a", tenantId: "tenant-a", userId: "member-a", role: "member",
    status: membership.status, deviceRevocationPending: membership.deviceRevocationPending, updatedAt: now
  });
  await db.collection("connected_devices").insertOne({
    id: "device-a", tenantId: "tenant-a", ownerUserId: "member-a", requestedBy: "member-a",
    pairingChallengeId: "challenge-a", name: "Member device", deviceType: "mobile", platform: "android",
    appVersion: null, requestedCapabilities: [], grantedCapabilities: ["time-tracking-connected.clock-in"],
    credentialId: credential.credentialId, credentialHash: credential.credentialHash,
    status: "active", pairingExpiresAt: new Date(now.getTime() + 60_000), createdAt: now, updatedAt: now,
    approvedAt: now, approvedBy: "owner-a", revokedAt: null, revokedBy: null, lastSeenAt: null
  });
  const ctx: any = {
    mongoClient: client,
    config: { mongoDbName: db.databaseName, sessionIdSecret: "connected-device-membership-test-secret-0123456789" },
    services: { get: () => access },
    events: rootEvents.forPlugin("connected-devices"),
    server: app,
    logger: { info() {}, error() {} }
  };
  try {
    await connectedDevicesPlugin.initialize(ctx);
    await run({
      app, client, db, rootEvents,
      organizationEvents: rootEvents.forPlugin("organizations"),
      credential, now
    });
  } finally {
    await app.close();
    await db.dropDatabase();
    await client.close();
  }
}

test("membership suspension event proactively revokes devices across plugin namespaces", { skip: !uri }, async () => withPluginFixture(
  { status: "active", deviceRevocationPending: false },
  async f => {
    const changedAt = new Date();
    await f.db.collection("memberships").updateOne(
      { id: "membership-a" },
      { $set: { status: "suspended", deviceRevocationPending: true, updatedAt: changedAt } }
    );
    await f.organizationEvents.emit("membership.status.changed", {
      tenantId: "tenant-a", userId: "member-a", actorId: "owner-a", status: "suspended", updatedAt: changedAt
    });
    const device = await f.db.collection("connected_devices").findOne({ id: "device-a" });
    assert.equal(device?.status, "revoked");
    assert.equal(device?.revokedBy, "system:membership-revoked");
    assert.notEqual(device?.credentialId, f.credential.credentialId);
    assert.notEqual(device?.credentialHash, f.credential.credentialHash);
    assert.deepEqual(device?.grantedCapabilities, []);
    assert.deepEqual(device?.pendingAuditEventIds ?? [], []);
    assert.equal((await f.db.collection("memberships").findOne({ id: "membership-a" }))?.deviceRevocationPending, false);
    const audit = await f.db.collection("tenant_audit_events").findOne({
      tenantId: "tenant-a", action: "device.revoked", resourceId: "device-a"
    });
    assert.equal(audit?.actorId, "owner-a");
    assert.deepEqual(audit?.metadata, {
      fromStatus: "active", toStatus: "revoked", reason: "membership_suspended"
    });
  }
));

test("startup recovery processes a membership revocation left pending by a crash", { skip: !uri }, async () => withPluginFixture(
  { status: "suspended", deviceRevocationPending: true },
  async f => {
    const device = await f.db.collection("connected_devices").findOne({ id: "device-a" });
    assert.equal(device?.status, "revoked");
    assert.notEqual(device?.credentialId, f.credential.credentialId);
    assert.deepEqual(device?.grantedCapabilities, []);
    assert.equal((await f.db.collection("memberships").findOne({ id: "membership-a" }))?.deviceRevocationPending, false);
    assert.equal(await f.db.collection("tenant_audit_events").countDocuments({
      tenantId: "tenant-a", action: "device.revoked", resourceId: "device-a"
    }), 1);
  }
));
