import { randomUUID } from "node:crypto";
import type { Collection, Db, Document } from "mongodb";
import { TenantCollection } from "./tenant-collection.js";

export const AUDIT_ACTIONS = [
  "auth.login", "auth.logout", "auth.refresh.reuse", "auth.mfa.enrolled",
  "member.invited", "member.added", "member.role_changed", "member.removed", "member.suspended", "member.activated", "invitation.cancelled",
  "role.created", "role.updated", "role.deleted",
  "team.created", "team.updated", "team.deleted", "team.members.updated", "team.applications.updated", "resource.access.updated", "resource.access.reset",
  "permission.denied",
  "plugin.installed", "plugin.updated", "plugin.uninstalled", "plugin.enabled", "plugin.disabled",
  "plugin.entitlement_granted", "plugin.entitlement_revoked", "subscription.updated",
  "device.approved", "device.suspended", "device.reactivated", "device.revoked", "device.unlinked"
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
  await collection.createIndex({ tenantId: 1, id: 1 }, { unique: true, name: "audit_tenant_event_id_unique" });
  await collection.createIndex({ tenantId: 1, occurredAt: -1 }, { name: "audit_tenant_time" });
  await collection.createIndex({ tenantId: 1, occurredAt: -1, id: -1 }, { name: "audit_tenant_time_id" });
  await collection.createIndex({ tenantId: 1, actorId: 1, occurredAt: -1 }, { name: "audit_tenant_actor_time" });
  await collection.createIndex({ tenantId: 1, action: 1, occurredAt: -1 }, { name: "audit_tenant_action_time" });
}


export type TenantAuditOutboxStatus = "prepared" | "committed" | "delivered" | "cancelled";
export type TenantAuditOutboxRecord = Document & AuditEventInput & {
  status: TenantAuditOutboxStatus;
  createdAt: Date;
  idempotencyKey?: string;
  attempts: number;
  lastError?: string;
};

export async function ensureTenantAuditOutboxIndexes(collection: Collection<TenantAuditOutboxRecord>): Promise<void> {
  await collection.createIndex({ id: 1 }, { unique: true, name: "audit_outbox_id_unique" });
  await collection.createIndex({ status: 1, createdAt: 1 }, { name: "audit_outbox_dispatch" });
  await collection.createIndex({ idempotencyKey: 1 }, {
    unique: true,
    name: "audit_outbox_idempotency_unique",
    partialFilterExpression: { idempotencyKey: { $type: "string" } }
  });
}

/**
 * Persist an audit intent before changing the resource. The resource transition
 * must add this event ID to its pendingAuditEventIds field in the same update
 * that changes its state. The dispatcher can then recover a crash between the
 * resource write and the outbox status update without a MongoDB transaction.
 */
export async function prepareTenantAuditOutboxEvent(
  collection: Collection<TenantAuditOutboxRecord>,
  event: Omit<AuditEventInput, "id" | "occurredAt"> & { idempotencyKey?: string }
): Promise<TenantAuditOutboxRecord> {
  if (event.idempotencyKey) {
    const existing = await collection.findOne({ idempotencyKey: event.idempotencyKey });
    if (existing) return existing;
  }
  const now = new Date();
  const record: TenantAuditOutboxRecord = {
    id: randomUUID(),
    tenantId: event.tenantId,
    actorId: event.actorId,
    action: event.action,
    ...(event.resourceType ? { resourceType: event.resourceType } : {}),
    ...(event.resourceId ? { resourceId: event.resourceId } : {}),
    outcome: event.outcome,
    ...(event.metadata ? { metadata: { ...event.metadata } } : {}),
    occurredAt: now,
    status: "prepared",
    createdAt: now,
    attempts: 0,
    ...(event.idempotencyKey ? { idempotencyKey: event.idempotencyKey } : {})
  };
  try {
    await collection.insertOne(record);
    return record;
  } catch (error) {
    if ((error as { code?: number }).code === 11000 && event.idempotencyKey) {
      const existing = await collection.findOne({ idempotencyKey: event.idempotencyKey });
      if (existing) return existing;
    }
    throw error;
  }
}

