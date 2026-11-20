import type {
  Collection,
  Document,
  Filter,
  OptionalUnlessRequiredId,
  UpdateFilter
} from "mongodb";

/**
 * A deliberately small MongoDB collection facade for tenant-owned records.
 * It never exposes the underlying collection, so reads and mutations always
 * include the active tenant predicate.
 */
type TenantInsert<T extends Document> = OptionalUnlessRequiredId<Omit<T, "tenantId"> & { tenantId?: string }>;

export class TenantCollection<T extends Document = Document> {
  constructor(
    private readonly collection: Collection<T>,
    readonly tenantId: string
  ) {
    if (!tenantId || !tenantId.trim()) {
      throw new Error("A non-empty tenantId is required for tenant-scoped data access");
    }
  }

  private scoped(filter: Filter<T> = {} as Filter<T>): Filter<T> {
    return { $and: [filter, { tenantId: this.tenantId }] } as Filter<T>;
  }

  private stamp(document: TenantInsert<T>): OptionalUnlessRequiredId<T> & { tenantId: string } {
    const suppliedTenantId = (document as Document).tenantId;
    if (suppliedTenantId !== undefined && suppliedTenantId !== this.tenantId) {
      throw new Error("Document tenantId does not match the active tenant context");
    }
    return { ...document, tenantId: this.tenantId } as unknown as OptionalUnlessRequiredId<T> & { tenantId: string };
  }

  private assertTenantImmutable(update: UpdateFilter<T>): void {
    const operations = update as Document;
    if (Object.keys(operations).some(key => !key.startsWith("$"))) {
      throw new Error("Replacement updates are not supported by TenantCollection");
    }

    const isTenantPath = (path: string) => path === "tenantId" || path.startsWith("tenantId.");
    for (const [operator, values] of Object.entries(operations)) {
      if (!values || typeof values !== "object" || Array.isArray(values)) continue;
      for (const [field, value] of Object.entries(values as Document)) {
        if (isTenantPath(field) || (operator === "$rename" && typeof value === "string" && isTenantPath(value))) {
          throw new Error("tenantId is immutable through TenantCollection updates");
        }
      }
    }
  }

  find(filter: Filter<T> = {} as Filter<T>) {
    return this.collection.find(this.scoped(filter));
  }

  findOne(filter: Filter<T> = {} as Filter<T>) {
    return this.collection.findOne(this.scoped(filter));
  }

  insertOne(document: TenantInsert<T>) {
    return this.collection.insertOne(this.stamp(document) as OptionalUnlessRequiredId<T>);
  }

  insertMany(documents: readonly TenantInsert<T>[]) {
    return this.collection.insertMany(documents.map(document => this.stamp(document) as OptionalUnlessRequiredId<T>));
  }

  updateOne(filter: Filter<T>, update: UpdateFilter<T>) {
    this.assertTenantImmutable(update);
    return this.collection.updateOne(this.scoped(filter), update);
  }

  updateMany(filter: Filter<T>, update: UpdateFilter<T>) {
    this.assertTenantImmutable(update);
    return this.collection.updateMany(this.scoped(filter), update);
  }

  deleteOne(filter: Filter<T>) {
    return this.collection.deleteOne(this.scoped(filter));
  }

  deleteMany(filter: Filter<T>) {
    return this.collection.deleteMany(this.scoped(filter));
  }

  countDocuments(filter: Filter<T> = {} as Filter<T>) {
    return this.collection.countDocuments(this.scoped(filter));
  }

  createTenantUniqueIndex(fields: Record<string, 1 | -1>, name?: string) {
    if (Object.prototype.hasOwnProperty.call(fields, "tenantId")) {
      throw new Error("Pass only business fields; tenantId is added automatically");
    }
    return this.collection.createIndex(
      { tenantId: 1, ...fields },
      { unique: true, ...(name ? { name } : {}) }
    );
  }
}

/** Compose a caller filter with a mandatory tenant predicate. */
export function tenantFilter<T extends Document = Document>(
  tenantId: string,
  filter: Filter<T> = {} as Filter<T>
): Filter<T> {
  if (!tenantId || !tenantId.trim()) {
    throw new Error("A non-empty tenantId is required");
  }
  return { $and: [filter, { tenantId }] } as Filter<T>;
}

/** Stamp a newly created tenant-owned record and reject cross-tenant input. */
export function tenantDocument<T extends Document>(
  tenantId: string,
  document: T
): T & { tenantId: string } {
  if (!tenantId || !tenantId.trim()) {
    throw new Error("A non-empty tenantId is required");
  }
  const suppliedTenantId = document.tenantId;
  if (suppliedTenantId !== undefined && suppliedTenantId !== tenantId) {
    throw new Error("Document tenantId does not match the active tenant context");
  }
  return { ...document, tenantId };
}
