# Tenant data isolation

Bee-Core uses a company (tenant) as the ownership boundary for business data. A user may belong to several companies, but each request must resolve exactly one active company from the authenticated session and an active membership. Never accept a request-body or query-string `tenantId` as proof of access.

## TenantCollection

For new tenant-owned MongoDB collections, use `TenantCollection` from `src/core/tenant-collection.ts`:

```ts
import { TenantCollection } from "../core/tenant-collection.js";

type Contact = {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
};

const contacts = new TenantCollection(
  db.collection<Contact>("crm_contacts"),
  authenticatedTenantId
);

await contacts.createTenantUniqueIndex({ email: 1 }, "crm_contacts_tenant_email_unique");
await contacts.insertOne({ id: crypto.randomUUID(), email, displayName });
const contact = await contacts.findOne({ id: requestedId });
await contacts.updateOne({ id: requestedId }, { $set: { displayName } });
```

The facade:
- injects the active `tenantId` into every read, update, delete and count filter;
- stamps inserts with the active tenant and rejects conflicting tenant IDs;
- prevents updates from changing or removing `tenantId`;
- prefixes tenant-specific unique indexes with `tenantId`, so two companies can use the same business key;
- does not expose the underlying MongoDB collection.

It intentionally does not expose aggregation, raw collection access, replacement writes, or bulk operations. Add explicit tenant-safe APIs before introducing any of those capabilities. Do not bypass the facade by retaining a second reference to the raw collection.

## Required practices for every plugin

1. Resolve the active tenant from the authenticated server-side session and confirm the user's active membership.
2. Construct a tenant-scoped repository for each tenant-owned collection.
3. Store `tenantId` on every tenant-owned document, including child records and file metadata.
4. Prefix unique indexes with `tenantId`.
5. Carry tenant context into queues, scheduled jobs, webhooks and event handlers; never infer it from a global user role.
6. Store private files and images under tenant-specific object keys and authorize every upload/download/delete. Do not expose private object storage directly.
7. Add cross-tenant IDOR tests for reads, writes, deletes, lookups, search and background work.

## Current limitation

The facade and its MongoDB integration tests are a foundation for new plugins. Existing authentication, organization and template collections have not all been migrated to this facade, and Bee-Core does not yet have the private file/image storage service. Do not claim universal tenant isolation until every tenant-owned route and asynchronous path has been audited and tested.
