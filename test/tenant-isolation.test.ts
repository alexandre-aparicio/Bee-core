import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { MongoClient } from "mongodb";
import { maskResourceId } from "../src/core/session-id.js";
import { ConnectedDevicesRepository } from "../src/plugins/connected-devices/connected-devices.repository.js";
import { createConnectedDevicesServices } from "../src/plugins/connected-devices/connected-devices.service.js";
import { registerConnectedDevicesRoutes } from "../src/plugins/connected-devices/connected-devices.routes.js";
import { TimeTrackingRepository } from "../src/plugins/time-tracking/time-tracking.repository.js";
import { createTimeTrackingHandlers } from "../src/plugins/time-tracking/time-tracking.handlers.js";
import { DocumentsRepository } from "../src/plugins/documents/documents.repository.js";
import { FilesStorageAdapter } from "../src/plugins/documents/files-storage.adapter.js";
import { createDocumentsServices } from "../src/plugins/documents/documents.service.js";
import { registerDocumentsRoutes } from "../src/plugins/documents/documents.controller.js";

const uri = process.env.MONGODB_TEST_URI;
const secret = "tenant-isolation-test-secret-at-least-32-characters";
const expiry = new Date(Date.now() + 60 * 60 * 1000);
const connectorPermissions = [{
  pluginId: "time-tracking-connected",
  key: "time-tracking-connected.clock-in",
  module: "time-tracking-connected",
  resource: "clock-in",
  action: "create",
  label: "Clock in"
}];