export async function commitTenantAuditOutboxEvent(
  collection: Collection<TenantAuditOutboxRecord>,
  id: string
): Promise<void> {
  await collection.updateOne({ id, status: "prepared" }, { $set: { status: "committed", committedAt: new Date() } });
}

export async function cancelTenantAuditOutboxEvent(
  collection: Collection<TenantAuditOutboxRecord>,
  id: string
): Promise<void> {
  await collection.updateOne({ id, status: "prepared" }, { $set: { status: "cancelled", cancelledAt: new Date() } });
}

/**
 * Deliver committed audit intents idempotently. Prepared device events are
 * promoted only when the device carries their commit marker; plugin.uninstalled
 * intents are promoted only after the durable lifecycle job succeeds.
 */
export async function dispatchTenantAuditOutbox(
  db: Db,
  logger?: { error: (message: string, context?: Record<string, unknown>) => void }
): Promise<void> {
  const outbox = db.collection<TenantAuditOutboxRecord>("tenant_audit_outbox");
  const events = await outbox.find({ status: { $in: ["prepared", "committed"] } }).sort({ createdAt: 1 }).limit(100).toArray();
  for (const event of events) {
    try {
      if (event.status === "prepared") {
        let committed = false;
        if (event.action.startsWith("device.") && event.resourceId) {
          const device = await db.collection("connected_devices").findOne({
            tenantId: event.tenantId,
            id: event.resourceId,
            pendingAuditEventIds: event.id
          }, { projection: { _id: 1 } });
          committed = Boolean(device);
        } else if (event.action === "plugin.uninstalled" && event.resourceId && typeof event.metadata?.jobId === "string") {
          const job = await db.collection("plugin_install_jobs").findOne({
            id: event.metadata.jobId,
            tenantId: event.tenantId,
            pluginId: event.resourceId,
            action: "uninstall"
          }, { projection: { status: 1 } });
          if (job?.status === "failed") {
            await outbox.updateOne({ id: event.id, status: "prepared" }, { $set: { status: "cancelled", cancelledAt: new Date() } });
            continue;
          }
          committed = job?.status === "succeeded";
        }
        if (!committed) continue;
        await outbox.updateOne({ id: event.id, status: "prepared" }, { $set: { status: "committed", committedAt: new Date() } });
      }

      try {
        await appendTenantAuditEvent(db.collection<TenantAuditEvent>("tenant_audit_events"), {
          id: event.id,
          tenantId: event.tenantId,
          actorId: event.actorId,
          action: event.action,
          ...(event.resourceType ? { resourceType: event.resourceType } : {}),
          ...(event.resourceId ? { resourceId: event.resourceId } : {}),
          outcome: event.outcome,
          ...(event.metadata ? { metadata: event.metadata } : {}),
          occurredAt: event.occurredAt
        });
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
      }

      await outbox.updateOne({ id: event.id, status: "committed" }, {
        $set: { status: "delivered", deliveredAt: new Date() },
        $inc: { attempts: 1 },
        $unset: { lastError: "" }
      });
      if (event.action.startsWith("device.") && event.resourceId) {
        await db.collection<{ tenantId: string; id: string; pendingAuditEventIds?: string[] }>("connected_devices").updateOne(
          { tenantId: event.tenantId, id: event.resourceId },
          { $pull: { pendingAuditEventIds: event.id } }
        );
      }
    } catch (error) {
      await outbox.updateOne({ id: event.id, status: { $in: ["prepared", "committed"] } }, {
        $inc: { attempts: 1 },
        $set: { lastError: error instanceof Error ? error.message.slice(0, 256) : "Audit outbox delivery failed", lastAttemptAt: new Date() }
      }).catch(() => undefined);
      logger?.error("Tenant audit outbox delivery failed", { eventId: event.id, action: event.action, tenantId: event.tenantId, error });
    }
  }
}
