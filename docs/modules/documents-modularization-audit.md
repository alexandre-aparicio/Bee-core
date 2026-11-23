# Documents modularization — architecture audit

**Baseline:** `main` at `eb593928736899043ec997795baf19eae323abbf` (2026-11-23).
**Scope:** phases 1–4 refactor preparation/implementation; no merge into `main` before explicit approval. Phase 5 (runtime/integration/regression testing) is reserved for after merge.

## Phase 1 — inventory and current contract

### Existing module boundaries
- Backend module is already registered as an isolated Bee plugin: `src/plugins/documents/documents.plugin.ts`, with manifest dependencies `auth`, `organizations`, `files`. Its routes are mounted in the existing Fastify plugin context by the plugin manager; no parallel API server is needed.
- Backend separation has now been implemented on the refactor branch: `documents.plugin.ts` bootstraps storage/repository and delegates; `documents.routes.ts` holds stable route paths; `documents.controller.ts` registers 12 route handlers; `documents.service.ts` provides auth, tenant-scoped helpers, resource access and presentation; `documents.repository.ts` owns collection wiring/indexes and tenant-scoped collection wrappers; `documents.validators.ts` contains pure sanitization, public ID and tag rules.
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
1. Angular component originally called endpoints with raw `fetch`; this coupling is addressed on the branch by the Documents API service. Browser-specific blob/download presentation remains in the component.
2. Backend plugin initialization originally bundled route handlers, domain rules and database wiring; the branch extracts route registration, service helpers, repository wiring and validators into module-owned files. The controller remains responsible for HTTP handlers.
3. The frontend service boundary now centralizes API base URL, auth headers, response/error normalization and operation requests
4. Documents is tenant scoped and resource-share aware. Refactoring must not relax tenant filtering, owner checks, folder ancestry checks, Files ACL checks, masked IDs, plugin entitlement/install checks or public publication constraints.
5. Sharing currently supports read grants for active organization teams/users, with owner-managed folders and preservation of user-deny rules. Keep these behaviors.
6. Documents is template-neutral in principle, but its styles include a Midnight Light host-context selector. UI changes in this task should avoid theme-specific coupling and preserve the design system conventions.

### Refactor implementation status (branch only)
- Phase 2: route path constants and controller registration are extracted. The plugin no longer contains route handlers. Collection initialization/indexes and collection access are centralized in the Documents repository. Auth/resource-access/presentation helpers are extracted to the module service. Pure text/public-ID/tag validation is extracted to validators. Handler bodies remain in the controller, which is still sizeable.
- Phase 3: `DocumentsApiService` owns endpoint paths/builders, typed DTO contracts, authenticated request dispatch, JSON parsing/error normalization, upload request handling and workspace operation methods. The Angular component has no direct `fetch`, URL construction, endpoint literals, `Response.json()` or transport header assembly. It retains view state, interactions, file-picker validation and browser download/blob presentation.
- Phase 4: Core/Files/tenant/security responsibilities are documented. Plugin registration remains in the existing runtime.

### Target design for phases 2–4
- Phase 2: implemented backend separation into route contract/controller/service/repository/validators while keeping the same Fastify plugin scope and API paths.
- Phase 3: implemented Angular Documents API service and typed contracts; component consumes the service. Component markup, interactions and state/UX were not intentionally redesigned.
- Phase 4: formalize the module/Core boundary, permission and Files dependencies, configuration access, API registration conventions, and docs. Ensure route ownership is discoverable/consistent with the plugin registry; don't create a second server or duplicate Core endpoints.

### Verification limits
This audit is based on source files fetched from GitHub. No local filesystem checkout, build, tests, browser interaction, API smoke test, Docker build or VPS runtime validation has been performed. Phase 5 must cover these before final completion.
