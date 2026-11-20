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
- Add tenant-scoped file upload, download, image delivery and deletion.
- Audit logs and background jobs carry tenant context.
- Acceptance: automated cross-tenant tests cover CRUD, files, images, SSE, search and background work; no route accepts a caller-selected tenant without membership validation.

### Phase 3 — Plugin registry and runtime contract
- Define and validate immutable plugin manifests and package metadata.
- Extend the plugin manager with dependency resolution, lifecycle states, scoped registration and failure isolation.
- Define backend API, permissions, frontend Angular registration, settings, migrations and health checks.
- Acceptance: a trusted sample plugin can register backend and Angular surfaces without modifying core code; invalid/incompatible packages are rejected.

### Phase 4 — Plans, subscriptions and entitlements
- Add plan catalog, plan-plugin mapping, subscription lifecycle and individual purchases.
- Build a server-side entitlement resolver and explain why a plugin is or is not available.
- Support trial, grace period, suspension and reactivation policies.
- Acceptance: plan-only, add-on purchase, expired subscription and revoked purchase scenarios are covered by integration tests; direct API calls cannot bypass entitlements.

### Phase 5 — Company-scoped plugin installer
- Add catalog visibility, install/update/rollback/uninstall APIs and UI.
- Add durable jobs, dependency ordering, migration locks and recovery.
- Separate installed, enabled, suspended and failed states.
- Acceptance: install, upgrade, failed migration recovery, dependency conflict, suspension, reactivation and uninstall are tested with two isolated companies.

### Phase 6 — First reference plugin and release readiness
- Build `hello-world` as a real reference plugin using the final contract.
- Verify per-company entitlement, installation, routes, permissions, data and UI.
- Run clean Docker install, MongoDB integration suite, Angular build, Playwright E2E, security checks and backup/restore drill.
- Only then consider production deployment.

## Current verified status (2026-11-20)

- Implemented foundation: Node.js/TypeScript, Fastify, MongoDB, Angular, Docker Compose, persistent authentication, refresh-token rotation/replay rejection, template selection/installation and tenant-scoped template preferences/SSE.
- Existing tenant model is still single-`tenantId` per user; it is not yet a company-membership system.
- Existing auth roles are coarse global user role strings; they are not yet tenant-scoped role assignments or granular permissions.
- Existing template package installer is not the business-plugin installer and has no commercial entitlement integration.
- General tenant-aware repositories, tenant file storage, company membership, commercial plans, subscriptions, purchases, entitlements and full plugin lifecycle remain to be implemented.
- The latest verified `main` commit at roadmap creation is `fe9be9a30e9f7c08c13b9fa0100b27eaf505d7e9`.
- GitHub Actions for that commit: Bee-Core CI and Bee-Core Angular CI both completed successfully. This is CI evidence for the current implemented scope, not proof of production readiness.
- Production VPS deployment is intentionally deferred.
