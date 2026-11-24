import type { BeePlugin } from "../../core/types.js";
import type { Db, Document } from "mongodb";
import { randomUUID } from "node:crypto";
import { TenantCollection } from "../../core/tenant-collection.js";
import { requireAuth, requireTenantPermissions, type AuthenticatedRequest } from "../auth/auth.guard.js";
import { hasTenantPermission } from "../../core/tenant-context.js";
import { requireInstalledPlugin } from "../../core/plugin-entitlements.js";
import { maskResourceId, unmaskResourceId } from "../../core/session-id.js";

type DeliveryStatus = "draft" | "assigned" | "picked_up" | "in_transit" | "delivered" | "failed" | "cancelled";
type DeliveryKind = "delivery" | "pickup";
type DeliveryRecord = Document & {
  id: string; tenantId: string; reference: string; kind: DeliveryKind; status: DeliveryStatus;
  recipient: string; phone: string; address: string; notes: string; assignedTo: string | null;
  plannedAt: Date | null; createdBy: string; createdAt: Date; updatedAt: Date;
  pickedUpAt: Date | null; completedAt: Date | null;
};

const STATUSES: DeliveryStatus[] = ["draft","assigned","picked_up","in_transit","delivered","failed","cancelled"];
const TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  draft: ["assigned","cancelled"], assigned: ["picked_up","in_transit","failed","cancelled"],
  picked_up: ["in_transit","failed","cancelled"], in_transit: ["delivered","failed"],
  delivered: [], failed: ["assigned","cancelled"], cancelled: []
};
export function deliveryVisibilityFilter(userId: string, canManage: boolean, assignment: "all" | "mine" | "unassigned" = "all"): Record<string, unknown> {
  if (!canManage) return { assignedTo: userId };
  if (assignment === "mine") return { assignedTo: userId };
  if (assignment === "unassigned") return { assignedTo: null };
  return {};
}
export function canTransitionDelivery(from: DeliveryStatus, to: DeliveryStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export const deliveriesPlugin: BeePlugin = {
  manifest: {
    name: "deliveries", version: "0.1.0",
    description: "Tenant-scoped delivery and pickup operations, assignments and status tracking",
    dependencies: ["auth", "organizations", "marketplace"],
    scope: "tenant", activationPolicy: "manual",
    frontend: { routes: [{ path: "/dashboard/deliveries", component: "bee-deliveries" }] }
  },
  async initialize(ctx) {
    const db: Db = ctx.mongoClient.db(String(ctx.config.mongoDbName ?? "bee_core"));
    const secret = String(ctx.config.sessionIdSecret ?? "");
    if (secret.length < 32) throw new Error("Deliveries requires the session resource ID secret.");
    const raw = db.collection<DeliveryRecord>("tenant_deliveries");
    await Promise.all([
      raw.createIndex({ tenantId: 1, id: 1 }, { unique: true, name: "tenant_deliveries_tenant_id_unique" }),
      raw.createIndex({ tenantId: 1, status: 1, updatedAt: -1 }, { name: "tenant_deliveries_status_updated" }),
      raw.createIndex({ tenantId: 1, assignedTo: 1, status: 1 }, { name: "tenant_deliveries_assignee_status" }),
      raw.createIndex({ tenantId: 1, reference: 1 }, { unique: true, name: "tenant_deliveries_reference_unique" })
    ]);
    const rows = (tenantId: string) => new TenantCollection<DeliveryRecord>(raw, tenantId);
    const read = [requireAuth(db, "dashboard", secret), requireTenantPermissions("deliveries.read"), requireInstalledPlugin(db, "deliveries")];
    const write = [requireAuth(db, "dashboard", secret), requireTenantPermissions("deliveries.write"), requireInstalledPlugin(db, "deliveries")];
    const execute = [requireAuth(db, "dashboard", secret), requireTenantPermissions("deliveries.execute"), requireInstalledPlugin(db, "deliveries")];
    const manage = [requireAuth(db, "dashboard", secret), requireTenantPermissions("deliveries.manage"), requireInstalledPlugin(db, "deliveries")];
    const publicRecord = (item: DeliveryRecord, tenant: AuthenticatedRequest["tenantContext"]) => ({
      id: maskResourceId(item.id, "delivery", { sessionId: tenant.sessionId, expiresAt: tenant.sessionExpiresAt }, secret),
      assignedToId: item.assignedTo ? maskResourceId(item.assignedTo, "user", { sessionId: tenant.sessionId, expiresAt: tenant.sessionExpiresAt }, secret) : null,
      reference: item.reference, kind: item.kind, status: item.status, recipient: item.recipient,
      phone: item.phone, address: item.address, notes: item.notes, assignedToMe: item.assignedTo === tenant.userId, assigned: Boolean(item.assignedTo),
      plannedAt: item.plannedAt, createdAt: item.createdAt, updatedAt: item.updatedAt,
      pickedUpAt: item.pickedUpAt, completedAt: item.completedAt
    });
    const resolveId = (value: string, tenant: AuthenticatedRequest["tenantContext"]): string | null => {
      try { return unmaskResourceId(value, "delivery", { sessionId: tenant.sessionId, expiresAt: tenant.sessionExpiresAt }, secret); }
      catch { return null; }
    };
    const clean = (value: unknown, max: number) => String(value ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);

    ctx.server.get("/deliveries", { preHandler: read }, async request => {
      const tenant = (request as AuthenticatedRequest).tenantContext;
      const query = request.query as { status?: string; assignment?: "all" | "mine" | "unassigned" };
      const canManageDeliveries = hasTenantPermission(tenant, "deliveries.manage");
      const requestedAssignment = String(query.assignment ?? "all");
      const assignment: "all" | "mine" | "unassigned" = requestedAssignment === "mine" || requestedAssignment === "unassigned" ? requestedAssignment : "all";
      const filter: any = deliveryVisibilityFilter(tenant.userId, canManageDeliveries, assignment);
      if (query.status && STATUSES.includes(query.status as DeliveryStatus)) filter.status = query.status;
      const items = await rows(tenant.tenantId).find(filter).sort({ updatedAt: -1 }).limit(300).toArray();
      return { deliveries: items.map(item => publicRecord(item, tenant)) };
    });

    ctx.server.post<{ Body: { kind?: string; recipient?: string; phone?: string; address?: string; notes?: string; plannedAt?: string } }>("/deliveries", { preHandler: write }, async (request, reply) => {
      const tenant = (request as AuthenticatedRequest).tenantContext;
      const body = request.body ?? {};
      const kind = body.kind === "pickup" ? "pickup" : body.kind === "delivery" ? "delivery" : null;
      const recipient = clean(body.recipient, 120), address = clean(body.address, 500);
      const phone = clean(body.phone, 40), notes = clean(body.notes, 2000);
      if (!kind || !recipient || !address) return reply.code(400).send({ error: "Choose delivery or pickup and provide recipient and address." });
      const plannedAt = body.plannedAt ? new Date(body.plannedAt) : null;
      if (plannedAt && Number.isNaN(plannedAt.getTime())) return reply.code(400).send({ error: "Invalid planned date." });
      const now = new Date();
      const item: Omit<DeliveryRecord, "tenantId"> = {
        id: randomUUID(), reference: "ENT-" + now.toISOString().slice(0,10).replace(/-/g,"") + "-" + randomUUID().slice(0,6).toUpperCase(),
        kind, status: "draft", recipient, phone, address, notes, assignedTo: null, plannedAt,
        createdBy: tenant.userId, createdAt: now, updatedAt: now, pickedUpAt: null, completedAt: null
      };
      await rows(tenant.tenantId).insertOne(item);
      return reply.code(201).send({ delivery: publicRecord(item as DeliveryRecord, tenant) });
    });

    ctx.server.patch<{ Params: { deliveryId: string }; Body: { status?: string; assignedToMe?: boolean; assignedToUserId?: string | null } }>("/deliveries/:deliveryId", { preHandler: execute }, async (request, reply) => {
      const tenant = (request as AuthenticatedRequest).tenantContext;
      const id = resolveId(request.params.deliveryId, tenant);
      if (!id) return reply.code(404).send({ error: "Delivery not found." });
      const item = await rows(tenant.tenantId).findOne({ id });
      if (!item) return reply.code(404).send({ error: "Delivery not found." });
      const body = request.body ?? {};
      const now = new Date();
      const update: Partial<DeliveryRecord> = { updatedAt: now };
      if (body.assignedToMe === true || Object.prototype.hasOwnProperty.call(body, "assignedToUserId")) {
        if (!hasTenantPermission(tenant, "deliveries.manage")) return reply.code(403).send({ error: "Delivery management permission required." });
        let assigneeId: string | null = tenant.userId;
        if (Object.prototype.hasOwnProperty.call(body, "assignedToUserId")) {
          if (body.assignedToUserId === null || body.assignedToUserId === "") assigneeId = null;
          else {
            try { assigneeId = unmaskResourceId(String(body.assignedToUserId), "user", { sessionId: tenant.sessionId, expiresAt: tenant.sessionExpiresAt }, secret); }
            catch { return reply.code(404).send({ error: "Company member not found." }); }
            const [membership, user] = await Promise.all([
              db.collection("memberships").findOne({ tenantId: tenant.tenantId, userId: assigneeId, status: "active" }, { projection: { _id: 1 } }),
              db.collection("users").findOne({ id: assigneeId, enabled: true }, { projection: { _id: 1 } })
            ]);
            if (!membership || !user) return reply.code(404).send({ error: "Company member not found or inactive." });
          }
        }
        update.assignedTo = assigneeId;
        if (assigneeId && (item.status === "draft" || item.status === "failed")) update.status = "assigned";
        if (!assigneeId && item.status === "assigned") update.status = "draft";
      }
      if (body.status !== undefined) {
        const next = String(body.status) as DeliveryStatus;
        if (!STATUSES.includes(next) || !canTransitionDelivery(item.status, next)) return reply.code(409).send({ error: "This delivery status transition is not allowed." });
        if (!hasTenantPermission(tenant, "deliveries.manage") && item.assignedTo !== tenant.userId) return reply.code(403).send({ error: "Only the assigned member or a delivery manager can update this delivery." });
        update.status = next;
        if (next === "picked_up") update.pickedUpAt = now;
        if (next === "delivered" || next === "failed" || next === "cancelled") update.completedAt = now;
      }
      const changed = await rows(tenant.tenantId).updateOne({ id }, { $set: update });
      if (!changed.matchedCount) return reply.code(404).send({ error: "Delivery not found." });
      const result = await rows(tenant.tenantId).findOne({ id });
      if (!result) return reply.code(404).send({ error: "Delivery not found." });
      return { delivery: publicRecord(result, tenant) };
    });

    ctx.server.delete<{ Params: { deliveryId: string } }>("/deliveries/:deliveryId", { preHandler: manage }, async (request, reply) => {
      const tenant = (request as AuthenticatedRequest).tenantContext;
      const id = resolveId(request.params.deliveryId, tenant);
      if (!id) return reply.code(404).send({ error: "Delivery not found." });
      const result = await rows(tenant.tenantId).deleteOne({ id, status: { $in: ["draft", "cancelled"] } });
      if (!result.deletedCount) return reply.code(409).send({ error: "Only draft or cancelled deliveries can be deleted." });
      return { success: true };
    });
    ctx.logger.info("Deliveries plugin initialized: tenant-scoped delivery and pickup workflow ready.");
  }
};
