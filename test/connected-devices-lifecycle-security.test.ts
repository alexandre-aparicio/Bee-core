import { test } from "node:test";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { MongoClient } from "mongodb";
import { ConnectedDevicesRepository } from "../src/plugins/connected-devices/connected-devices.repository.js";
import {
  createConnectedDevicesServices,
  createDeviceCredential,
  findConnectedDeviceByCredential,
  hashDeviceSecret,
  hasConnectedDeviceCapability
} from "../src/plugins/connected-devices/connected-devices.service.js";
import { dispatchTenantAuditOutbox, prepareTenantAuditOutboxEvent, type TenantAuditOutboxRecord } from "../src/core/audit-log.js";
import { registerConnectedDevicesRoutes } from "../src/plugins/connected-devices/connected-devices.routes.js";

const uri = process.env.MONGODB_TEST_URI;
const secret = "connected-device-lifecycle-security-test-secret";
const permission = {
  pluginId: "time-tracking-connected",
  key: "time-tracking-connected.clock-in",
  module: "time-tracking-connected",
  resource: "clock-in",
  action: "create",
  label: "Clock in"
};
const credential = "legacy-device-credential-for-security-regression-test-000000000000";

async function withFixture(run: (fixture: any) => Promise<void>): Promise<void> {
  const client = new MongoClient(uri!);
  await client.connect();
  const db = client.db("bee_device_lifecycle_" + randomUUID());
  const app = Fastify();
  app.register(jwt, { secret });
  const memberships = db.collection("memberships");
  const availability = new Map<string, boolean>();
  const access = {
    resolveTenantContext: async (claims: any) => ({
      tenantId: String(claims.tenantId),
      userId: String(claims.userId),
      client: "dashboard",
      role: String(claims.role),
      sessionId: "session-" + String(claims.tenantId) + "-" + String(claims.userId),
      sessionExpiresAt: new Date(Date.now() + 60 * 60_000)
    }),
    isPluginAvailable: async (tenantId: string, pluginId: string) => availability.get(tenantId + ":" + pluginId) ?? true,
    isTenantUserActive: async (tenantId: string, userId: string) =>
      Boolean(await memberships.findOne({ tenantId, userId, status: "active" })),
    getTenantConnectorPermissions: async () => [permission],
    getTenantPluginPermissions: async () => [permission],
    getTenantUserSummaries: async () => []
  };
  const repository = new ConnectedDevicesRepository(db);
  await repository.initializeIndexes();
  await db.collection("tenants").insertMany([
    { id: "tenant-a", name: "Tenant A", status: "active" },
    { id: "tenant-b", name: "Tenant B", status: "active" }
  ]);
  await memberships.insertMany([
    { tenantId: "tenant-a", userId: "owner-a", role: "owner", status: "active" },
    { tenantId: "tenant-a", userId: "member-a", role: "member", status: "active" },
    { tenantId: "tenant-b", userId: "owner-b", role: "owner", status: "active" }
  ]);
  const services = createConnectedDevicesServices({ secret, repository, access: access as any });
  registerConnectedDevicesRoutes({ server: app } as any, services);
  await app.ready();

  const auth = (tenantId: string, userId: string, role: string) => ({
    authorization: "Bearer " + app.jwt.sign({ tenantId, userId, role, client: "dashboard" })
  });
  const ownerA = auth("tenant-a", "owner-a", "owner");
  const memberA = auth("tenant-a", "member-a", "member");
  const ownerB = auth("tenant-b", "owner-b", "owner");
  const insertDevice = async (input: {
    id: string; tenantId?: string; ownerUserId?: string; status?: string; credential?: string; granted?: string[];
    credentialVersion?: number;
  }) => {
    const now = new Date();
    const record: any = {
      id: input.id, tenantId: input.tenantId ?? "tenant-a", ownerUserId: input.ownerUserId ?? "owner-a",
      requestedBy: input.ownerUserId ?? "owner-a", pairingChallengeId: "challenge-" + input.id,
      name: input.id, deviceType: "mobile", platform: "android", appVersion: null,
      requestedCapabilities: [permission.key], grantedCapabilities: input.granted ?? [permission.key],
      credentialHash: hashDeviceSecret(input.credential ?? (input.id + "-" + credential)), status: input.status ?? "active",
      pairingExpiresAt: new Date(Date.now() + 15 * 60_000), createdAt: now, updatedAt: now,
      approvedAt: now, approvedBy: "owner-a", revokedAt: null, revokedBy: null, lastSeenAt: null
    };
    if (input.credentialVersion !== undefined) record.credentialVersion = input.credentialVersion;
    await repository.devices.insertOne(record);
    return record;
  };
  const heartbeat = (value: string) => app.inject({
    method: "POST", url: "/connected-devices/device/heartbeat",
    headers: { authorization: "Bearer " + value }
  });
  try {
    await run({ client, db, app, access, availability, repository, ownerA, memberA, ownerB, insertDevice, heartbeat });
  } finally {
    await app.close();
    await db.dropDatabase();
    await client.close();
  }
}

