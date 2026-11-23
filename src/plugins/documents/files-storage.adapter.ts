import type { Db } from "mongodb";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

type StoredFile = { id: string; tenantId: string; originalName: string; contentType: string; size: number; storageKey: string };

/** Transitional boundary around the existing Files storage implementation. */
export class FilesStorageAdapter {
  constructor(private readonly db: Db, private readonly root: string) {}
  async getMetadata(tenantId: string, fileId: string): Promise<StoredFile | null> {
    if (!/^[0-9a-f-]{36}$/i.test(fileId)) return null;
    return this.db.collection<StoredFile>("tenant_files").findOne({ tenantId, id: fileId });
  }
  async read(tenantId: string, file: StoredFile): Promise<Buffer> {
    if (file.tenantId !== tenantId || file.id !== file.storageKey || !/^[0-9a-f-]{36}$/i.test(file.storageKey)) throw new Error("Invalid tenant file reference");
    const directory = createHash("sha256").update(tenantId).digest("hex");
    const expected = path.resolve(this.root, directory);
    const target = path.resolve(expected, file.storageKey);
    if (path.dirname(target) !== expected) throw new Error("Invalid storage location");
    return readFile(target);
  }
}