test("tenant A cannot access tenant B resources across Connected Devices, Control Horario, Time Tracking Connected and Documents", { skip: !uri }, async () => {
  const client = new MongoClient(uri!);
  await client.connect();
  const db = client.db("bee_tenant_isolation_" + Date.now());
  const app = Fastify();
  app.register(jwt, { secret });
  const now = new Date();
  const context = (tenantId: string, userId: string) => ({
    tenantId, userId, email: userId + "@example.test", client: "dashboard" as const,
    role: "owner" as const, sessionId: "session-" + tenantId + "-" + userId,
    sessionExpiresAt: expiry, permissions: ["documents.read", "documents.write"]
  });
  const alpha = context("tenant-alpha", "user-alpha");
  const beta = context("tenant-beta", "user-beta");

  try {
    await db.collection("tenants").insertMany([
      { id: "tenant-alpha", name: "Alpha", status: "active" },
      { id: "tenant-beta", name: "Beta", status: "active" }
    ]);
    await db.collection("users").insertMany([
      { id: "user-alpha", email: "alpha@example.test", enabled: true },
      { id: "user-beta", email: "beta@example.test", enabled: true }
    ]);
    await db.collection("memberships").insertMany([
      { id: "membership-alpha", tenantId: alpha.tenantId, userId: alpha.userId, role: "owner", status: "active" },
      { id: "membership-beta", tenantId: beta.tenantId, userId: beta.userId, role: "owner", status: "active" }
    ]);

    const access = {
      resolveTenantContext: async (claims: any) => context(String(claims.tenantId), String(claims.userId)),
      isPluginAvailable: async () => true,
      isTenantUserActive: async (tenantId: string, userId: string) =>
        Boolean(await db.collection("memberships").findOne({ tenantId, userId, status: "active" })),
      getTenantConnectorPermissions: async () => connectorPermissions,
      getTenantPluginPermissions: async () => connectorPermissions,
      getTenantUserSummaries: async () => []
    };
    const deviceRepository = new ConnectedDevicesRepository(db);
    await deviceRepository.initializeIndexes();
    const deviceServices = createConnectedDevicesServices({ secret, repository: deviceRepository, access: access as any });
    registerConnectedDevicesRoutes({ server: app } as any, deviceServices);

    const alphaDevice = {
      id: "device-alpha", tenantId: alpha.tenantId, ownerUserId: alpha.userId, requestedBy: alpha.userId,
      pairingChallengeId: "challenge-alpha", name: "Alpha device", deviceType: "mobile", platform: "android",
      appVersion: null, requestedCapabilities: connectorPermissions.map(item => item.key),
      grantedCapabilities: connectorPermissions.map(item => item.key), credentialHash: "a".repeat(64),
      status: "active", pairingExpiresAt: new Date(now.getTime() + 60_000), createdAt: now, updatedAt: now,
      approvedAt: now, approvedBy: alpha.userId, revokedAt: null, revokedBy: null, lastSeenAt: null
    };
    const betaDevice = { ...alphaDevice, id: "device-beta", tenantId: beta.tenantId, ownerUserId: beta.userId, requestedBy: beta.userId, name: "Beta private device", credentialHash: "b".repeat(64) };
    await deviceRepository.devices.insertMany([alphaDevice, betaDevice]);

    const timeRepository = new TimeTrackingRepository(db);
    await timeRepository.initializeIndexes();
    const timeHandlers = createTimeTrackingHandlers(timeRepository, secret);
    await timeRepository.sessionsForTenant(beta.tenantId).insertOne({
      id: "beta-private-session", userId: beta.userId, status: "closed", active: false,
      startedAt: now, endedAt: now, events: [], createdAt: now, updatedAt: now
    } as any);
    await timeRepository.schedulesForTenant(beta.tenantId).insertOne({
      id: "beta-private-schedule", userId: beta.userId, timezone: "UTC", days: [],
      updatedBy: beta.userId, createdAt: now, updatedAt: now
    } as any);
    await timeRepository.correctionsForTenant(beta.tenantId).insertOne({
      id: "beta-private-correction", sessionId: "beta-private-session", userId: beta.userId,
      eventType: "clock_in", originalAt: now, requestedAt: now, reason: "Private correction",
      status: "pending", createdAt: now
    } as any);

    const documentsRepository = new DocumentsRepository(db);
    await documentsRepository.initializeIndexes();
    await documentsRepository.folders(beta.tenantId).insertOne({
      id: "00000000-0000-4000-8000-000000000002", tenantId: beta.tenantId,
      name: "Beta private folder", parentId: null, createdBy: beta.userId, createdAt: now, updatedAt: now
    });
    await documentsRepository.documents(beta.tenantId).insertOne({
      id: "00000000-0000-4000-8000-000000000003", tenantId: beta.tenantId,
      fileId: "00000000-0000-4000-8000-000000000004", folderId: null,
      title: "Beta confidential document", description: "Private", tags: [], visibility: "private",
      publicId: null, publishedAt: null, createdBy: beta.userId, createdAt: now, updatedAt: now
    });
    const filesService = {
      store: async () => { throw new Error("not used"); },
      getMetadata: async () => null,
      list: async () => [],
      read: async () => Buffer.alloc(0),
      delete: async () => false
    };
    const documentsServices = createDocumentsServices({
      db, secret, storage: new FilesStorageAdapter(filesService as any), repository: documentsRepository
    });
    const docsContexts: Record<string, typeof alpha> = { [alpha.tenantId]: alpha, [beta.tenantId]: beta };
    registerDocumentsRoutes({ server: app } as any, {
      ...documentsServices,
      authenticate: async (request: any) => {
        try {
          await request.jwtVerify();
          return docsContexts[String(request.user.tenantId)] ?? null;
        } catch {
          return null;
        }
      }
    });

    await app.ready();
    const alphaToken = app.jwt.sign({ tenantId: alpha.tenantId, userId: alpha.userId, client: "dashboard", role: "owner" });
    const auth = { authorization: "Bearer " + alphaToken };
    const betaDocumentRef = maskResourceId("00000000-0000-4000-8000-000000000003", "document", {
      sessionId: beta.sessionId, expiresAt: beta.sessionExpiresAt
    }, secret);
    const betaFolderRef = maskResourceId("00000000-0000-4000-8000-000000000002", "folder", {
      sessionId: beta.sessionId, expiresAt: beta.sessionExpiresAt
    }, secret);
    const betaUserRef = maskResourceId(beta.userId, "user", {
      sessionId: beta.sessionId, expiresAt: beta.sessionExpiresAt
    }, secret);

    const devicesList = await app.inject({ method: "GET", url: "/connected-devices", headers: auth });
    assert.equal(devicesList.statusCode, 200);
    assert.deepEqual(devicesList.json().devices.map((item: any) => item.id), ["device-alpha"]);
    for (const [method, suffix, payload] of [
      ["PATCH", "", { name: "Cross-tenant edit" }],
      ["DELETE", "", undefined],
      ["POST", "/revoke", undefined],
      ["POST", "/suspend", undefined],
      ["POST", "/approve", { grantedCapabilities: connectorPermissions.map(item => item.key) }]
    ] as const) {
      const response = await app.inject({
        method, url: "/connected-devices/device-beta" + suffix, headers: auth,
        ...(payload ? { payload } : {})
      });
      assert.equal(response.statusCode, 404, method + " " + suffix + " must not expose tenant B device");
    }
    assert.equal(await deviceRepository.devices.countDocuments({ tenantId: beta.tenantId, id: betaDevice.id, status: "active" }), 1);

    const alphaStatus = await timeHandlers.status({ tenantContext: alpha } as any);
    assert.equal((alphaStatus as any).session, null);
    const alphaSessions = await timeHandlers.sessions({ tenantContext: alpha, query: { limit: "30" } } as any);
    assert.deepEqual((alphaSessions as any).sessions, []);
    const alphaSchedules = await timeHandlers.teamSchedules({ tenantContext: alpha } as any);
    assert.deepEqual((alphaSchedules as any).schedules, []);
    const crossTenantScheduleUpdateReply: any = { statusCode: 200, code(value: number) { this.statusCode = value; return this; }, send(value: any) { return value; } };
    await timeHandlers.saveTeamSchedule({
      tenantContext: alpha, params: { userId: betaUserRef },
      body: { timezone: "UTC", days: [] }
    } as any, crossTenantScheduleUpdateReply);
    assert.equal(crossTenantScheduleUpdateReply.statusCode, 404);
    const crossTenantScheduleDeleteReply: any = { statusCode: 200, code(value: number) { this.statusCode = value; return this; }, send(value: any) { return value; } };
    await timeHandlers.deleteTeamSchedule({ tenantContext: alpha, params: { userId: betaUserRef } } as any, crossTenantScheduleDeleteReply);
    assert.equal(crossTenantScheduleDeleteReply.statusCode, 404);
    const crossTenantCorrectionReply: any = { statusCode: 200, code(value: number) { this.statusCode = value; return this; }, send(value: any) { return value; } };
    await timeHandlers.requestCorrection({
      tenantContext: alpha,
      body: { sessionId: "beta-private-session", eventType: "clock_in", requestedAt: now.toISOString(), reason: "Cross tenant attempt" }
    } as any, crossTenantCorrectionReply);
    assert.equal(crossTenantCorrectionReply.statusCode, 404);
    const crossTenantReviewReply: any = { statusCode: 200, code(value: number) { this.statusCode = value; return this; }, send(value: any) { return value; } };
    await timeHandlers.reviewCorrection({
      tenantContext: alpha, params: { correctionId: "beta-private-correction" }, body: { decision: "rejected" }
    } as any, crossTenantReviewReply);
    assert.equal(crossTenantReviewReply.statusCode, 404);

    const docsHeaders = auth;
    const documentsList = await app.inject({ method: "GET", url: "/documents", headers: docsHeaders });
    assert.equal(documentsList.statusCode, 200);
    assert.deepEqual(documentsList.json().documents, []);
    const foldersList = await app.inject({ method: "GET", url: "/documents/folders", headers: docsHeaders });
    assert.equal(foldersList.statusCode, 200);
    assert.deepEqual(foldersList.json().folders, []);
    const foreignDocumentRoutes = [
      ["GET", "/documents/" + betaDocumentRef + "/download"],
      ["PATCH", "/documents/" + betaDocumentRef + "/location"],
      ["PUT", "/documents/" + betaDocumentRef + "/publication"],
      ["DELETE", "/documents/" + betaDocumentRef],
      ["GET", "/documents/folders/" + betaFolderRef + "/shares"],
      ["PATCH", "/documents/folders/" + betaFolderRef + "/location"],
      ["DELETE", "/documents/folders/" + betaFolderRef]
    ] as const;
    for (const [method, url] of foreignDocumentRoutes) {
      const response = await app.inject({ method, url, headers: docsHeaders, payload: method === "PATCH" ? { folderId: null } : method === "PUT" ? { published: true } : undefined });
      assert.equal(response.statusCode, 404, method + " " + url + " must not expose tenant B document/folder");
    }
    assert.equal(await documentsRepository.documents(beta.tenantId).countDocuments({ id: "00000000-0000-4000-8000-000000000003", title: "Beta confidential document" }), 1);
  } finally {
    await app.close();
    await db.dropDatabase();
    await client.close();
  }
});
