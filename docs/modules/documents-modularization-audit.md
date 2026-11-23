# Documents modularization — architecture audit

**Baseline:** `main` at `eb593928736899043ec997795baf19eae323abbf` (2026-11-23).
**Scope:** phases 1–4 refactor preparation/implementation; no merge into `main` before explicit approval. Phase 5 (runtime/integration/regression testing) is reserved for after merge.

## Phase 1 — inventory and current contract

### Existing module boundaries
- Backend module is already registered as an isolated Bee plugin: `src/plugins/documents/documents.plugin.ts`, with manifest dependencies `auth`, `organizations`, `files`. Its routes are mounted in the existing Fastify plugin context by the plugin manager; no parallel API server is needed.
- Documents owns its Mongo collections (`tenant_document_folders`, `tenant_documents`), indexes, presenter logic, folder hierarchy, publication, sharing, tenant-scoped authorization and resource ACL decisions.
- File binary persistence/metadata is delegated to `FilesStorageAdapter` and the Files plugin. Documents refers to stored file IDs rather than implementing a separate storage engine.
- Frontend is a standalone Angular component, but the UI and API client are not separated: `apps/web/src/app/documents/documents.component.ts` contains inline template/styles, state, endpoint calls, token headers, DTOs, formatting and browser download mechanics.

### Current endpoint contract (preserve during refactor)
Documents plugin:
- `GET /documents` (optional `folderId`)
- `POST /documents`
- `GET /documents/folders`
- `POST /documents/folders`
- `PATCH /documents/:documentId/location`
- `PATCH /documents/folders/:folderId/location`
- `GET /documents/share-targets?q=`
- `GET /documents/folders/:folderId/shares`
- `PUT /documents/folders/:folderId/shares`
- `PUT /documents/:documentId/publication`
- `GET /documents/:documentId/download`
- `GET /public/documents/:publicId` (public delivery; route remains part of the existing API surface)
Files plugin owns upload `POST /files`; Documents creates a record referencing the uploaded file. API response payloads (masked resource IDs, share target identifiers, download/public URLs, file metadata, and permission flags) are treated as compatibility contracts until tests justify changes.

### Responsibilities that must stay module-owned
Documents domain: document/folder metadata, validation, folder tree and move rules, publication state, sharing policy persistence, document DTO/presentation, route/controller behavior, and module permission declarations.

Core/infrastructure: HTTP runtime and plugin isolation, JWT/authentication primitives, organization/tenant resolution, shared permission/resource-ACL evaluation, plugin entitlement/installation checks, Mongo client, and private Files storage API. No Documents-specific rules should be moved into Core.

### Coupling and risks identified
1. Angular component calls endpoints with raw `fetch`, constructs URLs and auth headers, parses responses and downloads. It should depend on a Documents API client/service, not endpoint paths or transport details.
2. Backend plugin initialization currently contains route handlers, domain rules, database operations, storage adapter setup and response presentation in one large closure. The plugin boundary is real, but its internal separation is weak.
3. The frontend is not fully transport independent; the service boundary should centralize API base URL, auth headers, response/error normalization and request operations.
4. Documents is tenant scoped and resource-share aware. Refactoring must not relax tenant filtering, owner checks, folder ancestry checks, Files ACL checks, masked IDs, plugin entitlement/install checks or public publication constraints.
5. Sharing currently supports read grants for active organization teams/users, with owner-managed folders and preservation of user-deny rules. Keep these behaviors.
6. Documents is template-neutral in principle, but its styles include a Midnight Light host-context selector. UI changes in this task should avoid theme-specific coupling and preserve the design system conventions.

### Target design for phases 2–4
- Phase 2: isolate backend Documents HTTP registration and route contract from the module's domain/storage/authorization helpers, keeping the same Fastify plugin scope and API paths.
- Phase 3: extract an Angular Documents API service and typed contracts; component consumes the service. Keep component markup, interactions, state and UX unchanged.
- Phase 4: formalize the module/Core boundary, permission and Files dependencies, configuration access, API registration conventions, and docs. Ensure route ownership is discoverable/consistent with the plugin registry; don't create a second server or duplicate Core endpoints.

### Verification limits
This audit is based on source files fetched from GitHub. No local filesystem checkout, build, tests, browser interaction, API smoke test, Docker build or VPS runtime validation has been performed. Phase 5 must cover these before final completion.
