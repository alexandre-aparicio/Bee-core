import { test } from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { maskResourceId } from "../src/core/session-id.js";
import { TimeTrackingRepository } from "../src/plugins/time-tracking/time-tracking.repository.js";
import { createTimeTrackingHandlers } from "../src/plugins/time-tracking/time-tracking.handlers.js";

const mongoUri = process.env.MONGODB_TEST_URI;
const secret = "time-tracking-integration-secret-at-least-32-characters";
const expiry = new Date(Date.now() + 60 * 60 * 1000);

function request(tenantId: string, userId: string, body: unknown = {}, params: Record<string, string> = {}, query: Record<string, string> = {}) {
  return {
    body, params, query,
    tenantContext: { tenantId, userId, sessionId: "session-" + tenantId + "-" + userId, sessionExpiresAt: expiry }
  } as any;
}

function reply() {
  const state: { statusCode: number; payload: unknown } = { statusCode: 200, payload: undefined };
  return {
    state,
    code(statusCode: number) { state.statusCode = statusCode; return this; },
    send(payload: unknown) { state.payload = payload; return payload; }
  };
}

async function invoke(handler: (request: any, reply: any) => Promise<any>, req: any) {
  const response = reply();
  const result = await handler(req, response);
  return { statusCode: response.state.statusCode, body: result ?? response.state.payload };
}

