import type { Collection, Document } from "mongodb";
import { TenantCollection } from "./tenant-collection.js";

export const AUDIT_ACTIONS = [
  "auth.login", "auth.logout", "auth.refresh.reuse", "auth.mfa.enrolled",
  "member.invited", "member.added", "member.role_changed", "member.removed", "member.suspended", "member.activated", "invitation.cancelled",
  "role.created", "role.updated", "role.deleted",
  "team.created", "team.updated", "team.deleted", "team.members.updated", "team.applications.updated", "resource.access.updated",
  "permission.denied",
  "plugin.installed", "plugin.updated", "plugin.uninstalled",
  "plugin.entitlement_granted", "plugin.entitlement_revoked", "subscription.updated"
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditEventInput = {
  id: string;
  tenantId: string;
  actorId: string;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  outcome: "success" | "denied";
  metadata?: Record<string, string | number | boolean | null>;
  occurredAt: Date;
};
export type AuditEventDraft = Omit<AuditEventInput, "id" | "occurredAt">;

export type TenantAuditEvent = Document & {
  id: string;
  tenantId: string;
  actorId: string;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  outcome: "success" | "denied";
  metadata?: Record<string, string | number | boolean | null>;
  occurredAt: Date;
};

const SAFE_METADATA_KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
const MAX_METADATA_ENTRIES = 20;

/** Append-only service surface; event documents are written tenant-scoped. */
export async function appendTenantAuditEvent(
  collection: Collection<TenantAuditEvent>,
  event: AuditEventInput
): Promise<void> {
  const metadata = event.metadata ?? {};
  if (Object.keys(metadata).length > MAX_METADATA_ENTRIES) throw new Error("Audit metadata entry limit exceeded");
  for (const [key, value] of Object.entries(metadata)) {
    if (!SAFE_METADATA_KEY.test(key)) throw new Error("Invalid audit metadata key");
    if (typeof value === "string" && value.length > 256) throw new Error("Audit metadata value too long");
  }
  const scoped = new TenantCollection(collection, event.tenantId);
  await scoped.insertOne({
    ...event,
    metadata: { ...metadata },
    occurredAt: event.occurredAt instanceof Date ? event.occurredAt : new Date(event.occurredAt)
  });
}

export async function ensureTenantAuditIndexes(collection: Collection<TenantAuditEvent>): Promise<void> {
  await collection.createIndex({ tenantId: 1, occurredAt: -1 }, { name: "audit_tenant_time" });
  await collection.createIndex({ tenantId: 1, occurredAt: -1, id: -1 }, { name: "audit_tenant_time_id" });
  await collection.createIndex({ tenantId: 1, actorId: 1, occurredAt: -1 }, { name: "audit_tenant_actor_time" });
  await collection.createIndex({ tenantId: 1, action: 1, occurredAt: -1 }, { name: "audit_tenant_action_time" });
}