test("member cannot revoke their own device", { skip: !uri }, async () => withFixture(async f => {
  await f.insertDevice({ id: "member-device", ownerUserId: "member-a" });
  const response = await f.app.inject({ method: "POST", url: "/connected-devices/member-device/revoke", headers: f.memberA });
  assert.equal(response.statusCode, 403);
  assert.equal(await f.repository.devices.countDocuments({ id: "member-device", status: "active" }), 1);
}));

test("member cannot suspend or reactivate a device, including their own", { skip: !uri }, async () => withFixture(async f => {
  await f.insertDevice({ id: "member-active", ownerUserId: "member-a" });
  await f.insertDevice({ id: "member-suspended", ownerUserId: "member-a", status: "suspended" });
  const suspend = await f.app.inject({ method: "POST", url: "/connected-devices/member-active/suspend", headers: f.memberA });
  const activate = await f.app.inject({ method: "POST", url: "/connected-devices/member-suspended/activate", headers: f.memberA });
  assert.equal(suspend.statusCode, 403);
  assert.equal(activate.statusCode, 403);
}));

test("admin suspension invalidates a legacy credential and reactivation cannot restore it", { skip: !uri }, async () => withFixture(async f => {
  await f.insertDevice({ id: "legacy-suspend" }); // Legacy records have no credentialVersion field.
  const suspended = await f.app.inject({ method: "POST", url: "/connected-devices/legacy-suspend/suspend", headers: f.ownerA });
  assert.equal(suspended.statusCode, 200);
  assert.equal((await f.heartbeat("legacy-suspend-" + credential)).statusCode, 401);
  const activated = await f.app.inject({ method: "POST", url: "/connected-devices/legacy-suspend/activate", headers: f.ownerA });
  assert.equal(activated.statusCode, 409, "old credentials must never be restored; a new QR pairing is required");
  assert.equal((await f.heartbeat("legacy-suspend-" + credential)).statusCode, 401);
}));

test("admin revocation is terminal and invalidates the previous credential", { skip: !uri }, async () => withFixture(async f => {
  await f.insertDevice({ id: "terminal-revoke" });
  const revoked = await f.app.inject({ method: "POST", url: "/connected-devices/terminal-revoke/revoke", headers: f.ownerA });
  assert.equal(revoked.statusCode, 200);
  assert.equal((await f.heartbeat("terminal-revoke-" + credential)).statusCode, 401);
  const activate = await f.app.inject({ method: "POST", url: "/connected-devices/terminal-revoke/activate", headers: f.ownerA });
  assert.ok([404, 409].includes(activate.statusCode));
  assert.equal(await f.repository.devices.countDocuments({ id: "terminal-revoke", status: "revoked" }), 1);
}));

