import type { CompanyRole } from "./tenant-context.js";

export const CUSTOM_ROLE_PERMISSION_PATTERN = /^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*$/;
export const MAX_CUSTOM_ROLE_PERMISSIONS = 100;

export type CustomRolePolicy = {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  permissions: string[];
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export type RolePolicy = {
  role: CompanyRole | "custom";
  permissions: readonly string[];
};

export function normalizeCustomRolePermissions(input: unknown): string[] {
  if (!Array.isArray(input)) throw new Error("Role permissions must be an array");
  if (input.length > MAX_CUSTOM_ROLE_PERMISSIONS) throw new Error("Too many permissions for a custom role");
  const normalized = input.map((item) => {
    if (typeof item !== "string") throw new Error("Role permissions must be strings");
    const permission = item.trim();
    if (!CUSTOM_ROLE_PERMISSION_PATTERN.test(permission)) throw new Error(`Invalid permission key: ${permission}`);
    return permission;
  });
  return [...new Set(normalized)].sort();
}

export function normalizeCustomRoleName(input: unknown): string {
  if (typeof input !== "string") throw new Error("Role name must be a string");
  const name = input.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 48) throw new Error("Role name must be between 2 and 48 characters");
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u.test(name)) throw new Error("Role name contains unsupported characters");
  return name;
}

export function permissionsForCustomRole(role: Pick<CustomRolePolicy, "permissions">): readonly string[] {
  return normalizeCustomRolePermissions(role.permissions);
}

export function hasPolicyPermission(policy: RolePolicy, permission: string): boolean {
  return policy.permissions.includes(permission);
}
