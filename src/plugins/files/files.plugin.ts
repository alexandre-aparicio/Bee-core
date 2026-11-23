import type { BeePlugin } from "../../core/types.js";
import type { Document } from "mongodb";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { TenantCollection } from "../../core/tenant-collection.js";
import { resolveTenantContext, hasTenantPermission } from "../../core/tenant-context.js";
import { getTenantStorageLimitBytes, hasPluginEntitlement, isPluginEnabled, isPluginInstalled, seedPluginCommerce } from "../../core/plugin-entitlements.js";
import { maskResourceId, unmaskResourceId } from "../../core/session-id.js";
import { evaluateResourceAccess } from "../../core/resource-access.js";

type FileRecord = Document & {
  id: string;
  tenantId: string;
  originalName: string;
  contentType: string;
  size: number;
  checksum: string;
  storageKey: string;
  uploadedBy: string;
  createdAt: Date;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv"
]);

function matchesContentType(contentType: string, data: Buffer): boolean {
  if (contentType === "image/png") return data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (contentType === "image/jpeg") return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (contentType === "image/webp") return data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP";
  if (contentType === "application/pdf") return data.length >= 5 && data.toString("ascii", 0, 5) === "%PDF-";
  if (contentType === "text/plain" || contentType === "text/csv") {
    if (data.includes(0)) return false;
    try { new TextDecoder("utf-8", { fatal: true }).decode(data); return true; } catch { return false; }
  }
  return false;
}
export const filesPlugin: BeePlugin = {
  manifest: {
    name: "files",
    version: "0.1.0",
    description: "Tenant-isolated private file and image storage",
    dependencies: ["auth", "organizations"]
  },
  async initialize(ctx) {
    const dbName = String(ctx.config.mongoDbName ?? "bee_core");
    const storageRoot = path.resolve(String(ctx.config.fileStoragePath ?? "/data/bee-files"));
    const db = ctx.mongoClient.db(dbName);
    const sessionIdSecret = String(ctx.config.sessionIdSecret ?? ctx.config.jwtSecret ?? "");
    if (sessionIdSecret.length < 32) throw new Error("Files: JWT_SECRET must contain at least 32 characters.");
    await seedPluginCommerce(db);
    // The metadata collection is accessed through a tenant-scoped facade per request.
    await Promise.all([
      db.collection("tenant_files").createIndex({ tenantId: 1, id: 1 }, { unique: true, name: "tenant_files_company_id_unique" }),
      db.collection("tenant_files").createIndex({ tenantId: 1, createdAt: -1 }, { name: "tenant_files_company_created" }),
      db.collection("tenant_storage_usage").createIndex({ tenantId: 1 }, { unique: true, name: "tenant_storage_usage_company_unique" })
    ]);
    await mkdir(storageRoot, { recursive: true });

    ctx.server.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: MAX_FILE_SIZE }, (_request, body, done) => {
      done(null, body);
    });

    const authenticate = async (request: any, reply: any) => {
      try {
        await request.jwtVerify();
        const tenant = await resolveTenantContext(db, request.user, {}, sessionIdSecret);
        if (!tenant) {
          reply.code(401).send({ error: "Unauthorized or active company session required" });
          return null;
        }
        if (tenant.client !== "dashboard") {
          reply.code(403).send({ error: "Private file management requires a dashboard session" });
          return null;
        }
        if (!hasTenantPermission(tenant, "files.read")) {
          reply.code(403).send({ error: "File read permission required" });
          return null;
        }
        if (!await hasPluginEntitlement(db, tenant.tenantId, "files") || !await isPluginInstalled(db, tenant.tenantId, "files") || !await isPluginEnabled(db, tenant.tenantId, "files")) {
          reply.code(403).send({ error: "Files is not entitled, installed or enabled for this company" });
          return null;
        }
        return tenant;
      } catch {
        reply.code(401).send({ error: "Unauthorized" });
        return null;
      }
    };
    const scopedFiles = (tenantId: string) => new TenantCollection<FileRecord>(db.collection<FileRecord>("tenant_files"), tenantId);
    const storageUsage = db.collection<{ tenantId: string; usedBytes: number; updatedAt: Date }>("tenant_storage_usage");
    const existingTenantIds = await db.collection<FileRecord>("tenant_files").distinct("tenantId");
    for (const tenantValue of existingTenantIds) {
      if (typeof tenantValue !== "string" || !tenantValue) continue;
      const totals = await db.collection<FileRecord>("tenant_files").aggregate<{ total: number }>([
        { $match: { tenantId: tenantValue } },
        { $group: { _id: null, total: { $sum: "$size" } } }
      ]).toArray();
      await storageUsage.updateOne(
        { tenantId: tenantValue },
        { $setOnInsert: { usedBytes: totals[0]?.total ?? 0, updatedAt: new Date() } },
        { upsert: true }
      );
    }
    const reserveStorage = async (tenantId: string, bytes: number, limit: number): Promise<boolean> => {
      let usage = await storageUsage.findOne({ tenantId });
      if (!usage) {
        const rows = await db.collection<FileRecord>("tenant_files").aggregate<{ total: number }>([
          { $match: { tenantId } },
          { $group: { _id: null, total: { $sum: "$size" } } }
        ]).toArray();
        try {
          await storageUsage.insertOne({ tenantId, usedBytes: rows[0]?.total ?? 0, updatedAt: new Date() });
        } catch (error) {
          if ((error as { code?: number }).code !== 11000) throw error;
        }
      }
      const reservation = await storageUsage.findOneAndUpdate(
        { tenantId, usedBytes: { $lte: limit - bytes } },
        { $inc: { usedBytes: bytes }, $set: { updatedAt: new Date() } },
        { returnDocument: "after" }
      );
      return Boolean(reservation);
    };
    const releaseStorage = async (tenantId: string, bytes: number) => {
      await storageUsage.updateOne({ tenantId }, { $inc: { usedBytes: -bytes }, $set: { updatedAt: new Date() } });
    };
    const tenantDirectory = (tenantId: string) => path.join(storageRoot, createHash("sha256").update(tenantId).digest("hex"));
    const storagePath = (tenantId: string, fileId: string) => path.join(tenantDirectory(tenantId), fileId);
    const safeName = (value: string) => {
      let decoded = value;
      try { decoded = decodeURIComponent(value); } catch { /* retain the original header value */ }
      return path.basename(decoded).replace(/[\r\n\0]/g, "").replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 160) || "file";
    };
    const publicRecord = (file: FileRecord, tenantSession: import("../../core/tenant-context.js").TenantContext) => ({
      id: maskResourceId(file.id, "file", { sessionId: tenantSession.sessionId, expiresAt: tenantSession.sessionExpiresAt }, sessionIdSecret),
      name: file.originalName,
      contentType: file.contentType,
      size: file.size,
      checksum: file.checksum,
      createdAt: file.createdAt
    });

    ctx.server.post("/files", async (request: any, reply: any) => {
      const tenant = await authenticate(request, reply);
      if (!tenant) return;
      if (!hasTenantPermission(tenant, "files.write")) return reply.code(403).send({ error: "File write permission required" });
      const body = request.body;
      if (!Buffer.isBuffer(body) || body.length === 0) return reply.code(400).send({ error: "Send a non-empty application/octet-stream body" });
      if (body.length > MAX_FILE_SIZE) return reply.code(413).send({ error: "Maximum file size is 10 MB" });
      const contentType = String(request.headers["x-file-content-type"] ?? "application/octet-stream").split(";")[0].trim().toLowerCase();
      if (!ALLOWED_TYPES.has(contentType)) return reply.code(415).send({ error: "File type is not allowed" });
      if (!matchesContentType(contentType, body)) return reply.code(400).send({ error: "File content does not match the declared MIME type" });
      const storageLimit = await getTenantStorageLimitBytes(db, tenant.tenantId);
      const reserved = await reserveStorage(tenant.tenantId, body.length, storageLimit);
      if (!reserved) {
        const usage = await storageUsage.findOne({ tenantId: tenant.tenantId });
        return reply.code(413).send({ error: "Company storage quota exceeded", storageLimitBytes: storageLimit, usedBytes: usage?.usedBytes ?? 0 });
      }
      const id = randomUUID();
      const originalName = safeName(String(request.headers["x-file-name"] ?? "file"));
      const key = storagePath(tenant.tenantId, id);
      const record: FileRecord = {
        id,
        tenantId: tenant.tenantId,
        originalName,
        contentType,
        size: body.length,
        checksum: createHash("sha256").update(body).digest("hex"),
        storageKey: id,
        uploadedBy: tenant.userId,
        createdAt: new Date()
      };
      try {
        await mkdir(tenantDirectory(tenant.tenantId), { recursive: true });
        await writeFile(key, body, { flag: "wx", mode: 0o600 });
        await scopedFiles(tenant.tenantId).insertOne(record);
      } catch (error) {
        await unlink(key).catch(() => undefined);
        await releaseStorage(tenant.tenantId, body.length);
        throw error;
      }
      return reply.code(201).send({ file: publicRecord(record, tenant) });
    });

    ctx.server.get("/files", async (request: any, reply: any) => {
      const tenant = await authenticate(request, reply);
      if (!tenant) return;
      if (!hasTenantPermission(tenant, "files.read")) return reply.code(403).send({ error: "File read permission required" });
      const records = await scopedFiles(tenant.tenantId).find({}).sort({ createdAt: -1 }).limit(200).toArray();
      const visible = await Promise.all(records.map(async record => ({ record, decision: await evaluateResourceAccess(db, { tenantId: tenant.tenantId, userId: tenant.userId, pluginId: "files", resourceType: "file", resourceId: record.id, permission: "read" }) })));
      return { files: visible.filter(item => item.decision !== false).map(item => publicRecord(item.record, tenant)) };
    });

    ctx.server.get<{ Params: { fileId: string } }>("/files/:fileId", async (request: any, reply: any) => {
      const tenant = await authenticate(request, reply);
      if (!tenant) return;
      if (!hasTenantPermission(tenant, "files.read")) return reply.code(403).send({ error: "File read permission required" });
      let fileId: string;
      try { fileId = unmaskResourceId(request.params.fileId, "file", { sessionId: tenant.sessionId, expiresAt: tenant.sessionExpiresAt }, sessionIdSecret); } catch { return reply.code(404).send({ error: "File not found" }); }
      if (!/^[0-9a-f-]{36}$/i.test(fileId)) return reply.code(404).send({ error: "File not found" });
      const record = await scopedFiles(tenant.tenantId).findOne({ id: fileId });
      if (!record) return reply.code(404).send({ error: "File not found" });
      const resourceDecision = await evaluateResourceAccess(db, { tenantId: tenant.tenantId, userId: tenant.userId, pluginId: "files", resourceType: "file", resourceId: record.id, permission: "read" });
      if (resourceDecision === false) return reply.code(404).send({ error: "File not found" });
      let data: Buffer;
      try { data = await readFile(storagePath(tenant.tenantId, record.id)); }
      catch { return reply.code(404).send({ error: "File content not found" }); }
      const inline = record.contentType.startsWith("image/");
      reply.header("content-type", record.contentType);
      reply.header("content-length", String(data.length));
      reply.header("content-disposition", (inline ? "inline" : "attachment") + "; filename=\"" + record.originalName.replace(/["\\\\]/g, "_") + "\"");
      reply.header("cache-control", "private, no-store");
      reply.header("x-content-type-options", "nosniff");
      return reply.send(data);
    });

    ctx.server.delete<{ Params: { fileId: string } }>("/files/:fileId", async (request: any, reply: any) => {
      const tenant = await authenticate(request, reply);
      if (!tenant) return;
      if (!hasTenantPermission(tenant, "files.write")) return reply.code(403).send({ error: "File write permission required" });
      let fileId: string;
      try { fileId = unmaskResourceId(request.params.fileId, "file", { sessionId: tenant.sessionId, expiresAt: tenant.sessionExpiresAt }, sessionIdSecret); } catch { return reply.code(404).send({ error: "File not found" }); }
      if (!/^[0-9a-f-]{36}$/i.test(fileId)) return reply.code(404).send({ error: "File not found" });
      const collection = scopedFiles(tenant.tenantId);
      const record = await collection.findOne({ id: fileId });
      if (!record) return reply.code(404).send({ error: "File not found" });
      const resourceDecision = await evaluateResourceAccess(db, { tenantId: tenant.tenantId, userId: tenant.userId, pluginId: "files", resourceType: "file", resourceId: record.id, permission: "delete" });
      if (resourceDecision === false) return reply.code(404).send({ error: "File not found" });
      await unlink(storagePath(tenant.tenantId, record.id)).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
      const deleted = await collection.deleteOne({ id: record.id });
      if (deleted.deletedCount) await releaseStorage(tenant.tenantId, record.size);
      return { success: true };
    });

    ctx.logger.info("Files plugin initialized: private tenant storage and scoped metadata ready.");
  }
};
