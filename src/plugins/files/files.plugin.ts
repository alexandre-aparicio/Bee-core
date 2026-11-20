import type { BeePlugin } from "../../core/types.js";
import { MongoClient, type Document } from "mongodb";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { TenantCollection } from "../../core/tenant-collection.js";
import { resolveTenantContext, hasTenantPermission } from "../../core/tenant-context.js";

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
function validPayload(contentType: string, body: Buffer): boolean {
  if (contentType === "image/png") return body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (contentType === "image/jpeg") return body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
  if (contentType === "image/webp") return body.length >= 12 && body.toString("ascii", 0, 4) === "RIFF" && body.toString("ascii", 8, 12) === "WEBP";
  if (contentType === "application/pdf") return body.length >= 5 && body.toString("ascii", 0, 5) === "%PDF-";
  if (contentType === "text/plain" || contentType === "text/csv") {
    if (body.includes(0)) return false;
    try { new TextDecoder("utf-8", { fatal: true }).decode(body); return true; }
    catch { return false; }
  }
  return false;
}

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
let mongoClient: MongoClient | undefined;

export const filesPlugin: BeePlugin = {
  manifest: {
    name: "files",
    version: "0.1.0",
    description: "Tenant-isolated private file and image storage",
    dependencies: ["auth", "organizations"]
  },
  async initialize(ctx) {
    const mongoUri = String(ctx.config.mongoUri ?? "");
    const dbName = String(ctx.config.mongoDbName ?? "bee_core");
    const storageRoot = path.resolve(String(ctx.config.fileStoragePath ?? "/data/bee-files"));
    mongoClient = new MongoClient(mongoUri, { maxPoolSize: 10, serverSelectionTimeoutMS: 10000 });
    await mongoClient.connect();
    const db = mongoClient.db(dbName);
    // The metadata collection is accessed through a tenant-scoped facade per request.
    await db.collection("tenant_files").createIndex({ tenantId: 1, id: 1 }, { unique: true, name: "tenant_files_company_id_unique" });
    await mkdir(storageRoot, { recursive: true });

    ctx.server.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: MAX_FILE_SIZE }, (_request, body, done) => {
      done(null, body);
    });

    const authenticate = async (request: any, reply: any) => {
      try {
        await request.jwtVerify();
        const tenant = await resolveTenantContext(db, request.user);
        if (!tenant) {
          reply.code(401).send({ error: "Unauthorized or active company session required" });
          return null;
        }
        return tenant;
      } catch {
        reply.code(401).send({ error: "Unauthorized" });
        return null;
      }
    };
    const scopedFiles = (tenantId: string) => new TenantCollection<FileRecord>(db.collection<FileRecord>("tenant_files"), tenantId);
    const tenantDirectory = (tenantId: string) => path.join(storageRoot, createHash("sha256").update(tenantId).digest("hex"));
    const storagePath = (tenantId: string, fileId: string) => path.join(tenantDirectory(tenantId), fileId);
    const safeName = (value: string) => {
      let decoded = value;
      try { decoded = decodeURIComponent(value); } catch { /* retain the original header value */ }
      return path.basename(decoded).replace(/[\r\n\0]/g, "").replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 160) || "file";
    };
    const publicRecord = (file: FileRecord) => ({
      id: file.id,
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
      if (!validPayload(contentType, body)) return reply.code(400).send({ error: "File content does not match its declared type" });
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
      await mkdir(tenantDirectory(tenant.tenantId), { recursive: true });
      await writeFile(key, body, { flag: "wx", mode: 0o600 });
      try {
        await scopedFiles(tenant.tenantId).insertOne(record);
      } catch (error) {
        await unlink(key).catch(() => undefined);
        throw error;
      }
      return reply.code(201).send({ file: publicRecord(record) });
    });

    ctx.server.get("/files", async (request: any, reply: any) => {
      const tenant = await authenticate(request, reply);
      if (!tenant) return;
      if (!hasTenantPermission(tenant, "files.read")) return reply.code(403).send({ error: "File read permission required" });
      const records = await scopedFiles(tenant.tenantId).find({}).sort({ createdAt: -1 }).limit(200).toArray();
      return { files: records.map(publicRecord) };
    });

    ctx.server.get<{ Params: { fileId: string } }>("/files/:fileId", async (request: any, reply: any) => {
      const tenant = await authenticate(request, reply);
      if (!tenant) return;
      if (!hasTenantPermission(tenant, "files.read")) return reply.code(403).send({ error: "File read permission required" });
      if (!/^[0-9a-f-]{36}$/i.test(request.params.fileId)) return reply.code(404).send({ error: "File not found" });
      const record = await scopedFiles(tenant.tenantId).findOne({ id: request.params.fileId });
      if (!record) return reply.code(404).send({ error: "File not found" });
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
      if (!/^[0-9a-f-]{36}$/i.test(request.params.fileId)) return reply.code(404).send({ error: "File not found" });
      const collection = scopedFiles(tenant.tenantId);
      const record = await collection.findOne({ id: request.params.fileId });
      if (!record) return reply.code(404).send({ error: "File not found" });
      await unlink(storagePath(tenant.tenantId, record.id)).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
      await collection.deleteOne({ id: record.id });
      return { success: true };
    });

    ctx.logger.info("Files plugin initialized: private tenant storage and scoped metadata ready.");
  },
  async stop() {
    await mongoClient?.close();
    mongoClient = undefined;
  }
};
