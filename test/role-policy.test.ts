import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeCustomRolePermissions, normalizeTenantCustomRolePermissions, normalizeRestrictionPermissions, normalizeCustomRoleName, hasPolicyPermission, permissionsForCustomRole, applyPermissionRestrictions } from "../src/core/role-policy.js";
import { CORE_PERMISSION_CATALOG, CORE_PERMISSION_KEYS } from "../src/core/permission-catalog.js";
import { COMPANY_ROLE_PERMISSIONS } from "../src/core/tenant-context.js";

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


test("the core permission catalogue is unique and covers every built-in role permission", () => {
  const keys = CORE_PERMISSION_CATALOG.map(permission => permission.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual([...CORE_PERMISSION_KEYS].sort(), [...keys].sort());
  for (const rolePermissions of Object.values(COMPANY_ROLE_PERMISSIONS)) {
    for (const permission of rolePermissions) assert.ok(CORE_PERMISSION_KEYS.includes(permission), `Missing catalogue entry: ${permission}`);
  }
  assert.ok(!CORE_PERMISSION_KEYS.includes("platform.super_admin"));
});

test("tenant custom roles accept delegable permissions and reject protected capabilities", () => {
  const selected = ["notes.read", "files.read", "members.invite", "mail.read", "mail.send"];
  assert.deepEqual(normalizeTenantCustomRolePermissions(selected), [...selected].sort());
  for (const protectedPermission of ["members.manage", "plugins.manage", "billing.manage", "mail.manage"]) {
    assert.throws(() => normalizeTenantCustomRolePermissions([protectedPermission]), /protected permissions/);
  }
  assert.throws(() => normalizeTenantCustomRolePermissions(["platform.super_admin"]), /protected permissions/);
  assert.throws(() => normalizeTenantCustomRolePermissions(["tenants.manage"]), /protected permissions/);
});

test("platform policy can narrow tenant custom-role delegation without changing protected capabilities", () => {
  const allowed = ["members.read", "plugins.read", "notes.read"];
  assert.deepEqual(normalizeTenantCustomRolePermissions(["members.read", "notes.read"], allowed), ["members.read", "notes.read"]);
  assert.throws(() => normalizeTenantCustomRolePermissions(["mail.send"], allowed), /protected permissions/);
  assert.throws(() => normalizeTenantCustomRolePermissions(["members.manage"], allowed), /protected permissions/);
});

test("custom role effective permissions honor the current platform delegation policy", () => {
  const role = { permissions: ["notes.read", "files.write", "mail.send"] };
  assert.deepEqual(permissionsForCustomRole(role, ["notes.read", "files.write"]), ["notes.read", "files.write"]);
  assert.deepEqual(permissionsForCustomRole(role, ["notes.read"]), ["notes.read"]);
});


test("restriction roles are deny-only and can target protected capabilities", () => {
  const denied = normalizeRestrictionPermissions(["members.invite", "billing.manage", "members.invite"]);
  assert.deepEqual(denied, ["billing.manage", "members.invite"]);
  assert.throws(() => normalizeRestrictionPermissions(["unknown.create"]), /registered permissions/);
  assert.deepEqual(permissionsForCustomRole({ mode: "restriction", permissions: ["members.invite"] }), []);
});

test("explicit restriction roles override grants from the built-in role", () => {
  const base = COMPANY_ROLE_PERMISSIONS.admin;
  const effective = applyPermissionRestrictions(base, [
    { mode: "restriction", permissions: ["members.invite", "files.write"] },
    { mode: "restriction", permissions: ["mail.send"] }
  ]);
  assert.ok(effective.includes("members.read"));
  assert.ok(effective.includes("plugins.install"));
  assert.ok(!effective.includes("members.invite"));
  assert.ok(!effective.includes("files.write"));
  assert.ok(!effective.includes("mail.send"));
});

test("predefined Super Organization roles have safe defaults in source control", () => {
  assert.ok(COMPANY_ROLE_PERMISSIONS.super_admin.includes("billing.manage"));
  assert.ok(COMPANY_ROLE_PERMISSIONS.owner.includes("members.manage"));
  assert.ok(COMPANY_ROLE_PERMISSIONS.admin.includes("members.invite"));
  assert.ok(!COMPANY_ROLE_PERMISSIONS.admin.includes("billing.manage"));
  assert.ok(COMPANY_ROLE_PERMISSIONS.manager.includes("files.write"));
  assert.ok(!COMPANY_ROLE_PERMISSIONS.manager.includes("members.invite"));
  assert.ok(COMPANY_ROLE_PERMISSIONS.member.includes("members.read"));
  assert.ok(!COMPANY_ROLE_PERMISSIONS.member.includes("members.invite"));
  assert.deepEqual(COMPANY_ROLE_PERMISSIONS.guest, ["plugins.read"]);
});
