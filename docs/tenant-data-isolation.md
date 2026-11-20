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

## Resolving the active company

After verifying the JWT with Fastify's `request.jwtVerify()`, use `resolveTenantContext(db, request.user)` from `src/core/tenant-context.ts`. It validates the token audience, user/client grant, persisted refresh session, active company membership and company status, then returns the server-verified `tenantId`, role and permission keys. Never build a tenant context directly from a client-provided company ID.

`COMPANY_ROLE_PERMISSIONS` is the shared baseline permission matrix. Plugins should check stable permission keys such as `files.read` or `plugins.install`; do not duplicate role-name comparisons throughout business plugins.

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


## Private file and image storage foundation

The `files` plugin provides tenant-scoped private storage through:
- `POST /files` — upload a raw `application/octet-stream` body; pass the original name in `x-file-name` and the allow-listed MIME type in `x-file-content-type`.
- `GET /files` — list the active company's files.
- `GET /files/:fileId` — retrieve a file only when its metadata belongs to the active company.
- `DELETE /files/:fileId` — delete the active company's file.

Current limits and protections:
- 10 MB maximum per file.
- Allow-listed JPEG, PNG, WebP, PDF, plain text and CSV. SVG and arbitrary executable formats are not accepted.
- Each metadata query uses `TenantCollection`; metadata stores tenant ID, uploader, MIME type, byte size, SHA-256 checksum and opaque storage key.
- Physical files are stored beneath a directory derived from a SHA-256 hash of the tenant ID. User-provided filenames never form filesystem paths.
- Private downloads require a fresh verified session and active membership. Images are served inline with `nosniff` and private no-store caching; other files are attachments.
- Docker Compose mounts a dedicated persistent `bee_core_files` volume at `/data/bee-files`.

This is the first local-volume storage adapter, not yet a complete media platform. S3-compatible storage, malware scanning, quotas, signed temporary links, image transformations/thumbnails, retention policies and backup/restore validation remain future work. Existing business plugins must still migrate their own tenant-owned data to tenant-scoped repositories.
