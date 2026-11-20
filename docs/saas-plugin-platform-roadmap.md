# Bee-Core SaaS & Plugin Platform Roadmap

Status: architecture baseline, implementation in progress  
Target branch: `main`  
Deployment policy: do not deploy to the production VPS until the release gates below pass.

## Product invariants

1. A company (tenant) owns its business data, files, images, plugin configuration, installed-plugin state, and tenant-level settings.
2. Users access a company through a membership. A membership carries the user's role and permissions in that company. The data model must support multiple memberships per user, even if the initial onboarding flow creates one company membership.
3. The active company is selected explicitly and is validated by the backend on every request. A client-supplied tenant ID is never trusted by itself.
4. Plugin code and approved versions are stored centrally. Installation, configuration, entitlements, activation, and plugin data are scoped to a company.
5. A company can discover or install only plugins allowed by its effective entitlements (plan, active subscription, individual purchase, trial, and dependency rules).
6. Licensing, authorization, and tenant isolation are enforced server-side. Hiding a menu or button is not security.
7. Plugin installation and upgrades are versioned, idempotent, migration-aware, observable, and recoverable. A failed install must not leave a half-installed plugin.
8. Tenant data is preserved when a subscription expires or a plugin is suspended. Suspension blocks new use according to policy; it does not silently delete data.
9. Public and dashboard template choices remain tenant-scoped. Template packages are distinct from business plugins.
10. No production deployment until fresh-install, security, tenant-isolation, plugin lifecycle, and browser E2E release gates pass.

## Target domain model (MongoDB)

### Identity and organizations
- `users`: global identity and credentials; no company-specific role as the source of truth.
- `companies` (or existing `tenants` during migration): company identity, status, domains, metadata.
- `memberships`: `userId`, `tenantId`, `roleId`, status, invitation/acceptance timestamps; unique active membership per user/company.
- `roles`: system defaults and tenant-custom roles.
- `permissions`: stable permission keys, e.g. `crm.contacts.read`, `crm.contacts.write`, `plugins.install`.
- `role_permissions`: role-to-permission assignments.
- `user_sessions` / refresh sessions: session identity and selected company context; tokens must be revalidated against current membership.

### Plugin registry and lifecycle
- `plugins`: central plugin metadata, visibility, publisher, compatibility and lifecycle policy.
- `plugin_versions`: immutable version manifests, package digest/signature, runtime compatibility, migrations and dependencies.
- `tenant_plugins`: per-company installed version, status, settings, install/update timestamps and failure state.
- `plugin_install_jobs`: durable installation/update/uninstall job state and logs.
- `plugin_migrations`: migration execution history and checksums.

### Commercial access
- `plans`: commercial plan definitions.
- `plan_plugins`: plugin entitlements included in each plan.
- `subscriptions`: company subscription, status, billing period and grace period.
- `plugin_purchases`: individual plugin purchases and license terms.
- `tenant_entitlements`: effective, explainable entitlement projection per company/plugin, with source, status, limits and validity dates.
- Entitlement projection is recomputable from plans, subscriptions, purchases, trials and dependency rules. It is not the sole source of truth.

### Tenant resources
- Tenant-owned records include mandatory `tenantId` and tenant-scoped unique indexes.
- File metadata includes `tenantId`, owner/resource reference, storage key, MIME type, size and checksum.
- Physical storage may use local volumes or S3-compatible object storage, but access is mediated by an authenticated tenant-aware API.
- Shared platform assets are explicitly marked as platform-owned; tenant-private assets are never globally addressable.

## Plugin package contract

A plugin manifest must declare:
- stable ID, name, semantic version, publisher and description;
- minimum/maximum Bee-Core runtime compatibility;
- required and optional dependencies with compatible version ranges;
- permissions and default role grants (never silently grant administrator-only permissions);
- backend entry points and API capabilities;
- frontend routes, navigation entries and compiled Angular component registrations;
- tenant data collections and indexes;
- install, upgrade and uninstall migrations;
- settings schema and secret-handling requirements;
- health check and lifecycle hooks.

