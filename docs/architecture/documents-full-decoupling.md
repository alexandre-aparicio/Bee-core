# Documents: full external-plugin decoupling

## Goal

Make Documents a self-contained, signed ZIP plugin that can be installed, activated,
disabled, upgraded and removed through the platform package lifecycle without a
built-in Documents implementation in Bee-core.

Documents owns its upload, metadata, binary storage, download and public-delivery
lifecycle. It must not require Files to be installed or enabled.

## Data cleanup scope (approved)

The user has authorized deleting all existing test data and files belonging to
Documents. The cleanup is limited to Documents-owned records and binaries.

- Delete Documents folders, document records, folder/resource ACLs and Documents-owned
  file metadata/blobs, including any test-only references to legacy Files objects.
- Do not delete the Files plugin, its collections, shared storage root, or files owned
  by other modules or tenants.
- A legacy Files blob may be deleted only when a reliable ownership/reference check
  proves it is exclusively associated with a Documents test record and no other
  consumer references it. Otherwise leave it untouched and report it as an orphan
  candidate for manual review.
- Implement cleanup as an explicit, tenant-scoped, auditable operation with a dry-run
  report before destructive execution. Never run it automatically during plugin
  startup, install, upgrade or ordinary deployment.
- Do not connect to or mutate a live VPS database from this GitHub change. The cleanup
  operation must be reviewed and deliberately executed in the target environment.

## Current coupling confirmed in main

- `src/index.ts` imports `documentsPlugin` and registers it as a built-in fallback
  whenever no installed ZIP package with ID `documents` exists.
- `documents.plugin.ts` declares runtime dependency `files`.
- The package builder declares both runtime and tenant dependency `files`.
- `FilesStorageAdapter` reads metadata from `tenant_files` and binary content from
  the Files storage root.
- Documents create/download/public-download handlers resolve file IDs as Files
  resources and evaluate Files ACLs.
- Documents therefore depends on Files metadata, file ID semantics and access policy.

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
- The package manifest and runtime manifest list only genuine host dependencies.
  Files is not a runtime or tenant dependency.
- The signed ZIP contains the complete backend module graph and all frontend assets.
- Bee-core loads Documents only from its verified ZIP package. No static import,
  registration fallback or bundled Documents UI remains in the host.

## Implementation sequence

1. Audit every backend, frontend, package-builder, installer and test reference to Files.
2. Add Documents-owned storage, metadata repository, upload/download handlers and
   validation tests.
3. Update the Documents frontend to use its own upload endpoint; remove Files ACL and
   metadata calls from Documents request paths.
4. Remove `files` from Documents runtime and tenant dependency declarations.
5. Update the ZIP builder and verify the signed package includes all backend and
   frontend assets with matching manifest/runtime dependencies.
6. Remove the static Documents import and fallback registration from `src/index.ts`.
7. Add scoped cleanup tooling with dry-run, explicit execute mode, tenant boundaries,
   audit output and conservative legacy-blob ownership checks.
8. Add integration coverage for ZIP install, startup, tenant install/activation,
   upload, download, public links, ACLs, tenant isolation, disable/re-enable,
   restart persistence and uninstall safety.

## Acceptance criteria

- Documents installs and starts from the signed ZIP with Files unavailable.
- No source/runtime dependency from Documents to Files remains.
- All Documents test records and exclusively Documents-owned test blobs can be
  removed through the explicit cleanup operation.
- Files data belonging to other modules or tenants remains untouched.
- New uploads are stored and served entirely by Documents.
- Tenant boundaries, ACLs, public-link controls and file validation remain enforced.
- The package can be disabled/re-enabled and Bee-core restarted without losing data.
- Static Documents code is no longer imported or registered by the host.
- CI passes; no changes are merged to main until review and verification are complete.