test("cross-tenant device and nonexistent device have identical lifecycle responses", { skip: !uri }, async () => withFixture(async f => {
  await f.insertDevice({ id: "private-beta", tenantId: "tenant-b", ownerUserId: "owner-b" });
  const foreign = await f.app.inject({ method: "POST", url: "/connected-devices/private-beta/revoke", headers: f.ownerA });
  const missing = await f.app.inject({ method: "POST", url: "/connected-devices/does-not-exist/revoke", headers: f.ownerA });
  assert.equal(foreign.statusCode, missing.statusCode);
  assert.deepEqual(foreign.json(), missing.json());
  assert.equal(await f.repository.devices.countDocuments({ id: "private-beta", status: "active" }), 1);
}));

test("suspended and revoked devices cannot retain connector capabilities", { skip: !uri }, async () => withFixture(async f => {
  await f.insertDevice({ id: "capability-suspended" });
  await f.insertDevice({ id: "capability-revoked" });
  await f.app.inject({ method: "POST", url: "/connected-devices/capability-suspended/suspend", headers: f.ownerA });
  await f.app.inject({ method: "POST", url: "/connected-devices/capability-revoked/revoke", headers: f.ownerA });
  assert.equal(await hasConnectedDeviceCapability(f.db, f.access, "tenant-a", "capability-suspended", permission.key), false);
  assert.equal(await hasConnectedDeviceCapability(f.db, f.access, "tenant-a", "capability-revoked", permission.key), false);
  assert.equal(await f.repository.devices.countDocuments({ id: { $in: ["capability-suspended", "capability-revoked"] }, grantedCapabilities: permission.key }), 0);
}));


test("new credentials use an opaque indexed lookup ID and constant-time secret verification", { skip: !uri }, async () => withFixture(async f => {
  const credential = createDeviceCredential();
  await f.insertDevice({ id: "lookup-key-device", credential: credential.deviceCredential });
  await f.repository.devices.updateOne({ id: "lookup-key-device" }, { $set: { credentialId: credential.credentialId, credentialHash: credential.credentialHash } });
  const valid = await findConnectedDeviceByCredential(f.repository, credential.deviceCredential, ["active"]);
  assert.equal(valid?.id, "lookup-key-device");
  assert.equal(await findConnectedDeviceByCredential(f.repository, credential.credentialId + "." + "x".repeat(64), ["active"]), null);
  assert.equal(await findConnectedDeviceByCredential(f.repository, "A".repeat(22) + "." + credential.deviceCredential.slice(23), ["active"]), null);
}));

test("credential rotation changes both lookup ID and secret hash while invalidating the previous credential", { skip: !uri }, async () => withFixture(async f => {
  const previous = createDeviceCredential();
  await f.insertDevice({ id: "rotate-lookup-device", credential: previous.deviceCredential });
  await f.repository.devices.updateOne({ id: "rotate-lookup-device" }, { $set: { credentialId: previous.credentialId, credentialHash: previous.credentialHash } });
  const response = await f.app.inject({
    method: "POST", url: "/connected-devices/device/rotate-credential",
    headers: { authorization: "Bearer " + previous.deviceCredential }
  });
  assert.equal(response.statusCode, 200);
  const next = response.json().credential as string;
  assert.notEqual(next, previous.deviceCredential);
  assert.equal(await findConnectedDeviceByCredential(f.repository, previous.deviceCredential, ["active"]), null);
  assert.equal((await findConnectedDeviceByCredential(f.repository, next, ["active"]))?.id, "rotate-lookup-device");
}));

test("membership revocation lazily terminally revokes the member's device", { skip: !uri }, async () => withFixture(async f => {
  await f.insertDevice({ id: "membership-device", ownerUserId: "member-a" });
  await f.db.collection("memberships").updateOne({ tenantId: "tenant-a", userId: "member-a" }, { $set: { status: "suspended" } });
  assert.equal((await f.heartbeat("membership-device-" + credential)).statusCode, 401);
  const record = await f.repository.devices.findOne({ id: "membership-device" });
  assert.equal(record?.status, "revoked");
  assert.equal(record?.revokedBy, "system:membership-revoked");
}));

