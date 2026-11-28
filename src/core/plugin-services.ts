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

export interface StoreFileInput {
  originalName: string;
  contentType: string;
  uploadedBy: string;
  data: Buffer;
}

/**
 * Internal tenant-scoped storage contract for trusted plugins.
 * Public dashboard uploads still go through the Files HTTP API and its user ACLs.
 */
export interface FilesStorageService {
  store(tenantId: string, input: StoreFileInput): Promise<StoredFileMetadata>;
  getMetadata(tenantId: string, fileId: string): Promise<StoredFileMetadata | null>;
  list(tenantId: string): Promise<StoredFileMetadata[]>;
  read(tenantId: string, fileId: string): Promise<Buffer>;
  delete(tenantId: string, fileId: string): Promise<boolean>;
}


/** Stable host contract for plugins that need tenant/plugin lifecycle authorization. */
export interface PluginTenantContext {
  tenantId: string;
  userId: string;
  client: string;
  role: string;
}

export interface PluginUserSummary {
  id: string;
  name: string;
  email: string;
}

/** Host-owned authorization and identity contract exposed to feature plugins. */
export interface TenantPluginPermission { pluginId:string; key:string; module:string; resource:string; action:string; label:string; }

export interface PluginAccessService {
  isPluginAvailable(tenantId: string, pluginId: string): Promise<boolean>;
  /** Permissions declared by packages installed, entitled and enabled for this tenant. */
  getTenantPluginPermissions(tenantId: string): Promise<TenantPluginPermission[]>;
  isTenantUserActive(tenantId: string, userId: string): Promise<boolean>;
  resolveTenantContext(user: unknown, sessionSecret: string): Promise<PluginTenantContext | null>;
  getTenantUserSummaries(tenantId: string, userIds: string[]): Promise<PluginUserSummary[]>;
}
