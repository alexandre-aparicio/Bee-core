import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { MongoClient } from "mongodb";
import { ConnectedDevicesRepository } from "../src/plugins/connected-devices/connected-devices.repository.js";
import { createConnectedDevicesServices, hashDeviceSecret } from "../src/plugins/connected-devices/connected-devices.service.js";
import { registerConnectedDevicesRoutes } from "../src/plugins/connected-devices/connected-devices.routes.js";
import { timeTrackingConnectedPlugin } from "../src/plugins/time-tracking-connected/time-tracking-connected.plugin.js";

const uri = process.env.MONGODB_TEST_URI;
const secret = "device-security-test-secret-at-least-32-characters";
const connectorPermissions = [
  { pluginId: "time-tracking-connected", key: "time-tracking-connected.clock-in", module: "time-tracking-connected", resource: "clock-in", action: "create", label: "Clock in" },
  { pluginId: "time-tracking-connected", key: "time-tracking-connected.clock-out", module: "time-tracking-connected", resource: "clock-out", action: "create", label: "Clock out" },
  { pluginId: "time-tracking-connected", key: "time-tracking-connected.records.read", module: "time-tracking-connected", resource: "records", action: "read", label: "Read records" }
];

test("Connected Devices pairing, approval, revocation, capabilities and Time Tracking Connected authorization", { skip: !uri }, async () => {
  const client = new MongoClient(uri!);
  await client.connect();
  const db = client.db("bee_device_security_" + Date.now());
  const app = Fastify();
  app.register(jwt, { secret });
  const now = new Date();
  const memberships = db.collection("memberships");
  const access = {
    resolveTenantContext: async (claims: any) => ({
      tenantId: String(claims.tenantId), userId: String(claims.userId), client: "dashboard",
      role: String(claims.role), sessionId: "session-" + String(claims.tenantId) + "-" + String(claims.userId),
      sessionExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
    }),
    isPluginAvailable: async () => true,
    isTenantUserActive: async (tenantId: string, userId: string) =>
      Boolean(await memberships.findOne({ tenantId, userId, status: "active" })),
    getTenantConnectorPermissions: async () => connectorPermissions,
    getTenantPluginPermissions: async () => connectorPermissions,
    getTenantUserSummaries: async () => []
  };
  const repository = new ConnectedDevicesRepository(db);

  const deviceRecord = (input: {
    id: string; tenantId: string; ownerUserId: string; credential: string;
    status?: "pending" | "active" | "suspended" | "revoked"; requested?: string[]; granted?: string[];
  }) => ({
    id: input.id, tenantId: input.tenantId, ownerUserId: input.ownerUserId, requestedBy: input.ownerUserId,
    pairingChallengeId: "challenge-" + input.id, name: input.id, deviceType: "mobile", platform: "android",
    appVersion: null, requestedCapabilities: input.requested ?? connectorPermissions.map(item => item.key),
    grantedCapabilities: input.granted ?? [], credentialHash: hashDeviceSecret(input.credential),
    status: input.status ?? "active", pairingExpiresAt: new Date(Date.now() + 15 * 60_000),
    createdAt: now, updatedAt: now, approvedAt: now, approvedBy: input.ownerUserId,
    revokedAt: null, revokedBy: null, lastSeenAt: null
  });

  try {
    await repository.initializeIndexes();
    await db.collection("tenants").insertMany([
      { id: "tenant-a", name: "Tenant A", status: "active" },
      { id: "tenant-b", name: "Tenant B", status: "active" }
    ]);
    await db.collection("users").insertMany([
      { id: "owner-a", email: "owner-a@example.test", enabled: true },
      { id: "member-a", email: "member-a@example.test", enabled: true },
      { id: "owner-b", email: "owner-b@example.test", enabled: true }
    ]);
    await memberships.insertMany([
      { tenantId: "tenant-a", userId: "owner-a", role: "owner", status: "active" },
      { tenantId: "tenant-a", userId: "member-a", role: "member", status: "active" },
      { tenantId: "tenant-b", userId: "owner-b", role: "owner", status: "active" }
    ]);

    const services = createConnectedDevicesServices({ secret, repository, access: access as any });
    registerConnectedDevicesRoutes({ server: app } as any, services);
    const ctx: any = {
      server: app,
      mongoClient: client,
      config: { mongoDbName: db.databaseName, sessionIdSecret: secret },
      services: { get: (key: string) => key === "core.plugin-access" ? access : undefined },
      logger: { info() {}, warn() {}, error() {} }
    };
    await timeTrackingConnectedPlugin.initialize?.(ctx);
    await app.ready();

    const token = (tenantId: string, userId: string, role: string) =>
      app.jwt.sign({ tenantId, userId, role, client: "dashboard" });
    const ownerA = { authorization: "Bearer " + token("tenant-a", "owner-a", "owner") };
    const memberA = { authorization: "Bearer " + token("tenant-a", "member-a", "member") };
    const ownerB = { authorization: "Bearer " + token("tenant-b", "owner-b", "owner") };
    const createChallenge = async (headers: Record<string, string>, requestedCapabilities = ["time-tracking-connected.clock-in"]) =>
      app.inject({ method: "POST", url: "/connected-devices/pairing-challenges", headers, payload: { requestedCapabilities } });
    const pair = async (qrPayload: string, name: string) => {
      const tokenValue = new URL(qrPayload).searchParams.get("token");
      assert.ok(tokenValue);
      return app.inject({ method: "POST", url: "/connected-devices/pair", payload: { token: tokenValue, name, platform: "android" } });
    };
    const heartbeat = (credential: string) => app.inject({
      method: "POST", url: "/connected-devices/device/heartbeat",
      headers: { authorization: "Bearer " + credential }
    });

    const invalidRequest = await createChallenge(ownerA, ["time-tracking.manage"]);
    assert.equal(invalidRequest.statusCode, 400, "pairing must reject permissions not declared by a device connector");

    const expiredChallenge = await createChallenge(ownerA);
    assert.equal(expiredChallenge.statusCode, 201);
    const expiredId = expiredChallenge.json().challengeId as string;
    await repository.challenges.updateOne({ id: expiredId }, { $set: { expiresAt: new Date(Date.now() - 1) } });
    const expiredPair = await pair(expiredChallenge.json().qrPayload, "Expired QR");
    assert.equal(expiredPair.statusCode, 410, "a QR code older than its five-minute validity window must not pair");

    const replayChallenge = await createChallenge(ownerA);
    assert.equal(replayChallenge.statusCode, 201);
    const firstPair = await pair(replayChallenge.json().qrPayload, "Replay candidate");
    assert.equal(firstPair.statusCode, 201);
    const replayPair = await pair(replayChallenge.json().qrPayload, "Replay attempt");
    assert.equal(replayPair.statusCode, 410, "a claimed QR token must be single-use");

    const betaChallenge = await createChallenge(ownerB);
    assert.equal(betaChallenge.statusCode, 201);
    const betaPair = await pair(betaChallenge.json().qrPayload, "Tenant B device");
    assert.equal(betaPair.statusCode, 201);
    const crossTenantApproval = await app.inject({
      method: "POST", url: "/connected-devices/" + betaPair.json().deviceId + "/approve",
      headers: ownerA, payload: { grantedCapabilities: ["time-tracking-connected.clock-in"] }
    });
    assert.equal(crossTenantApproval.statusCode, 404, "Tenant A cannot approve a pending device belonging to Tenant B");

    const pendingA = firstPair.json().deviceId as string;
    const memberApprove = await app.inject({
      method: "POST", url: "/connected-devices/" + pendingA + "/approve",
      headers: memberA, payload: { grantedCapabilities: ["time-tracking-connected.clock-in"] }
    });
    assert.equal(memberApprove.statusCode, 403, "a non-admin cannot approve a device");

    const invalidApprovalDevice = "device-invalid-approval";
    await repository.devices.insertOne(deviceRecord({
      id: invalidApprovalDevice, tenantId: "tenant-a", ownerUserId: "owner-a",
      credential: "invalid-approval-device-credential-000000000000000000000000000000",
      status: "pending", requested: ["time-tracking-connected.clock-in"], granted: []
    }) as any);
    const invalidApproval = await app.inject({
      method: "POST", url: "/connected-devices/" + invalidApprovalDevice + "/approve",
      headers: ownerA, payload: { grantedCapabilities: ["time-tracking.manage"] }
    });
    assert.equal(invalidApproval.statusCode, 400, "approval must reject a permission not declared by a connector");

    const suspendedCredential = "suspended-device-credential-000000000000000000000000000000";
    await repository.devices.insertOne(deviceRecord({
      id: "device-suspend-reactivate", tenantId: "tenant-a", ownerUserId: "owner-a",
      credential: suspendedCredential, granted: ["time-tracking-connected.clock-in"]
    }) as any);
    const memberSuspend = await app.inject({
      method: "POST", url: "/connected-devices/device-suspend-reactivate/suspend", headers: memberA
    });
    assert.equal(memberSuspend.statusCode, 403, "a non-admin cannot suspend a device");
    const suspended = await app.inject({
      method: "POST", url: "/connected-devices/device-suspend-reactivate/suspend", headers: ownerA
    });
    assert.equal(suspended.statusCode, 200);
    assert.equal((await heartbeat(suspendedCredential)).statusCode, 401, "a suspended device loses access immediately");
    const reactivated = await app.inject({
      method: "POST", url: "/connected-devices/device-suspend-reactivate/activate", headers: ownerA
    });
    assert.equal(reactivated.statusCode, 409, "a suspended device requires a new QR pairing and admin approval");
    assert.equal((await heartbeat(suspendedCredential)).statusCode, 401, "the credential issued before suspension must remain invalid");

    const revokedCredential = "revoked-device-credential-00000000000000000000000000000000";
    await repository.devices.insertOne(deviceRecord({
      id: "device-revoked", tenantId: "tenant-a", ownerUserId: "owner-a",
      credential: revokedCredential, granted: ["time-tracking-connected.clock-in"]
    }) as any);
    const revoked = await app.inject({
      method: "POST", url: "/connected-devices/device-revoked/revoke", headers: ownerA
    });
    assert.equal(revoked.statusCode, 200);
    assert.equal((await heartbeat(revokedCredential)).statusCode, 401, "a revoked device loses access immediately");
    const cannotReactivateRevoked = await app.inject({
      method: "POST", url: "/connected-devices/device-revoked/activate", headers: ownerA
    });
    assert.equal(cannotReactivateRevoked.statusCode, 404, "there is no reactivation route for revoked devices");

    const memberOwnedCredential = "member-owned-device-credential-000000000000000000000000000000";
    await repository.devices.insertOne(deviceRecord({
      id: "device-member-owned", tenantId: "tenant-a", ownerUserId: "member-a",
      credential: memberOwnedCredential, granted: ["time-tracking-connected.clock-in"]
    }) as any);
    const memberRevoke = await app.inject({
      method: "POST", url: "/connected-devices/device-member-owned/revoke", headers: memberA
    });
    assert.equal(memberRevoke.statusCode, 403, "a non-admin cannot revoke a device, including their own");
    assert.equal(await repository.devices.countDocuments({ id: "device-member-owned", status: "active" }), 1);

    // Time Tracking Connected derives tenant/user identity from the authenticated device record.
    const betaSession = {
      id: "session-beta-private", tenantId: "tenant-b", userId: "owner-b", status: "closed", active: false,
      startedAt: now, endedAt: now, events: [], createdAt: now, updatedAt: now
    };
    await db.collection("tenant_time_tracking_sessions").insertOne(betaSession as any);
    const readCredential = "tenant-a-read-device-credential-000000000000000000000000000000";
    await repository.devices.insertOne(deviceRecord({
      id: "device-a-read", tenantId: "tenant-a", ownerUserId: "owner-a",
      credential: readCredential, granted: ["time-tracking-connected.records.read"]
    }) as any);
    const alphaDeviceSessions = await app.inject({
      method: "GET", url: "/time-tracking-connected/device/sessions",
      headers: { authorization: "Bearer " + readCredential }
    });
    assert.equal(alphaDeviceSessions.statusCode, 200);
    assert.deepEqual(alphaDeviceSessions.json().sessions, [], "Tenant A device must not list Tenant B time records");
    const clockCredential = "tenant-a-clock-device-credential-000000000000000000000000000000";
    await repository.devices.insertOne(deviceRecord({
      id: "device-a-clock", tenantId: "tenant-a", ownerUserId: "owner-a",
      credential: clockCredential, granted: ["time-tracking-connected.clock-in"]
    }) as any);
    const alphaClockIn = await app.inject({
      method: "POST", url: "/time-tracking-connected/device/clock-in",
      headers: { authorization: "Bearer " + clockCredential },
      payload: { operationId: "tenant-a-device-clock-in" }
    });
    assert.equal(alphaClockIn.statusCode, 201);
    assert.equal(await db.collection("tenant_time_tracking_sessions").countDocuments({ tenantId: "tenant-a", userId: "owner-a" }), 1);
    assert.equal(await db.collection("tenant_time_tracking_sessions").countDocuments({ tenantId: "tenant-b", id: "session-beta-private" }), 1,
      "Tenant A device actions must not modify Tenant B time records");

    const limitedCredential = "limited-permission-device-credential-000000000000000000000000000000";
    await repository.devices.insertOne(deviceRecord({
      id: "device-limited-permissions", tenantId: "tenant-a", ownerUserId: "owner-a",
      credential: limitedCredential, granted: ["time-tracking-connected.clock-in"]
    }) as any);
    const deniedTimeTrackingRead = await app.inject({
      method: "GET", url: "/time-tracking-connected/device/sessions",
      headers: { authorization: "Bearer " + limitedCredential }
    });
    assert.equal(deniedTimeTrackingRead.statusCode, 403, "a device without records.read cannot list Control Horario sessions");

  } finally {
    await app.close();
    await db.dropDatabase();
    await client.close();
  }
});