test("concurrent approval and revocation leave no active device credential", { skip: !uri }, async () => withFixture(async f => {
  await f.insertDevice({ id: "approve-race", status: "pending", granted: [] });
  const [approve, revoke] = await Promise.all([
    f.app.inject({ method: "POST", url: "/connected-devices/approve-race/approve", headers: f.ownerA, payload: { grantedCapabilities: [permission.key] } }),
    f.app.inject({ method: "POST", url: "/connected-devices/approve-race/revoke", headers: f.ownerA })
  ]);
  assert.ok([200, 404, 409].includes(approve.statusCode));
  assert.ok([200, 404].includes(revoke.statusCode));
  const record = await f.repository.devices.findOne({ id: "approve-race" });
  assert.equal(record?.status, "revoked");
  assert.equal((await f.heartbeat("approve-race-" + credential)).statusCode, 401);
}));

test("two concurrent revocations have exactly one winner", { skip: !uri }, async () => withFixture(async f => {
  await f.insertDevice({ id: "double-revoke" });
  const responses = await Promise.all([
    f.app.inject({ method: "POST", url: "/connected-devices/double-revoke/revoke", headers: f.ownerA }),
    f.app.inject({ method: "POST", url: "/connected-devices/double-revoke/revoke", headers: f.ownerA })
  ]);
  assert.equal(responses.filter(response => response.statusCode === 200).length, 1);
  assert.equal(await f.repository.devices.countDocuments({ id: "double-revoke", status: "revoked" }), 1);
  assert.equal((await f.heartbeat("double-revoke-" + credential)).statusCode, 401);
}));

test("device lifecycle transitions emit tenant-scoped durable audit events", { skip: !uri }, async () => withFixture(async f => {
  await f.insertDevice({ id: "audit-gap-device" });
  const suspended = await f.app.inject({ method: "POST", url: "/connected-devices/audit-gap-device/suspend", headers: f.ownerA });
  assert.equal(suspended.statusCode, 200);
  const rows = await f.db.collection("tenant_audit_events").find({ tenantId: "tenant-a", resourceType: "device", resourceId: "audit-gap-device" }).toArray();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, "device.suspended");
  assert.equal(rows[0].actorId, "owner-a");
  assert.equal(rows[0].outcome, "success");
  assert.deepEqual(rows[0].metadata, { fromStatus: "active", toStatus: "suspended" });
  const outbox = await f.db.collection<TenantAuditOutboxRecord>("tenant_audit_outbox").findOne({ id: rows[0].id });
  assert.equal(outbox?.status, "delivered");
  assert.equal((await f.repository.devices.findOne({ id: "audit-gap-device" }))?.pendingAuditEventIds?.length ?? 0, 0);
}));

test("audit outbox recovers a committed device transition after a process crash", { skip: !uri }, async () => withFixture(async f => {
  await f.insertDevice({ id: "audit-crash-recovery" });
  const outbox = f.db.collection<TenantAuditOutboxRecord>("tenant_audit_outbox");
  const event = await prepareTenantAuditOutboxEvent(outbox, {
    tenantId: "tenant-a", actorId: "owner-a", action: "device.revoked", outcome: "success",
    resourceType: "device", resourceId: "audit-crash-recovery",
    metadata: { fromStatus: "active", toStatus: "revoked" }
  });
  await f.repository.devices.updateOne(
    { tenantId: "tenant-a", id: "audit-crash-recovery", status: "active" },
    { $set: { status: "revoked" }, $addToSet: { pendingAuditEventIds: event.id } }
  );
  // Simulate a crash before commitTenantAuditOutboxEvent; the resource marker is authoritative.
  await dispatchTenantAuditOutbox(f.db);
  await dispatchTenantAuditOutbox(f.db);
  assert.equal(await f.db.collection("tenant_audit_events").countDocuments({ tenantId: "tenant-a", id: event.id }), 1);
  assert.equal((await outbox.findOne({ id: event.id }))?.status, "delivered");
  assert.equal((await f.repository.devices.findOne({ id: "audit-crash-recovery" }))?.pendingAuditEventIds?.length ?? 0, 0);
}));


