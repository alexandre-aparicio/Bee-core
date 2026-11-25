# Documents module architecture

Documents is a tenant-scoped signed ZIP plugin. It owns document metadata, folder
hierarchy, file metadata, binary storage, sharing policies, publication and download
delivery.

## Storage ownership

- Metadata collections: `tenant_documents`, `tenant_document_folders` and
  `tenant_document_files`.
- Binary storage: private tenant-isolated directories under
  `BEE_DOCUMENTS_DIR` (default `/data/bee-documents`).
- Upload validation checks the content type and file signature, enforces the size
  limit, computes SHA-256 and writes files atomically.
- Download and public delivery are served by Documents after tenant/resource access
  checks. The browser never receives a filesystem path or storage key.
- Documents does not call Files, read `tenant_files`, or use the Files storage root.

## Security and tenant boundaries

- Every document and folder query is scoped to the authenticated tenant.
- Resource IDs are masked and bound to the active session.
- Folder ancestry, owner controls, team grants and user overrides are checked before
  reads, writes, moves, sharing or publication changes.
- Public links use random public IDs and are rechecked at delivery time.
- The package frontend runs in the generic sandboxed iframe. The host keeps the
  bearer token and proxies only manifest-declared API prefixes.

## Distribution and lifecycle

Documents is built by `scripts/build-plugin-packages.mjs` as a signed ZIP. The
manifest declares only `auth` and `organizations` as runtime dependencies, and
contains the backend module graph plus `frontend/index.html` and
`frontend/main.js`. The current branch package version is `0.1.2`.

The Core source tree retains the plugin source for packaging, but does not import or
register it as a built-in runtime plugin. The Angular app contains no Documents
component or Documents API service. Tenant disable/uninstall and platform package
removal must not delete Documents business data or the persistent storage volume.

## API contract

- `GET /documents` and `POST /documents`
- `GET /documents/folders` and `POST /documents/folders`
- `POST /documents/files`
- `PATCH /documents/:documentId/location`
- `PATCH /documents/folders/:folderId/location`
- `GET /documents/share-targets`
- `GET /documents/folders/:folderId/shares`
- `PUT /documents/folders/:folderId/shares`
- `PUT /documents/:documentId/publication`
- `GET /documents/:documentId/download`
- `GET /public/documents/:publicId`

## Verification gate

The source migration is not considered production-ready until backend build/tests,
Angular build, signed ZIP creation and verification, platform install/restart,
tenant install/activation/disable/uninstall, upload/download/public delivery, and
data-persistence checks pass. No destructive data cleanup is part of this migration.