Only trusted, reviewed packages are executable. Do not execute arbitrary uploaded JavaScript, HTML, or Angular bundles from tenant storage. Package signature/digest and compatibility are verified before activation.

## Plugin lifecycle

1. Discover: return only catalog entries visible to the company and permitted by its entitlements.
2. Resolve: validate entitlement, runtime compatibility, dependency graph, conflicts and required permissions.
3. Stage: record an installation job and stage the exact immutable package version.
4. Migrate: run idempotent, ordered migrations with checkpoints and checksums.
5. Register: persist tenant plugin state, routes, menus, permissions and settings.
6. Activate: make capabilities available only after successful installation and authorization checks.
7. Upgrade: stage new version, backup/verify affected data where needed, migrate, switch version, and retain a recoverable previous state.
8. Suspend: disable execution when entitlement expires or is revoked; preserve company data and show a clear status.
9. Uninstall: require explicit confirmation, resolve dependents, define data-retention/export policy, and never silently erase tenant data.

## Implementation phases and acceptance gates

### Phase 0 — Existing foundation and architecture
- Keep Node.js/TypeScript, Angular and native MongoDB.
- Preserve the existing template system; do not conflate template packages with business plugins.
- Keep Docker Compose and CI as the development/release validation path.
- Document this roadmap and keep it updated with implementation status.

### Phase 1 — Companies, memberships and authorization
- Normalize companies and memberships; migrate legacy `users.tenantId` safely.
- Add invitation/acceptance and membership lifecycle.
- Add company switching with server-validated membership and session context.
- Add system roles (Owner, Admin, Manager, Member) and permission checks.
- Enforce authorization on every protected API and SSE channel.
- Acceptance: a user can belong to two companies with different roles; switching changes the server context; removing membership invalidates access; cross-company IDOR tests return 403/404.

### Phase 2 — Tenant isolation and storage
- Introduce a tenant context resolver and tenant-aware repository helpers.
- Require tenant scope for every tenant-owned read/write/delete and unique index.
- Add tenant-scoped file upload, download, image delivery and deletion. (Initial local-volume `files` plugin implemented: private uploads/downloads/deletion, tenant-scoped metadata and a dedicated Docker volume; cloud storage and media processing remain pending.)
- Audit logs and background jobs carry tenant context.
- Acceptance: automated cross-tenant tests cover CRUD, files, images, SSE, search and background work; no route accepts a caller-selected tenant without membership validation.

### Phase 3 — Plugin registry and runtime contract
- Define and validate immutable plugin manifests and package metadata. (Initial manifest contract and validator implemented.)
- Extend the plugin manager with dependency resolution, lifecycle states, scoped registration and failure isolation. (Trusted compiled packages and company installation state are implemented; arbitrary package loading and durable lifecycle jobs remain pending.)
- Define backend API, permissions, frontend Angular registration, settings, migrations and health checks. (The Notes reference plugin validates tenant-scoped API routes and role permissions.)
- Acceptance: a trusted sample plugin can register backend and Angular surfaces without modifying core code; invalid/incompatible packages are rejected.

### Phase 4 — Plans, subscriptions and entitlements
- Add plan catalog, plan-plugin mapping, subscription lifecycle and individual purchases. (Starter, Pro and Enterprise plans, tenant subscriptions and purchase records are modeled; Starter trial seeding is implemented.)
- Build a server-side entitlement resolver and explain why a plugin is or is not available. (Marketplace API filters visible packages by company plan and active purchases; direct install requests re-check entitlement server-side.)
- Support trial, grace period, suspension and reactivation policies. (Basic trial expiry and purchase revocation/expiry are modeled; billing provider, grace periods and renewal workflows remain pending.)
- Acceptance: plan-only, add-on purchase, expired subscription and revoked purchase scenarios are covered by integration tests; direct API calls cannot bypass entitlements.

