import type { BeePlugin } from "../../core/types.js";
import { MongoClient, type Db, type Document } from "mongodb";
import { randomUUID } from "node:crypto";
import { TenantCollection } from "../../core/tenant-collection.js";
import { requireAuth, requireTenantPermissions, type AuthenticatedRequest } from "../auth/auth.guard.js";
import { requireInstalledPlugin } from "../../core/plugin-entitlements.js";

type Note = Document & {
  id: string;
  tenantId: string;
  title: string;
  content: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

let mongoClient: MongoClient | undefined;

export const notesPlugin: BeePlugin = {
  manifest: {
    name: "notes",
    version: "0.1.0",
    description: "Tenant-scoped team notes",
    dependencies: ["auth", "organizations", "marketplace"]
  },
  async initialize(ctx) {
    const mongoUri = String(ctx.config.mongoUri ?? "");
    const dbName = String(ctx.config.mongoDbName ?? "bee_core");
    mongoClient = new MongoClient(mongoUri, { maxPoolSize: 10, serverSelectionTimeoutMS: 10000 });
    await mongoClient.connect();
    const db: Db = mongoClient.db(dbName);
    const collection = (tenantId: string) => new TenantCollection<Note>(db.collection<Note>("tenant_notes"), tenantId);
    const preRead = [requireAuth(db, "dashboard"), requireTenantPermissions("notes.read"), requireInstalledPlugin(db, "notes")];
    const preWrite = [requireAuth(db, "dashboard"), requireTenantPermissions("notes.write"), requireInstalledPlugin(db, "notes")];

    ctx.server.get("/notes", { preHandler: preRead }, async request => {
      const tenant = (request as AuthenticatedRequest).tenantContext;
      const rows = await collection(tenant.tenantId).find({}).sort({ updatedAt: -1 }).limit(200).toArray();
      return { notes: rows.map(({ id, title, content, createdBy, createdAt, updatedAt }) => ({ id, title, content, createdBy, createdAt, updatedAt })) };
    });

    ctx.server.post<{ Body: { title?: string; content?: string } }>("/notes", { preHandler: preWrite }, async (request, reply) => {
      const tenant = (request as AuthenticatedRequest).tenantContext;
      const title = String(request.body?.title ?? "").trim();
      const content = String(request.body?.content ?? "").trim();
      if (!title || title.length > 120 || content.length > 5000) {
        return reply.code(400).send({ error: "Title is required (max 120 chars) and content must be at most 5000 chars" });
      }
      const now = new Date();
      const note: Omit<Note, "tenantId"> = {
        id: randomUUID(),
        title,
        content,
        createdBy: tenant.userId,
        createdAt: now,
        updatedAt: now
      };
      await collection(tenant.tenantId).insertOne(note);
      return reply.code(201).send({ note });
    });

    ctx.server.get<{ Params: { noteId: string } }>("/notes/:noteId", { preHandler: preRead }, async (request, reply) => {
      const tenant = (request as AuthenticatedRequest).tenantContext;
      const note = await collection(tenant.tenantId).findOne({ id: request.params.noteId });
      if (!note) return reply.code(404).send({ error: "Note not found" });
      return { note };
    });

    ctx.server.put<{ Params: { noteId: string }; Body: { title?: string; content?: string } }>("/notes/:noteId", { preHandler: preWrite }, async (request, reply) => {
      const tenant = (request as AuthenticatedRequest).tenantContext;
      const title = String(request.body?.title ?? "").trim();
      const content = String(request.body?.content ?? "").trim();
      if (!title || title.length > 120 || content.length > 5000) {
        return reply.code(400).send({ error: "Title is required (max 120 chars) and content must be at most 5000 chars" });
      }
      const result = await collection(tenant.tenantId).updateOne(
        { id: request.params.noteId },
        { $set: { title, content, updatedAt: new Date() } }
      );
      if (!result.matchedCount) return reply.code(404).send({ error: "Note not found" });
      return { success: true };
    });

    ctx.server.delete<{ Params: { noteId: string } }>("/notes/:noteId", { preHandler: preWrite }, async (request, reply) => {
      const tenant = (request as AuthenticatedRequest).tenantContext;
      const result = await collection(tenant.tenantId).deleteOne({ id: request.params.noteId });
      if (!result.deletedCount) return reply.code(404).send({ error: "Note not found" });
      return { success: true };
    });

    ctx.logger.info("Notes plugin initialized: routes are tenant-scoped and require an installed entitlement.");
  },
  async stop() {
    await mongoClient?.close();
    mongoClient = undefined;
  }
};
