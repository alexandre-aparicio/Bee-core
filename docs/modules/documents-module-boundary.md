# Documents module/Core boundary (phase 4)

This document is the target contract for Documents in Bee-Core's modular runtime.

## Documents owns
- HTTP routes and API URL/DTO contract for document operations.
- Folder/document metadata, indexes, domain validation and folder hierarchy rules.
- Publication lifecycle and public-link validation.
- Folder share policies and decisions about share targets.
- Module-specific permission identifiers (currently `documents.read`, `documents.write`) and UI actions.
- Its Angular workspace, API client, presentation contracts and user interactions.

## Core provides (not Documents-specific)
- Fastify runtime and plugin encapsulation/lifecycle.
- Authentication/JWT primitives and active session context.
- Organization/tenant resolution and tenant-scoped collection primitives.
- Shared permission checks, resource ACL evaluation and tenant audit infrastructure.
- Plugin installation/entitlement lifecycle.
- MongoDB connection and shared Files plugin/storage service.

## Files dependency
Documents does not own binary storage. Upload goes through the Files API; a Documents record references the uploaded file identifier. Download/public delivery is performed by Documents only after its document policy and Files access checks, using the shared storage adapter. Files metadata and content remain Files-owned.

## Module/API registration
Documents is registered in `src/index.ts` with the existing plugin manager, and declares dependencies `auth`, `organizations`, `files`. Its endpoints stay in the same API process, isolated plugin scope. The route path contract is recorded in `documents.routes.ts` and must not be changed as part of this refactor without compatibility tests.

## Frontend boundary
The Angular component should own view state, rendering, interaction, and orchestration only. The Documents API service owns the API base, endpoint builders, typed DTOs, transport request dispatch and response/error contract. Component code must not implement fetch mechanics, token header assembly or API URL construction.

## Security invariants (must not regress)
- Authenticate dashboard sessions and resolve active organization/tenant for each protected request.
- Check plugin entitlement and installation, tenant permission and resource ACL.
- Never accept unmasked cross-tenant identifiers; validate resource references against the active session and tenant.
- Preserve folder ancestry checks, self/descendant move prevention and max hierarchy depth.
- Preserve folder ownership rules for share management, active membership/team validation, and retained explicit user deny rules.
- Files content access must remain tenant scoped and checked through Files/resource-access policy.
- Public delivery must require a valid opaque public identifier and an actively published record; private downloads remain no-store.

## Completion boundary
Phases 1–4 are source refactoring and architecture documentation only. Phase 5 integration/regression validation remains a separate pass after merge authorization. This branch must not be merged into `main` until the user explicitly approves.
