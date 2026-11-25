import { randomUUID } from "node:crypto";
import { type AuthenticatedRequest } from "../auth/auth.guard.js";
import { maskResourceId, unmaskResourceId } from "../../core/session-id.js";
import type { TimeTrackingRepository, ClockEvent, TimeSession, WorkSchedule, Correction } from "./time-tracking.repository.js";
import { normalizeOperationId as operationId, normalizeSource as sourceOf, validateScheduleDays as validateDays, isChronological } from "./time-tracking.service.js";

/** Creates the HTTP handlers for the time-tracking plugin. */
export function createTimeTrackingHandlers(repository: TimeTrackingRepository, secret: string) {
  const { users } = repository;
  const sessionsFor = (tenantId: string) => repository.sessionsForTenant(tenantId);
  const schedulesFor = (tenantId: string) => repository.schedulesForTenant(tenantId);
  const correctionsFor = (tenantId: string) => repository.correctionsForTenant(tenantId);
  const membershipsFor = (tenantId: string) => repository.membershipsForTenant(tenantId);
  const publicSession = (row: TimeSession) => ({
    id: row.id, status: row.status, startedAt: row.startedAt, endedAt: row.endedAt,
    events: row.events.map(event => ({ type: event.type, occurredAt: event.occurredAt, source: event.source }))
  });
  const publicSchedule = (row: WorkSchedule) => ({ userId: row.userId, timezone: row.timezone, days: row.days, updatedAt: row.updatedAt });
  const resolveMember = async (userRef: string, tenantId: string, request: any): Promise<string | null> => {
    try {
      const auth = (request as AuthenticatedRequest).tenantContext;
      const userId = unmaskResourceId(userRef, "user", { sessionId: auth.sessionId, expiresAt: auth.sessionExpiresAt }, secret);
      const member = await membershipsFor(tenantId).findOne({ userId, status: "active" });
      return member ? userId : null;
    } catch { return null; }
  };
  const transition = async (request: any, reply: any, from: "working" | "on_break", to: "working" | "on_break" | "closed", type: ClockEvent["type"]) => {
    const tenant = (request as AuthenticatedRequest).tenantContext, op = operationId(request.body?.operationId);
    if (!op) return reply.code(400).send({ error: "operationId is required" });
    const own = sessionsFor(tenant.tenantId), existing = await own.findOne({ userId: tenant.userId, "events.operationId": op });
    if (existing) return { session: publicSession(existing), replayed: true };
    const now = new Date(), event: ClockEvent = { id: randomUUID(), type, occurredAt: now, source: sourceOf(request.body?.source), operationId: op };
    const update: any = { $set: { status: to, updatedAt: now }, $push: { events: event } };
    if (to === "closed") Object.assign(update.$set, { active: false, endedAt: now });
    const result = await own.updateOne({ userId: tenant.userId, active: true, status: from }, update);
    if (!result.modifiedCount) return reply.code(409).send({ error: "The work session is not in the expected state. Refresh and try again." });
    const row = await own.findOne({ userId: tenant.userId, "events.operationId": op });
    return { session: row ? publicSession(row) : null };
  };

  return {
    status: async (request: any) => {
      const tenant = (request as AuthenticatedRequest).tenantContext;
      const active = await sessionsFor(tenant.tenantId).findOne({ userId: tenant.userId, active: true });
      return { session: active ? publicSession(active) : null };
    },
    sessions: async (request: any) => {
      const tenant = (request as AuthenticatedRequest).tenantContext;
      const limit = Math.max(1, Math.min(100, Number(request.query.limit) || 30));
      const rows = await sessionsFor(tenant.tenantId).find({ userId: tenant.userId, active: false }).sort({ startedAt: -1 }).limit(limit).toArray();
      return { sessions: rows.map(publicSession) };
    },
    clockIn: async (request: any, reply: any) => {
      const tenant = (request as AuthenticatedRequest).tenantContext, op = operationId(request.body?.operationId);
      if (!op) return reply.code(400).send({ error: "operationId is required" });
      const own = sessionsFor(tenant.tenantId), existing = await own.findOne({ userId: tenant.userId, "events.operationId": op });
      if (existing) return { session: publicSession(existing), replayed: true };
      const now = new Date(), row: Omit<TimeSession, "tenantId"> = {
        id: randomUUID(), userId: tenant.userId, status: "working", active: true, startedAt: now, endedAt: null,
        events: [{ id: randomUUID(), type: "clock_in", occurredAt: now, source: sourceOf(request.body?.source), operationId: op }],
        createdAt: now, updatedAt: now
      };
      try { await own.insertOne(row); }
      catch (error) { if ((error as { code?: number }).code === 11000) return reply.code(409).send({ error: "There is already an open work session" }); throw error; }
      return reply.code(201).send({ session: publicSession(row as TimeSession) });
    },
    breakStart: (request: any, reply: any) => transition(request, reply, "working", "on_break", "break_start"),
    breakEnd: (request: any, reply: any) => transition(request, reply, "on_break", "working", "break_end"),
    clockOut: (request: any, reply: any) => transition(request, reply, "working", "closed", "clock_out"),
    mySchedule: async (request: any) => {
      const tenant = (request as AuthenticatedRequest).tenantContext;
      const row = await sessionsFor(tenant.tenantId).findOne({ userId: tenant.userId, active: true });
      const schedule = await schedulesFor(tenant.tenantId).findOne({ userId: tenant.userId });
      return { schedule: schedule ? publicSchedule(schedule) : null, sessionStartedAt: row?.startedAt ?? null };
    },
    teamMembers: async (request: any) => {
      const tenant = (request as AuthenticatedRequest).tenantContext;
      const rows = await membershipsFor(tenant.tenantId).find({ status: "active" }).sort({ role: 1, userId: 1 }).toArray();
      const result = [];
      for (const member of rows) {
        const user = await users.findOne({ id: member.userId, enabled: true }, { projection: { id: 1, email: 1 } });
        if (user) result.push({ userId: maskResourceId(user.id, "user", { sessionId: tenant.sessionId, expiresAt: tenant.sessionExpiresAt }, secret), email: user.email, role: member.role });
      }
      return { members: result };
    },
    teamSchedules: async (request: any) => {
      const tenant = (request as AuthenticatedRequest).tenantContext;
      const rows = await schedulesFor(tenant.tenantId).find({}).sort({ userId: 1 }).toArray();
      return { schedules: rows.map(row => ({ ...publicSchedule(row), userId: maskResourceId(row.userId, "user", { sessionId: tenant.sessionId, expiresAt: tenant.sessionExpiresAt }, secret) })) };
    },
    saveTeamSchedule: async (request: any, reply: any) => {
      const tenant = (request as AuthenticatedRequest).tenantContext;
      const userId = await resolveMember(request.params.userId, tenant.tenantId, request);
      if (!userId) return reply.code(404).send({ error: "Active company member not found" });
      const timezone = String(request.body?.timezone ?? "UTC").trim();
      try { new Intl.DateTimeFormat("en", { timeZone: timezone }); } catch { return reply.code(400).send({ error: "A valid IANA timezone is required" }); }
      const days = validateDays(request.body?.days);
      if (!days) return reply.code(400).send({ error: "Provide up to seven unique weekdays with valid start/end times and break minutes" });
      const scopedSchedules = schedulesFor(tenant.tenantId);
      const now = new Date(), existing = await scopedSchedules.findOne({ userId });
      const row = { id: existing?.id ?? randomUUID(), userId, timezone, days, updatedBy: tenant.userId, createdAt: existing?.createdAt ?? now, updatedAt: now };
      await scopedSchedules.updateOne({ userId }, { $set: row }, { upsert: true });
      return { schedule: { ...row, userId: request.params.userId } };
    },
    deleteTeamSchedule: async (request: any, reply: any) => {
      const tenant = (request as AuthenticatedRequest).tenantContext;
      const userId = await resolveMember(request.params.userId, tenant.tenantId, request);
      if (!userId) return reply.code(404).send({ error: "Active company member not found" });
      await schedulesFor(tenant.tenantId).deleteOne({ userId });
      return { success: true };
    },
    requestCorrection: async (request: any, reply: any) => {
      const tenant = (request as AuthenticatedRequest).tenantContext;
      const sessionId = String(request.body?.sessionId ?? "").trim(), eventType = request.body?.eventType;
      const requestedAt = new Date(String(request.body?.requestedAt ?? ""));
      const reason = String(request.body?.reason ?? "").trim().slice(0, 1000);
      if (!sessionId || !(eventType === "clock_in" || eventType === "clock_out") || !Number.isFinite(requestedAt.getTime()) || !reason || reason.length < 5)
        return reply.code(400).send({ error: "Choose an entry/exit event, a valid requested time and a reason of at least 5 characters" });
      const session = await sessionsFor(tenant.tenantId).findOne({ id: sessionId, userId: tenant.userId });
      if (!session) return reply.code(404).send({ error: "Work session not found" });
      const event = session.events.find(item => item.type === eventType);
      if (!event) return reply.code(409).send({ error: "The requested event does not exist in this session" });
      if (eventType === "clock_out" && session.status !== "closed") return reply.code(409).send({ error: "You can only correct the exit of a closed session" });
      if (Math.abs(requestedAt.getTime() - event.occurredAt.getTime()) > 7 * 24 * 60 * 60 * 1000) return reply.code(400).send({ error: "A correction cannot move an event by more than seven days" });
      if (!isChronological(session, eventType, requestedAt)) return reply.code(400).send({ error: "The corrected time must remain before/after the other events in the work session" });
      const scopedCorrections = correctionsFor(tenant.tenantId);
      const pending = await scopedCorrections.findOne({ sessionId, userId: tenant.userId, eventType, status: "pending" });
      if (pending) return reply.code(409).send({ error: "There is already a pending correction for this event" });
      const now = new Date(), row: Omit<Correction, "tenantId"> = { id: randomUUID(), sessionId, userId: tenant.userId, eventType, originalAt: event.occurredAt, requestedAt, reason, status: "pending", createdAt: now };
      try { await scopedCorrections.insertOne(row); }
      catch (error) { if ((error as { code?: number }).code === 11000) return reply.code(409).send({ error: "There is already a pending correction for this event" }); throw error; }
      return reply.code(201).send({ correction: { id: row.id, eventType, originalAt: row.originalAt, requestedAt: row.requestedAt, reason, status: row.status, createdAt: row.createdAt } });
    },
    myCorrections: async (request: any) => {
      const tenant = (request as AuthenticatedRequest).tenantContext;
      const rows = await correctionsFor(tenant.tenantId).find({ userId: tenant.userId }).sort({ createdAt: -1 }).limit(50).toArray();
      return { corrections: rows.map(({ id, sessionId, eventType, originalAt, requestedAt, reason, status, createdAt, reviewedAt, reviewNote }) => ({ id, sessionId, eventType, originalAt, requestedAt, reason, status, createdAt, reviewedAt, reviewNote })) };
    },
    teamCorrections: async (request: any, reply: any) => {
      const tenant = (request as AuthenticatedRequest).tenantContext, status = request.query.status ?? "pending";
      if (!["pending", "approved", "rejected", "all"].includes(status)) return reply.code(400).send({ error: "Invalid correction status filter" });
      const filter: any = {}; if (status !== "all") filter.status = status;
      const rows = await correctionsFor(tenant.tenantId).find(filter).sort({ createdAt: 1 }).limit(200).toArray(), result = [];
      for (const row of rows) {
        const user = await users.findOne({ id: row.userId }, { projection: { email: 1 } });
        result.push({ id: row.id, sessionId: row.sessionId, userEmail: user?.email ?? "Unknown user", eventType: row.eventType, originalAt: row.originalAt, requestedAt: row.requestedAt, reason: row.reason, status: row.status, createdAt: row.createdAt, reviewedAt: row.reviewedAt, reviewNote: row.reviewNote });
      }
      return { corrections: result };
    },
    reviewCorrection: async (request: any, reply: any) => {
      const tenant = (request as AuthenticatedRequest).tenantContext, decision = request.body?.decision;
      if (decision !== "approved" && decision !== "rejected") return reply.code(400).send({ error: "Decision must be approved or rejected" });
      const scopedCorrections = correctionsFor(tenant.tenantId);
      const correction = await scopedCorrections.findOne({ id: request.params.correctionId, status: "pending" });
      if (!correction) return reply.code(404).send({ error: "Pending correction not found" });
      const reviewNote = String(request.body?.reviewNote ?? "").trim().slice(0, 1000), now = new Date();
      if (decision === "approved") {
        const scopedSessions = sessionsFor(tenant.tenantId);
        const session = await scopedSessions.findOne({ id: correction.sessionId, userId: correction.userId });
        if (!session) return reply.code(409).send({ error: "The original work session no longer exists" });
        const event = session.events.find(item => item.type === correction.eventType);
        if (!event || event.occurredAt.getTime() !== correction.originalAt.getTime()) return reply.code(409).send({ error: "The original event changed after the request; refresh the review queue" });
        if (!isChronological(session, correction.eventType, correction.requestedAt)) return reply.code(409).send({ error: "The requested time would make the work session events invalid" });
        const set: any = { "events.$[event].occurredAt": correction.requestedAt, updatedAt: now };
        if (correction.eventType === "clock_in") set.startedAt = correction.requestedAt; else set.endedAt = correction.requestedAt;
        const changed = await scopedSessions.updateOne(
          { id: session.id, userId: correction.userId },
          { $set: set },
          { arrayFilters: [{ "event.type": correction.eventType }] }
        );
        if (!changed.modifiedCount) return reply.code(409).send({ error: "The work session could not be updated" });
      }
      const changed = await scopedCorrections.updateOne(
        { id: correction.id, status: "pending" },
        { $set: { status: decision, reviewedAt: now, reviewedBy: tenant.userId, reviewNote } }
      );
      if (!changed.modifiedCount) return reply.code(409).send({ error: "This correction was already reviewed" });
      return { success: true, status: decision };
    }
  };
}