### Phase 5 — Company-scoped plugin installer
- Add catalog visibility, install/update/rollback/uninstall APIs and UI. (Tenant-filtered catalog, install/uninstall APIs, per-company lifecycle state and a basic dashboard marketplace UI are implemented; upgrade and rollback are pending.)
- Add durable jobs, dependency ordering, migration locks and recovery. (Installation now uses a MongoDB-backed durable job queue with tenant/plugin deduplication, atomic worker leases, bounded retries, expired-lease recovery and tenant-scoped job status. Install hooks and migrations run asynchronously; shutdown drains the active worker. Uninstall now also uses durable company-scoped jobs with active-operation deduplication, `uninstalling` state, worker lease recovery and Angular progress (PR #27). Failed hooks restore the installed state; successful uninstall preserves tenant business data. Upgrade/rollback, distributed worker scaling and dependency graph ordering remain pending.)
- Separate installed, enabled, suspended and failed states. (Initial installed/installing/failed/uninstalled states exist; entitlement suspension/reactivation handling remains pending.)
- Acceptance: install, upgrade, failed migration recovery, dependency conflict, suspension, reactivation and uninstall are tested with two isolated companies. Install/uninstall job deduplication, tenant-scoped status, expired-worker-lease recovery, conflicting-operation rejection and data preservation are covered; full upgrade/rollback, dependency ordering and multi-worker stress coverage remain.

### Phase 6 — First reference plugin and release readiness
- Build `hello-world` as a real reference plugin using the final contract.
- Verify per-company entitlement, installation, routes, permissions, data and UI.
- Run clean Docker install, MongoDB integration suite, Angular build, Playwright E2E, security checks and backup/restore drill.
- Only then consider production deployment.

## Current verified status (2026-11-20)

- PR #22 — private template SSE now revalidates persisted session and tenant membership every five seconds, fails closed on revocation, and has a MongoDB integration regression test. Post-merge backend/full-stack CI and production Compose workflows passed on `15faa3b85cae75fc1812017f5467752a3ccddf33`.
- PR #23 — MongoDB-backed durable company-scoped install jobs, worker lease recovery, retries, tenant-scoped status and Angular progress. Pre-merge backend/MongoDB, Docker full-stack and Angular browser tests passed; post-merge backend/full-stack, Angular and production Compose workflows passed on `67986b586c95974b5a540efa2ee9ee1f41102996`.
- PR #27 — durable asynchronous uninstall jobs, deduplicated concurrent requests, conflicting install/uninstall rejection, `uninstalling` state recovery and preserved tenant data. Pre-merge backend/full-stack and Angular browser checks passed on `b9f8136`; post-merge backend/full-stack run `44770367394` and production Compose run `44770367267` passed on `4ad792c`; post-merge Angular run `44770367382` remains in Chromium/browser smoke after its build passed.
- PR #27 — durable asynchronous uninstall jobs, deduplicated concurrent requests, conflicting install/uninstall rejection, `uninstalling` state recovery and preserved tenant data. Pre-merge backend/full-stack and Angular workflows passed on `b9f8136`; post-merge checks are running on `4ad792c`.

- Implemented foundation: Node.js/TypeScript, Fastify, MongoDB, Angular, Docker Compose, persistent authentication, refresh-token rotation/replay rejection, template selection/installation and tenant-scoped template preferences/SSE.
- Company membership foundation is implemented: legacy `users.tenantId` values are backfilled into `memberships`; users can list/create companies, activate a company in the current refresh-token session, and list/add/update/suspend company members.
- Company roles include Owner, Admin, Manager and Member. Login and company switching derive effective roles from the active membership, role changes and membership suspension revoke affected refresh sessions, and the migration normalizes/enforces one active owner per company.
- Company invitations now have hashed one-time acceptance tokens, seven-day expiry, email/account matching, cancellation and duplicate-pending protection. The API and a basic dashboard member/invitation panel are implemented; invitation email delivery and self-service account onboarding are not yet implemented.
- A shared tenant context resolver validates JWT audience, session, client access, active membership and company status. A shared role permission matrix is exposed by `/companies/active/permissions`; organization membership routes use permission checks. The dashboard includes an active-company selector.
- A basic company-members panel now supports role changes, member suspension, invitation creation/cancellation and invitation-token acceptance; only owners can assign Admin and Admins cannot manage peer Admin roles. Remaining Phase 1 work: explicit owner transfer, email delivery/account onboarding and a complete audit of every protected route and SSE channel. Custom role CRUD, owner-only management, permission resolution, assignment and session revocation are implemented.
- Existing template package installer remains distinct from business plugins. A basic company-facing dashboard marketplace now lists plan-visible packages and provides role-gated install/uninstall controls. Checkout, subscription management and payment-provider UI remain pending.
- A tenant-scoped MongoDB collection facade now forces tenant predicates on reads/updates/deletes, stamps and validates inserts, prevents tenantId mutation and creates tenant-prefixed unique indexes. Integration tests cover cross-tenant reads/writes/deletes and same business keys across companies.
- The facade, shared context resolver and private file/image storage are foundations, not a claim of universal isolation: existing collections/routes have not all been migrated, and tenant context is not yet carried through every background job or webhook. Authenticated private template SSE streams now revalidate session, membership and company status every five seconds and close on revocation; public template snapshots remain host-scoped.
- The commercial foundation now has persisted `plugin_catalog` and `plugin_plans`, tenant-scoped subscriptions, purchases and installation records. Starter, Pro and Enterprise plans are seeded; Starter includes system Files and can see Notes as a purchasable add-on; Pro/Enterprise include Notes, and individual purchases can grant access to one company.
- The marketplace API filters catalog visibility by the active company's plan and purchases. Install/uninstall endpoints re-check entitlements and company permissions. The Notes reference plugin has CRUD routes and a statically bundled Angular component, mounted by a generic plugin outlet only when the active company is entitled and the plugin is installed. Routes and data are gated by installation, entitlement and role permissions; integration tests cover purchase, revocation, uninstall and cross-company note isolation.
- An internal shared-secret bearer webhook accepts subscription updates, plugin purchases and revocations. It is not a provider-signed webhook and is not connected to Stripe or another payment processor. Checkout, customer portal, reconciliation, renewals and billing UI remain pending.
- The plugin manifest validator and generic Angular plugin outlet are present, but the component registry remains statically compiled and package artifacts are trusted code bundled into the runtime. Durable company-scoped installation jobs are implemented by PR #23. Immutable archive storage, install-time signature verification, versioned migration rollback, full dependency graph and manifest-driven dynamic route/component registration remain pending.
- Remaining lifecycle work: asynchronous uninstall/update jobs, central immutable package archive storage, signature/digest verification during install, versioned migration rollback, dependency ordering and manifest-driven dynamic frontend route/component registration.
- The initial roadmap commit was `9627d652aeca321825f99ff66e033535d3d9653f`. The latest implementation commit is `1c96e8100d2145f518a0232d300122c866551c1b`; PR #20 adds tenant-scoped audit coverage for invitation lifecycle, custom role CRUD, membership role changes/suspension, plugin install/uninstall and permission denials.
- PR #20 was merged as `1c96e8100d2145f518a0232d300122c866551c1b`; PR #21 reconciled the roadmap and progress documents. Post-merge main workflows completed successfully: backend typecheck/build/MongoDB auth tests, Docker full-stack integration and production Compose profile (port exposure, health, volumes and refresh-session persistence across restarts). These checks are not a production security audit or a guarantee of 100% defect-free behavior.
- Production VPS deployment is intentionally deferred.

- Plan storage quotas are enforced by the Files plugin using atomic per-company reservations; usage is tracked independently by tenant. User-count limits are enforced when adding or accepting company memberships.
