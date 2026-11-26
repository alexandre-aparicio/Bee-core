export interface BeePluginServiceRegistry {
  register<T>(key: string, service: T): void;
  get<T>(key: string): T | undefined;
}

export class BeePluginServices implements BeePluginServiceRegistry {
  private readonly services = new Map<string, unknown>();

  register<T>(key: string, service: T): void {
    if (!/^[a-z][a-z0-9.-]*\.[a-z][a-z0-9.-]*$/.test(key)) throw new Error("Invalid plugin service key: " + key);
    if (this.services.has(key)) throw new Error("Plugin service is already registered: " + key);
    this.services.set(key, service);
  }

  get<T>(key: string): T | undefined {
    return this.services.get(key) as T | undefined;
  }
}

export interface StoredFileMetadata {
  id: string;
  tenantId: string;
  originalName: string;
  contentType: string;
  size: number;
  storageKey: string;
  uploadedBy: string;
  createdAt: Date;
}

export interface FilesStorageService {
  getMetadata(tenantId: string, fileId: string): Promise<StoredFileMetadata | null>;
  read(tenantId: string, fileId: string): Promise<Buffer>;
}
