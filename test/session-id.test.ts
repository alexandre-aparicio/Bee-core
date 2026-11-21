import test from "node:test";
import assert from "node:assert/strict";
import { maskPluginId, maskResourceId, maskTenantId, transformSessionResourceIds, unmaskPluginId, unmaskResourceId, unmaskTenantId } from "../src/core/session-id.js";

const secret = "test-secret-that-is-long-enough-for-hmac-256";
const sessionA = { sessionId: "session-a", expiresAt: new Date(Date.now() + 60_000) };
const sessionB = { sessionId: "session-b", expiresAt: new Date(Date.now() + 60_000) };

test("references are opaque and resolve only in the originating session", () => {
  const masked = maskTenantId("internal-tenant-123", sessionA, secret);
  assert.notEqual(masked, "internal-tenant-123");
  assert.equal(unmaskTenantId(masked, sessionA, secret), "internal-tenant-123");
  assert.throws(() => unmaskTenantId(masked, sessionB, secret));
});

test("references stay stable in one session and rotate in a new session", () => {
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


test("recursive API translation masks typed resource IDs and rejects another session", () => {
  const payload = {
    company: { id: "tenant-internal", name: "Acme" },
    plugins: [{ id: "hello-world", name: "Hello World" }],
    memberships: [{ userId: "user-internal", customRoleId: "role-internal" }]
  };
  const masked = transformSessionResourceIds(payload, "mask", sessionA, secret);
  assert.notEqual(masked.company.id, "tenant-internal");
  assert.notEqual(masked.plugins[0].id, "hello-world");
  assert.notEqual(masked.memberships[0].userId, "user-internal");
  const restored = transformSessionResourceIds(masked, "unmask", sessionA, secret);
  assert.deepEqual(restored, payload);
  assert.throws(() => transformSessionResourceIds(masked, "unmask", sessionB, secret));
});
