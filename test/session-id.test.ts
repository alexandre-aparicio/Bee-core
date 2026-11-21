import test from "node:test";
import assert from "node:assert/strict";
import { maskPluginId, maskResourceId, maskTenantId, unmaskPluginId, unmaskResourceId, unmaskTenantId } from "../src/core/session-id.js";

const secret = "test-secret-that-is-long-enough-for-hmac-256";
const sessionA = { sessionId: "session-a", expiresAt: new Date(Date.now() + 60_000) };
const sessionB = { sessionId: "session-b", expiresAt: new Date(Date.now() + 60_000) };

test("references are opaque and resolve only in the originating session", () => {
  const masked = maskTenantId("internal-tenant-123", sessionA, secret);
  assert.notEqual(masked, "internal-tenant-123");
  assert.equal(unmaskTenantId(masked, sessionA, secret), "internal-tenant-123");
  assert.throws(() => unmaskTenantId(masked, sessionB, secret));
});

test("references are stable within one session and differ across sessions", () => {
  const first = maskPluginId("hello-world", sessionA, secret);
  const second = maskPluginId("hello-world", sessionA, secret);
  assert.equal(first, second);
  assert.notEqual(first, maskPluginId("hello-world", sessionB, secret));
  assert.equal(unmaskPluginId(first, sessionA, secret), "hello-world");
  assert.equal(unmaskPluginId(second, sessionA, secret), "hello-world");
});

test("resource type substitution and tampering are rejected", () => {
  const masked = maskTenantId("tenant-1", sessionA, secret);
  assert.throws(() => unmaskPluginId(masked, sessionA, secret));
  const tampered = masked.slice(0, -1) + (masked.endsWith("a") ? "b" : "a");
  assert.throws(() => unmaskTenantId(tampered, sessionA, secret));
});

test("expired references and expired sessions are rejected", () => {
  const expiredSession = { sessionId: "expired", expiresAt: new Date(Date.now() - 1000) };
  assert.throws(() => maskResourceId("x", "tenant", expiredSession, secret));
  assert.throws(() => unmaskResourceId("not-a-reference", "tenant", expiredSession, secret));
});

test("a reference cannot outlive its issuing session expiry", () => {
  const shortSession = { sessionId: "short", expiresAt: new Date(Date.now() + 60_000) };
  const masked = maskTenantId("tenant-1", shortSession, secret);
  assert.throws(() => unmaskTenantId(masked, { ...shortSession, expiresAt: new Date(Date.now() - 1000) }, secret));
});


test("malformed and oversized references are rejected before decryption", () => {
  assert.throws(() => unmaskResourceId("not a reference!", "tenant", sessionA, secret));
  assert.throws(() => unmaskResourceId("A".repeat(2049), "tenant", sessionA, secret));
  assert.throws(() => unmaskResourceId("====", "tenant", sessionA, secret));
});

test("resource IDs must be non-empty and bounded", () => {
  assert.throws(() => maskResourceId("", "tenant", sessionA, secret));
  assert.throws(() => maskResourceId("x".repeat(1025), "tenant", sessionA, secret));
});


test("resource references use compact URL-safe encoding", () => {
  const masked = maskTenantId("550e8400-e29b-41d4-a716-446655440000", sessionA, secret);
  assert.ok(masked.length < 128, `expected compact reference, got ${masked.length} characters`);
  assert.equal(unmaskTenantId(masked, sessionA, secret), "550e8400-e29b-41d4-a716-446655440000");
});