test("tenant administrator cannot change a device belonging to another tenant", { skip: !uri }, async () => withFixture(async f => {
  await f.insertDevice({ id: "tenant-a-private", tenantId: "tenant-a", ownerUserId: "owner-a" });
  const foreign = await f.app.inject({ method: "POST", url: "/connected-devices/tenant-a-private/revoke", headers: f.ownerB });
  const missing = await f.app.inject({ method: "POST", url: "/connected-devices/no-such-device/revoke", headers: f.ownerB });
  assert.equal(foreign.statusCode, 404);
  assert.equal(foreign.statusCode, missing.statusCode);
  assert.deepEqual(foreign.json(), missing.json());
  assert.equal(await f.repository.devices.countDocuments({ id: "tenant-a-private", status: "active" }), 1);
}));

test("device lifecycle state machine rejects every transition not explicitly allowed", { skip: !uri }, async t => withFixture(async f => {
  const cases: Array<{from:string;action:string;expected:number}> = [
    {from:"pending",action:"approve",expected:200},{from:"pending",action:"suspend",expected:404},{from:"pending",action:"activate",expected:404},{from:"pending",action:"revoke",expected:200},{from:"pending",action:"unlink",expected:200},
    {from:"active",action:"approve",expected:404},{from:"active",action:"suspend",expected:200},{from:"active",action:"activate",expected:404},{from:"active",action:"revoke",expected:200},{from:"active",action:"unlink",expected:200},
    {from:"suspended",action:"approve",expected:404},{from:"suspended",action:"suspend",expected:404},{from:"suspended",action:"activate",expected:409},{from:"suspended",action:"revoke",expected:200},{from:"suspended",action:"unlink",expected:200},
    {from:"revoked",action:"approve",expected:404},{from:"revoked",action:"suspend",expected:404},{from:"revoked",action:"activate",expected:404},{from:"revoked",action:"revoke",expected:404},{from:"revoked",action:"unlink",expected:404},
    {from:"unlinked",action:"approve",expected:404},{from:"unlinked",action:"suspend",expected:404},{from:"unlinked",action:"activate",expected:404},{from:"unlinked",action:"revoke",expected:404},{from:"unlinked",action:"unlink",expected:404},
    {from:"expired",action:"approve",expected:404},{from:"expired",action:"suspend",expected:404},{from:"expired",action:"activate",expected:404},{from:"expired",action:"revoke",expected:404},{from:"expired",action:"unlink",expected:200}
  ];
  for (const [index,item] of cases.entries()) {
    await t.test(item.from + " -> " + item.action, async () => {
      const id = "matrix-" + index;
      await f.insertDevice({ id, status: item.from, granted: item.from === "active" ? [permission.key] : [] });
      const response = await f.app.inject({
        method: "POST",
        url: "/connected-devices/" + id + "/" + item.action,
        headers: f.ownerA,
        payload: item.action === "approve" ? { grantedCapabilities: [permission.key] } : {}
      });
      assert.equal(response.statusCode, item.expected);
    });
  }
}));

test("a tenant administrator cannot revoke another tenant's device", { skip: !uri }, async () => withFixture(async f => {
  await f.insertDevice({ id: "foreign-admin-target", tenantId: "tenant-a", ownerUserId: "owner-a" });
  const foreign = await f.app.inject({ method: "POST", url: "/connected-devices/foreign-admin-target/revoke", headers: f.ownerB });
  const missing = await f.app.inject({ method: "POST", url: "/connected-devices/unknown-admin-target/revoke", headers: f.ownerB });
  assert.equal(foreign.statusCode, 404);
  assert.equal(foreign.statusCode, missing.statusCode);
  assert.deepEqual(foreign.json(), missing.json());
  assert.equal(await f.repository.devices.countDocuments({ id: "foreign-admin-target", status: "active" }), 1);
}));