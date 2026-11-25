import { MongoClient } from "mongodb";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const UUID = /^[0-9a-f-]{36}$/i;
const sha256 = value => createHash("sha256").update(value).digest("hex");

function safeFilePath(root, tenantId, fileId) {
  if (!tenantId || !UUID.test(fileId)) throw new Error("Invalid legacy document file identity");
  const directory = path.resolve(root, sha256(tenantId));
  const target = path.resolve(directory, fileId);
  if (path.dirname(target) !== directory) throw new Error("Document migration path escaped its tenant directory");
  return { directory, target };
}

async function readVerified(filePath, metadata, label) {
  const data = await readFile(filePath);
  if (!Number.isSafeInteger(Number(metadata.size)) || data.length !== Number(metadata.size)) {
    throw new Error(label + " size does not match its metadata");
  }
  const checksum = sha256(data);
  if (typeof metadata.checksum !== "string" || checksum !== metadata.checksum.toLowerCase()) {
    throw new Error(label + " SHA-256 checksum does not match its metadata");
  }
  return data;
}

/**
 * Copy only files referenced by tenant_documents from legacy Files storage into
 * Documents-owned storage. Source metadata and binaries are read-only and never
 * deleted or modified. Safe to re-run after interruption.
 */
export async function migrateDocumentsFiles({ db, legacyRoot, documentsRoot, tenantId = null, apply = false }) {
  const sourceRoot = path.resolve(legacyRoot);
  const targetRoot = path.resolve(documentsRoot);
  const documents = db.collection("tenant_documents");
  const legacyFiles = db.collection("tenant_files");
  const ownedFiles = db.collection("tenant_document_files");
  await ownedFiles.createIndex({ tenantId: 1, id: 1 }, { unique: true, name: "tenant_document_files_tenant_id_unique" });
  await ownedFiles.createIndex({ tenantId: 1, createdAt: -1 }, { name: "tenant_document_files_created" });

  const filter = tenantId ? { tenantId } : {};
  const references = await documents.find(filter).project({ tenantId: 1, fileId: 1, _id: 0 }).toArray();
  const unique = new Map();
  for (const reference of references) {
    const key = String(reference.tenantId ?? "") + ":" + String(reference.fileId ?? "");
    if (!unique.has(key)) unique.set(key, { tenantId: String(reference.tenantId ?? ""), fileId: String(reference.fileId ?? "") });
  }

  const report = {
    mode: apply ? "APPLY" : "DRY RUN",
    documentsScanned: references.length,
    uniqueFilesReferenced: unique.size,
    copied: 0,
    alreadyMigrated: 0,
    wouldCopy: 0,
    issues: []
  };

  for (const reference of unique.values()) {
    const { tenantId: owner, fileId } = reference;
    if (!owner || !UUID.test(fileId)) {
      report.issues.push({ tenantId: owner || null, fileId: fileId || null, reason: "Document contains an invalid tenant or file reference" });
      continue;
    }

    const destination = await ownedFiles.findOne({ tenantId: owner, id: fileId });
    const target = safeFilePath(targetRoot, owner, fileId);
    if (destination) {
      try {
        await readVerified(target.target, destination, "Documents-owned file");
        report.alreadyMigrated += 1;
      } catch (error) {
        report.issues.push({ tenantId: owner, fileId, reason: error instanceof Error ? error.message : String(error) });
      }
      continue;
    }

    const source = await legacyFiles.findOne({ tenantId: owner, id: fileId });
    if (!source) {
      report.issues.push({ tenantId: owner, fileId, reason: "Referenced legacy Files metadata was not found" });
      continue;
    }
    if (source.storageKey !== fileId) {
      report.issues.push({ tenantId: owner, fileId, reason: "Legacy Files storage key does not match its file ID" });
      continue;
    }

    const origin = safeFilePath(sourceRoot, owner, fileId);
    let bytes;
    try {
      bytes = await readVerified(origin.target, source, "Legacy Files blob");
    } catch (error) {
      report.issues.push({ tenantId: owner, fileId, reason: error instanceof Error ? error.message : String(error) });
      continue;
    }

    if (!apply) {
      report.wouldCopy += 1;
      continue;
    }

    await mkdir(target.directory, { recursive: true, mode: 0o700 });
    // Recover safely if a previous attempt wrote the blob but stopped before
    // inserting its metadata. Never overwrite an existing destination file.
    try {
      const existingBytes = await readFile(target.target);
      if (!existingBytes.equals(bytes)) {
        report.issues.push({ tenantId: owner, fileId, reason: "A conflicting Documents destination blob already exists" });
        continue;
      }
    } catch (error) {
      if (error?.code !== "ENOENT") {
        report.issues.push({ tenantId: owner, fileId, reason: error instanceof Error ? error.message : String(error) });
        continue;
      }
      const temporary = path.resolve(target.directory, randomUUID() + ".migration.tmp");
      try {
        await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
        await rename(temporary, target.target);
      } catch (writeError) {
        report.issues.push({ tenantId: owner, fileId, reason: writeError instanceof Error ? writeError.message : String(writeError) });
        continue;
      }
    }

    const migrated = {
      id: fileId,
      tenantId: owner,
      originalName: String(source.originalName ?? "document"),
      contentType: String(source.contentType ?? "application/octet-stream"),
      size: bytes.length,
      checksum: sha256(bytes),
      storageKey: fileId,
      uploadedBy: String(source.uploadedBy ?? ""),
      createdAt: source.createdAt instanceof Date ? source.createdAt : new Date(source.createdAt ?? Date.now()),
      migratedFromFiles: true,
      migratedAt: new Date()
    };
    try {
      await ownedFiles.insertOne(migrated);
      report.copied += 1;
    } catch (error) {
      if (error?.code === 11000) {
        const concurrent = await ownedFiles.findOne({ tenantId: owner, id: fileId });
        try {
          if (concurrent) {
            await readVerified(target.target, concurrent, "Concurrent Documents-owned file");
            report.alreadyMigrated += 1;
            continue;
          }
        } catch { /* report the conflict below */ }
      }
      report.issues.push({ tenantId: owner, fileId, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  return report;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const tenantId = process.argv.find(value => value.startsWith("--tenant="))?.slice("--tenant=".length) ?? null;
  const uri = process.env.MONGODB_URI ?? process.env.MONGO_URI;
  if (!uri) throw new Error("MONGODB_URI (or MONGO_URI) is required");
  const dbName = process.env.MONGODB_DB ?? process.env.MONGO_DB ?? "bee_core";
  const legacyRoot = process.env.BEE_FILES_DIR ?? "/data/bee-files";
  const documentsRoot = process.env.BEE_DOCUMENTS_DIR ?? "/data/bee-documents";
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const report = await migrateDocumentsFiles({ db: client.db(dbName), legacyRoot, documentsRoot, tenantId, apply });
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    if (report.issues.length) process.exitCode = 2;
    else if (!apply) process.stdout.write("Dry run only. No files or metadata were written. Review the report, then repeat with --apply to copy the files. Legacy Files data is never deleted.\n");
    else process.stdout.write("Migration copy completed. Original tenant_files records and /data/bee-files binaries were preserved.\n");
  } finally {
    await client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
