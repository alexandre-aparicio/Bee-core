import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeCustomRolePermissions, normalizeTenantCustomRolePermissions, normalizeCustomRoleName, hasPolicyPermission } from "../src/core/role-policy.js";

test("custom role permission normalization validates, deduplicates and sorts", () => {
  assert.deepEqual(normalizeCustomRolePermissions(["notes.read", "files.write", "notes.read"]), ["files.write", "notes.read"]);
});
test("custom role permissions reject malformed keys and oversized arrays", () => {
  assert.throws(() => normalizeCustomRolePermissions(["*"]), /Invalid permission key/);
  assert.throws(() => normalizeCustomRolePermissions(new Array(101).fill("files.read")), /Too many permissions/);
  assert.throws(() => normalizeCustomRolePermissions("files.read"), /array/);
});
test("role names are trimmed and constrained", () => {
  assert.equal(normalizeCustomRoleName("  Project   Editor "), "Project Editor");
  assert.throws(() => normalizeCustomRoleName("x"), /between 2 and 48/);
  assert.throws(() => normalizeCustomRoleName("Editor*"), /unsupported/);
});
test("policy permission check is exact (no implicit wildcards)", () => {
  const policy = { role: "custom" as const, permissions: ["notes.read"] };
  assert.equal(hasPolicyPermission(policy, "notes.read"), true);
  assert.equal(hasPolicyPermission(policy, "notes.write"), false);
  assert.equal(hasPolicyPermission(policy, "notes.*"), false);
});


test("tenant custom role permission allowlist blocks privilege escalation", () => {
  assert.deepEqual(normalizeTenantCustomRolePermissions(["notes.read", "files.read"]), ["files.read", "notes.read"]);
  assert.throws(() => normalizeTenantCustomRolePermissions(["members.manage"]), /protected permissions/);
  assert.throws(() => normalizeTenantCustomRolePermissions(["billing.manage"]), /protected permissions/);
});
