import type { FilesStorageService, StoredFileMetadata } from "../../core/plugin-services.js";

/** Documents-facing adapter over the public Files storage service contract. */
export class FilesStorageAdapter {
  constructor(private readonly files: FilesStorageService) {}

  getMetadata(tenantId: string, fileId: string): Promise<StoredFileMetadata | null> {
    return this.files.getMetadata(tenantId, fileId);
  }

  async read(tenantId: string, file: StoredFileMetadata): Promise<Buffer> {
    if (file.tenantId !== tenantId || !/^[0-9a-f-]{36}$/i.test(file.id)) {
      throw new Error("Invalid tenant file reference");
    }
    return this.files.read(tenantId, file.id);
  }
}
