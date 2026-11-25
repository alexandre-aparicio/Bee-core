# Documents module boundary

## Ownership

Documents owns:
- Document and folder domain rules, DTOs, validation and API routes.
- Document/folder metadata and the `tenant_document_files` file metadata collection.
- Private binary storage under `BEE_DOCUMENTS_DIR`.
- Folder hierarchy, sharing policies, publication and public delivery.
- Its signed ZIP backend and standalone frontend assets.

Bee-core provides infrastructure only:
- Fastify runtime and plugin lifecycle.
- MongoDB client, JWT authentication and tenant context primitives.
- Shared tenant permission and resource-access evaluation.
- Plugin entitlement, installation and enabled-state checks.
- Generic signed-package delivery and sandboxed iframe API bridge.

## Files boundary

Documents has no dependency on the Files plugin. It must not import Files services,
read `tenant_files`, use the Files storage directory, or require Files to be installed
or enabled. Upload, metadata, binary reads and deletion are owned by the Documents
storage adapter.

## Frontend boundary

The package owns `frontend/index.html` and `frontend/main.js`. The Angular host
must not import a Documents component, API service or module-specific UI catalog.
The generic plugin outlet loads the signed frontend in a sandboxed iframe. The host
retains the access token and enforces the API-prefix allowlist from the signed
manifest.

## Runtime and configuration

Documents declares only the genuine host runtime dependencies `auth` and
`organizations`. Its persistent data directory is selected by the plugin through
`BEE_DOCUMENTS_DIR`, defaulting to `/data/bee-documents`; it is not exposed as a
Documents-specific Core configuration property.

## Data preservation

Tenant disable, tenant uninstall and platform ZIP removal must not delete Documents
collections, file metadata or stored binaries. Package code and business data have
separate lifecycles. No automatic cleanup or migration may remove existing data.
