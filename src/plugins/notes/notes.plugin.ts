import type { BeePlugin } from "../../core/types.js";
import { MongoClient, type Db, type Document } from "mongodb";
import { randomUUID } from "node:crypto";
import { TenantCollection } from "../../core/tenant-collection.js";
import { requireAuth, requireTenantPermissions, type AuthenticatedRequest } from "../auth/auth.guard.js";
import { requireInstalledPlugin } from "../../core/plugin-entitlements.js";
import { maskResourceId, unmaskResourceId } from "../../core/session-id.js";

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
    dependencies: ["auth", "organizations", "marketplace"],
    frontend: { routes: [{ path: "/dashboard/notes", component: "bee-notes" }] }
  },
  async initialize(ctx) {
    const mongoUri = String(ctx.config.mongoUri ?? "");
    const dbName = String(ctx.config.mongoDbName ?? "bee_core");
    mongoClient = new MongoClient(mongoUri, { maxPoolSize: 10, serverSelectionTimeoutMS: 10000 });
    await mongoClient.connect();
    const db: Db = mongoClient.db(dbName);
    const sessionIdSecret = String(ctx.config.jwtSecret ?? "");
    if (sessionIdSecret.length < 32) throw new Error("Notes: JWT_SECRET must contain at least 32 characters.");
    const collection = (tenantId: string) => new TenantCollection<Note>(db.collection<Note>("tenant_notes"), tenantId);
    const preRead = [requireAuth(db, "dashboard", sessionIdSecret), requireTenantPermissions("notes.read"), requireInstalledPlugin(db, "notes")];
    const preWrite = [requireAuth(db, "dashboard"), requireTenantPermissions("notes.write"), requireInstalledPlugin(db, "notes")];
    const publicNote = (note: Note, tenant: AuthenticatedRequest["tenantContext"]) => ({
      id: maskResourceId(note.id, "note", { sessionId: tenant.sessionId, expiresAt: tenant.sessionExpiresAt }, sessionIdSecret),
      title: note.title, content: note.content,
      createdBy: maskResourceId(note.createdBy, "user", { sessionId: tenant.sessionId, expiresAt: tenant.sessionExpiresAt }, sessionIdSecret),
      createdAt: note.createdAt, updatedAt: note.updatedAt
    });
    const resolveNoteId = (reference: string, tenant: AuthenticatedRequest["tenantContext"]): string | null => {
      try { return unmaskResourceId(reference, "note", { sessionId: tenant.sessionId, expiresAt: tenant.sessionExpiresAt }, sessionIdSecret); }
      catch { return null; }
    };

    ctx.server.get("/notes", { preHandler: preRead }, async request => {
      const tenant = (request as AuthenticatedRequest).tenantContext;
      const rows = await collection(tenant.tenantId).find({}).sort({ updatedAt: -1 }).limit(200).toArray();
      return { notes: rows.map(row => publicNote(row, tenant)) };
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
      return reply.code(201).send({ note: publicNote(note as Note, tenant) });
    });

    ctx.server.get<{ Params: { noteId: string } }>("/notes/:noteId", { preHandler: preRead }, async (request, reply) => {
      const tenant = (request as AuthenticatedRequest).tenantContext;
      const noteId = resolveNoteId(request.params.noteId, tenant);
      if (!noteId) return reply.code(404).send({ error: "Note not found" });
      const note = await collection(tenant.tenantId).findOne({ id: noteId });
      if (!note) return reply.code(404).send({ error: "Note not found" });
      return { note: publicNote(note, tenant) };
    });

    ctx.server.put<{ Params: { noteId: string }; Body: { title?: string; content?: string } }>("/notes/:noteId", { preHandler: preWrite }, async (request, reply) => {
      const tenant = (request as AuthenticatedRequest).tenantContext;
      const title = String(request.body?.title ?? "").trim();
      const content = String(request.body?.content ?? "").trim();
      if (!title || title.length > 120 || content.length > 5000) {
        return reply.code(400).send({ error: "Title is required (max 120 chars) and content must be at most 5000 chars" });
      }
      const noteId = resolveNoteId(request.params.noteId, tenant);
      if (!noteId) return reply.code(404).send({ error: "Note not found" });
      const result = await collection(tenant.tenantId).updateOne(
        { id: noteId },
        { $set: { title, content, updatedAt: new Date() } }
      );
      if (!result.matchedCount) return reply.code(404).send({ error: "Note not found" });
      return { success: true };
    });

    ctx.server.delete<{ Params: { noteId: string } }>("/notes/:noteId", { preHandler: preWrite }, async (request, reply) => {
      const tenant = (request as AuthenticatedRequest).tenantContext;
      const noteId = resolveNoteId(request.params.noteId, tenant);
      if (!noteId) return reply.code(404).send({ error: "Note not found" });
      const result = await collection(tenant.tenantId).deleteOne({ id: noteId });
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
