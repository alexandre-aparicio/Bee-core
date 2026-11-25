import { test } from "node:test";
import assert from "node:assert/strict";
import { isChronological, normalizeOperationId, normalizeSource, validateScheduleDays } from "../src/plugins/time-tracking/time-tracking.service.js";
import type { TimeSession } from "../src/plugins/time-tracking/time-tracking.repository.js";

test("operation identifiers are trimmed, bounded and reject empty values", () => {
  assert.equal(normalizeOperationId("  retry-123  "), "retry-123");
  assert.equal(normalizeOperationId("x".repeat(120)).length, 100);
  assert.equal(normalizeOperationId("   "), "");
  assert.equal(normalizeOperationId(undefined), "");
});

test("clock source accepts Android explicitly and defaults unknown input to web", () => {
  assert.equal(normalizeSource("android"), "android");
  assert.equal(normalizeSource("web"), "web");
  assert.equal(normalizeSource("ios"), "web");
  assert.equal(normalizeSource(null), "web");
});

test("weekly schedules accept seven unique days and normalize their order", () => {
  const days = [
    { day: 5, start: "09:00", end: "17:00", breakMinutes: 30 },
    { day: 1, start: "08:30", end: "16:30", breakMinutes: 45 }
  ];
  assert.deepEqual(validateScheduleDays(days), [days[1], days[0]]);
  assert.deepEqual(validateScheduleDays([]), []);
  assert.equal(validateScheduleDays(Array.from({ length: 8 }, (_, day) => ({ day, start: "09:00", end: "17:00", breakMinutes: 0 }))), null);
});

test("weekly schedule validation rejects duplicate days and invalid time ranges", () => {
  const valid = { day: 1, start: "09:00", end: "17:00", breakMinutes: 30 };
  assert.equal(validateScheduleDays([valid, valid]), null);
  assert.equal(validateScheduleDays([{ ...valid, day: 7 }]), null);
  assert.equal(validateScheduleDays([{ ...valid, start: "9:00" }]), null);
  assert.equal(validateScheduleDays([{ ...valid, end: "08:59" }]), null);
  assert.equal(validateScheduleDays([{ ...valid, end: "09:00" }]), null);
  assert.equal(validateScheduleDays([{ ...valid, breakMinutes: -1 }]), null);
  assert.equal(validateScheduleDays([{ ...valid, breakMinutes: 241 }]), null);
  assert.equal(validateScheduleDays([{ ...valid, breakMinutes: 15.5 }]), null);
});

function session(): TimeSession {
  const start = new Date("2026-11-25T08:00:00.000Z");
  return {
    id: "session-1", tenantId: "tenant-a", userId: "user-a", status: "closed", active: false,
    startedAt: start, endedAt: new Date("2026-11-25T17:00:00.000Z"),
    events: [
      { id: "1", type: "clock_in", occurredAt: start, source: "web", operationId: "in" },
      { id: "2", type: "break_start", occurredAt: new Date("2026-11-25T12:00:00.000Z"), source: "web", operationId: "bs" },
      { id: "3", type: "break_end", occurredAt: new Date("2026-11-25T12:30:00.000Z"), source: "web", operationId: "be" },
      { id: "4", type: "clock_out", occurredAt: new Date("2026-11-25T17:00:00.000Z"), source: "web", operationId: "out" }
    ],
    createdAt: start, updatedAt: start
  } as TimeSession;
}

test("entry corrections must remain before every other event", () => {
  const row = session();
  assert.equal(isChronological(row, "clock_in", new Date("2026-11-25T07:59:00.000Z")), true);
  assert.equal(isChronological(row, "clock_in", new Date("2026-11-25T12:15:00.000Z")), false);
  assert.equal(isChronological(row, "clock_in", new Date("2026-11-25T17:01:00.000Z")), false);
});

test("exit corrections must remain after every other event", () => {
  const row = session();
  assert.equal(isChronological(row, "clock_out", new Date("2026-11-25T17:01:00.000Z")), true);
  assert.equal(isChronological(row, "clock_out", new Date("2026-11-25T12:15:00.000Z")), false);
  assert.equal(isChronological(row, "clock_out", new Date("2026-11-25T07:59:00.000Z")), false);
});
