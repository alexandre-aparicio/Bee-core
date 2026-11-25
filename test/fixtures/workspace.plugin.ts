import type { BeePlugin } from "../../src/core/types.js";
import type { Db, Document } from "mongodb";
import { randomUUID } from "node:crypto";
import { TenantCollection } from "../../src/core/tenant-collection.js";
import { hasPluginEntitlement, isPluginEnabled, isPluginInstalled } from "../../src/core/plugin-entitlements.js";
import { maskResourceId, unmaskResourceId } from "../../src/core/session-id.js";
import { requireAuth, requireTenantPermissions, type AuthenticatedRequest } from "../../src/plugins/auth/auth.guard.js";

type WorkspaceItem = Document & {
  id: string;
  tenantId: string;
  title: string;
  content: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export const workspacePlugin: BeePlugin = {
  manifest: {
    name: "workspace",
    version: "0.1.0",
    description: "Test-only tenant-scoped workspace fixture",
    dependencies: ["auth", "organizations", "marketplace"]
  },
  async initialize(ctx) {
    const db: Db = ctx.mongoClient.db(String(ctx.config.mongoDbName ?? "bee_core"));
    const secret = String(ctx.config.sessionIdSecret ?? ctx.config.jwtSecret ?? "");
    const collection = (tenantId: string) => new TenantCollection<WorkspaceItem>(db.collection<WorkspaceItem>("tenant_workspace_items"), tenantId);
    const installed = async (request: any, reply: any) => {
      const tenant = (request as AuthenticatedRequest).tenantContext;
      if (!tenant || !await hasPluginEntitlement(db, tenant.tenantId, "workspace") ||
          !await isPluginInstalled(db, tenant.tenantId, "workspace") ||
          !await isPluginEnabled(db, tenant.tenantId, "workspace")) {
        return reply.code(403).send({ error: "Workspace is not available for this company" });
      }
    };
    const read = [requireAuth(db, "dashboard", secret), requireTenantPermissions("files.read"), installed];
    const write = [requireAuth(db, "dashboard", secret), requireTenantPermissions("files.write"), installed];
    const publicItem = (item: WorkspaceItem, tenant: AuthenticatedRequest["tenantContext"]) => ({
      id: maskResourceId(item.id, "document", { sessionId: tenant.sessionId, expiresAt: tenant.sessionExpiresAt }, secret),
      title: item.title,
      content: item.content,
      createdBy: maskResourceId(item.createdBy, "user", { sessionId: tenant.sessionId, expiresAt: tenant.sessionExpiresAt }, secret),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    });
    const resolveId = (reference: string, tenant: AuthenticatedRequest["tenantContext"]) => {
      try { return unmaskResourceId(reference, "document", { sessionId: tenant.sessionId, expiresAt: tenant.sessionExpiresAt }, secret); }
      catch { return null; }
    };
    ctx.server.get("/workspace-items", { preHandler: read }, async request => {
      const tenant = (request as AuthenticatedRequest).tenantContext;
      const rows = await collection(tenant.tenantId).find({}).sort({ updatedAt: -1 }).toArray();
      return { items: rows.map(row => publicItem(row, tenant)) };
    });
    ctx.server.post<{ Body: { title?: string; content?: string } }>("/workspace-items", { preHandler: write }, async (request, reply) => {
      const tenant = (request as AuthenticatedRequest).tenantContext;
      const title = String(request.body?.title ?? "").trim();
      const content = String(request.body?.content ?? "").trim();
      if (!title || title.length > 120 || content.length > 5000) return reply.code(400).send({ error: "A valid title and content are required" });
      const now = new Date();
      const item: Omit<WorkspaceItem, "tenantId"> = { id: randomUUID(), title, content, createdBy: tenant.userId, createdAt: now, updatedAt: now };
      await collection(tenant.tenantId).insertOne(item);
      return reply.code(201).send({ item: publicItem(item as WorkspaceItem, tenant) });
    });
    ctx.server.get<{ Params: { itemId: string } }>("/workspace-items/:itemId", { preHandler: read }, async (request, reply) => {
      const tenant = (request as AuthenticatedRequest).tenantContext;
      const id = resolveId(request.params.itemId, tenant);
      if (!id) return reply.code(404).send({ error: "Item not found" });
      const item = await collection(tenant.tenantId).findOne({ id });
      if (!item) return reply.code(404).send({ error: "Item not found" });
      return { item: publicItem(item, tenant) };
    });
    ctx.server.put<{ Params: { itemId: string }; Body: { title?: string; content?: string } }>("/workspace-items/:itemId", { preHandler: write }, async (request, reply) => {
      const tenant = (request as AuthenticatedRequest).tenantContext;
      const id = resolveId(request.params.itemId, tenant);
      if (!id) return reply.code(404).send({ error: "Item not found" });
      const title = String(request.body?.title ?? "").trim();
      const content = String(request.body?.content ?? "").trim();
      if (!title || title.length > 120 || content.length > 5000) return reply.code(400).send({ error: "A valid title and content are required" });
      const result = await collection(tenant.tenantId).updateOne({ id }, { $set: { title, content, updatedAt: new Date() } });
      if (!result.matchedCount) return reply.code(404).send({ error: "Item not found" });
      return { success: true };
    });
    ctx.server.delete<{ Params: { itemId: string } }>("/workspace-items/:itemId", { preHandler: write }, async (request, reply) => {
      const tenant = (request as AuthenticatedRequest).tenantContext;
      const id = resolveId(request.params.itemId, tenant);
      if (!id) return reply.code(404).send({ error: "Item not found" });
      const result = await collection(tenant.tenantId).deleteOne({ id });
      if (!result.deletedCount) return reply.code(404).send({ error: "Item not found" });
      return { success: true };
    });
  }
};