test("Control Horario lifecycle, idempotency, schedules, corrections and tenant isolation", { skip: !mongoUri }, async () => {
  const client = new MongoClient(mongoUri!);
  await client.connect();
  const dbName = "bee_time_tracking_" + Date.now();
  const db = client.db(dbName);
  try {
    const repository = new TimeTrackingRepository(db);
    await repository.initializeIndexes();
    const handlers = createTimeTrackingHandlers(repository, secret);
    const alpha = request("tenant-alpha", "user-alpha");
    const beta = request("tenant-beta", "user-beta");

    await db.collection("memberships").insertMany([
      { tenantId: "tenant-alpha", userId: "user-alpha", role: "owner", status: "active" },
      { tenantId: "tenant-alpha", userId: "user-member", role: "member", status: "active" },
      { tenantId: "tenant-beta", userId: "user-beta", role: "owner", status: "active" }
    ]);
    await db.collection("users").insertMany([
      { id: "user-alpha", email: "owner@alpha.test", enabled: true },
      { id: "user-member", email: "member@alpha.test", enabled: true },
      { id: "user-beta", email: "owner@beta.test", enabled: true }
    ]);

    const firstClockIn = await invoke(handlers.clockIn, request("tenant-alpha", "user-alpha", { operationId: "clock-in-1", source: "android" }));
    assert.equal(firstClockIn.statusCode, 201);
    const sessionId = (firstClockIn.body as any).session.id;
    assert.equal((firstClockIn.body as any).session.events[0].source, "android");

    const replay = await invoke(handlers.clockIn, request("tenant-alpha", "user-alpha", { operationId: "clock-in-1", source: "android" }));
    assert.equal(replay.statusCode, 200);
    assert.equal((replay.body as any).replayed, true);
    assert.equal((await repository.sessionsForTenant("tenant-alpha").countDocuments({ userId: "user-alpha" })), 1);

    const duplicateOpen = await invoke(handlers.clockIn, request("tenant-alpha", "user-alpha", { operationId: "clock-in-2" }));
    assert.equal(duplicateOpen.statusCode, 409);

    assert.equal(((await invoke(handlers.status, alpha)).body as any).session.status, "working");
    assert.equal((await invoke(handlers.breakStart, request("tenant-alpha", "user-alpha", { operationId: "break-start-1" }))).statusCode, 200);
    assert.equal(((await invoke(handlers.status, alpha)).body as any).session.status, "on_break");
    assert.equal((await invoke(handlers.breakEnd, request("tenant-alpha", "user-alpha", { operationId: "break-end-1" }))).statusCode, 200);
    assert.equal(((await invoke(handlers.status, alpha)).body as any).session.status, "working");
    assert.equal((await invoke(handlers.clockOut, request("tenant-alpha", "user-alpha", { operationId: "clock-out-1" })).then(result => result.statusCode)), 200);
    assert.equal(((await invoke(handlers.status, alpha)).body as any).session, null);

    const history = (await invoke(handlers.sessions, request("tenant-alpha", "user-alpha", {}, {}, { limit: "30" }))).body as any;
    assert.equal(history.sessions.length, 1);
    assert.deepEqual(history.sessions[0].events.map((event: any) => event.type), ["clock_in", "break_start", "break_end", "clock_out"]);
    const storedSession = await repository.sessionsForTenant("tenant-alpha").findOne({ id: sessionId });
    assert.ok(storedSession?.tenantId === "tenant-alpha");

    const userRef = maskResourceId("user-member", "user", { sessionId: alpha.tenantContext.sessionId, expiresAt: expiry }, secret);
    const invalidTimezone = await invoke(handlers.saveTeamSchedule, request("tenant-alpha", "user-alpha", {
      timezone: "Mars/Olympus", days: [{ day: 1, start: "09:00", end: "17:00", breakMinutes: 30 }]
    }, { userId: userRef }));
    assert.equal(invalidTimezone.statusCode, 400);

    const invalidSchedule = await invoke(handlers.saveTeamSchedule, request("tenant-alpha", "user-alpha", {
      timezone: "Europe/Madrid", days: [
        { day: 1, start: "09:00", end: "17:00", breakMinutes: 30 },
        { day: 1, start: "10:00", end: "18:00", breakMinutes: 30 }
      ]
    }, { userId: userRef }));
    assert.equal(invalidSchedule.statusCode, 400);

    const savedSchedule = await invoke(handlers.saveTeamSchedule, request("tenant-alpha", "user-alpha", {
      timezone: "Europe/Madrid", days: [
        { day: 5, start: "09:00", end: "17:00", breakMinutes: 30 },
        { day: 1, start: "08:30", end: "16:30", breakMinutes: 45 }
      ]
    }, { userId: userRef }));
    assert.equal(savedSchedule.statusCode, 200);
    assert.deepEqual((savedSchedule.body as any).schedule.days.map((day: any) => day.day), [1, 5]);
    const persistedSchedule = await repository.schedulesForTenant("tenant-alpha").findOne({ userId: "user-member" });
    assert.equal(persistedSchedule?.tenantId, "tenant-alpha");

    await repository.schedulesForTenant("tenant-beta").insertOne({
      id: "foreign-schedule", userId: "user-beta", timezone: "UTC", days: [], updatedBy: "user-beta",
      createdAt: new Date(), updatedAt: new Date()
    } as any);
    const alphaSchedules = (await invoke(handlers.teamSchedules, alpha)).body as any;
    assert.equal(alphaSchedules.schedules.length, 1);
    assert.equal(alphaSchedules.schedules[0].userId, userRef);

    const closedSession = await repository.sessionsForTenant("tenant-alpha").findOne({ id: sessionId });
    assert.ok(closedSession);
    const originalEntry = closedSession.events.find(event => event.type === "clock_in")!.occurredAt;
    const requestedEntry = new Date(originalEntry.getTime() - 60_000);
    const correctionRequest = await invoke(handlers.requestCorrection, request("tenant-alpha", "user-alpha", {
      sessionId, eventType: "clock_in", requestedAt: requestedEntry.toISOString(), reason: "Forgot to register on time"
    }));
    assert.equal(correctionRequest.statusCode, 201);
    const correctionId = (correctionRequest.body as any).correction.id;

    const duplicateCorrection = await invoke(handlers.requestCorrection, request("tenant-alpha", "user-alpha", {
      sessionId, eventType: "clock_in", requestedAt: requestedEntry.toISOString(), reason: "Duplicate request"
    }));
    assert.equal(duplicateCorrection.statusCode, 409);

    const pending = (await invoke(handlers.teamCorrections, request("tenant-alpha", "user-alpha", {}, {}, { status: "pending" }))).body as any;
    assert.equal(pending.corrections.length, 1);
    const approved = await invoke(handlers.reviewCorrection, request("tenant-alpha", "user-alpha", {
      decision: "approved", reviewNote: "Verified with the manager"
    }, { correctionId }));
    assert.equal(approved.statusCode, 200);
    assert.equal((approved.body as any).status, "approved");

    const afterApproval = await repository.sessionsForTenant("tenant-alpha").findOne({ id: sessionId });
    assert.equal(afterApproval?.startedAt.getTime(), requestedEntry.getTime());
    assert.equal(afterApproval?.events.find(event => event.type === "clock_in")?.occurredAt.getTime(), requestedEntry.getTime());

    const originalExit = afterApproval!.endedAt!;
    const requestedExit = new Date(originalExit.getTime() + 60_000);
    const exitCorrection = await invoke(handlers.requestCorrection, request("tenant-alpha", "user-alpha", {
      sessionId, eventType: "clock_out", requestedAt: requestedExit.toISOString(), reason: "Exit time needs correction"
    }));
    assert.equal(exitCorrection.statusCode, 201);
    const rejectedId = (exitCorrection.body as any).correction.id;
    const rejected = await invoke(handlers.reviewCorrection, request("tenant-alpha", "user-alpha", {
      decision: "rejected", reviewNote: "Insufficient evidence"
    }, { correctionId: rejectedId }));
    assert.equal(rejected.statusCode, 200);
    assert.equal((rejected.body as any).status, "rejected");
    const afterRejection = await repository.sessionsForTenant("tenant-alpha").findOne({ id: sessionId });
    assert.equal(afterRejection?.endedAt?.getTime(), originalExit.getTime(), "rejection must not change the original session");

    assert.equal(((await invoke(handlers.status, beta)).body as any).session, null);
    assert.equal((await repository.sessionsForTenant("tenant-beta").countDocuments({})), 0);
    assert.equal(await db.collection("tenant_time_tracking_sessions").countDocuments({ tenantId: "tenant-alpha" }), 1);
    assert.equal(await db.collection("tenant_time_tracking_sessions").countDocuments({ tenantId: "tenant-beta" }), 0);
  } finally {
    await db.dropDatabase();
    await client.close();
  }
});
