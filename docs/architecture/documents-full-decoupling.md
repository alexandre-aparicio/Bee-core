# Documents: full external-plugin decoupling

## Goal

Make Documents a self-contained, signed ZIP plugin that can be installed, activated,
disabled, upgraded and removed through the platform package lifecycle without a
built-in Documents implementation in Bee-core.

"Self-contained" means Documents owns its document upload, metadata, binary storage,
download and public-delivery lifecycle. It must not require the Files plugin to be
installed or enabled for Documents to work.

## Current coupling confirmed in main

- `src/index.ts` imports `documentsPlugin` and registers it as a built-in fallback
  whenever no installed ZIP package with ID `documents` exists.
- `documents.plugin.ts` declares runtime dependency `files`.
- The package builder declares both runtime and tenant dependency `files`.
- `FilesStorageAdapter` reads metadata from `tenant_files` and binary content from
  the Files storage root.
- The Documents create/download/public-download handlers resolve file IDs as Files
  resources and evaluate Files ACLs.
- Documents therefore currently depends on Files for more than a storage path: it
  depends on its metadata contract, file ID semantics and resource-access policy.

## Target architecture

- Documents owns a dedicated metadata collection (for example
  `tenant_document_files`) and a dedicated storage root (for example
  `BEE_DOCUMENTS_DIR`, default `/data/bee-documents`).
- Documents exposes its own authenticated upload endpoint. The frontend uploads
  content directly to Documents and then creates/updates the document record using
  a Documents-owned file reference.
- Documents validates file size, MIME type and file signatures, computes a SHA-256
  checksum, enforces tenant isolation and writes files atomically with restrictive
  permissions.
- Documents enforces its own document/folder ACLs. It must not call Files ACL checks
  for its own resources.
- The package manifest and runtime manifest list only genuine host dependencies
  (currently auth and organizations, subject to code audit). Files is not a runtime
  or tenant dependency.
- The signed ZIP contains the complete backend module graph and all frontend assets.
- Bee-core loads Documents only from its verified ZIP package. No static import,
  registration fallback or bundled Documents UI remains in the host.

## Existing-data compatibility

Existing records in `tenant_documents` refer to IDs in `tenant_files`, whose
metadata and binary files live under the Files storage root. This data must remain
readable during and after migration.

The migration must be non-destructive:
1. Keep existing Files collections and binary files untouched.
2. Add a compatibility reader for legacy document file references.
3. On first successful access, optionally copy legacy binary content into Documents
   storage and create Documents-owned metadata, using an idempotent migration marker.
4. Switch the document record to the new file reference only after the copy and
   checksum verification succeed.
5. Never delete legacy Files records or binaries as part of this migration.
6. Keep a rollback path so the old release can still read existing records.

Do not migrate unrelated Files owned by other modules or users.

## Implementation sequence

1. Add Documents-owned storage, metadata repository, upload/download handlers and
   validation tests.
2. Update Documents frontend to use its own upload endpoint; remove Files ACL and
   metadata calls from the Documents request path.
3. Add idempotent, tenant-scoped legacy-file compatibility/migration with checksum
   verification and rollback safety.
4. Remove `files` from Documents runtime and tenant dependency declarations.
5. Update the ZIP builder and verify the signed package includes all backend and
   frontend assets with matching manifest/runtime dependencies.
6. Remove the static Documents import and fallback registration from `src/index.ts`.
7. Add integration coverage for ZIP install, startup, tenant install/activation,
   upload, download, public links, ACLs, existing-data compatibility, disable/re-enable,
   restart persistence and uninstall safety.

## Acceptance criteria

- Documents installs and starts from the signed ZIP with Files unavailable.
- No source/runtime dependency from Documents to the Files plugin remains.
- Existing Documents remain accessible without data loss.
- New uploads are stored and served entirely by Documents.
- Tenant boundaries, ACLs, public-link controls and file validation remain enforced.
- The package can be disabled/re-enabled and Bee-core restarted without losing data.
- Static Documents code is no longer imported or registered by the host.
- CI passes; no changes are merged to main until review and verification are complete.
