# Bee-Core MVP progress

Updated: 2026-11-20 — code validation baseline is main commit `d69b09e757741c0246bc3e74d3b39b7c7573a279` (PRs #29–#35); this progress reconciliation is integrated by PR #36 at `84bd3eb9dc074f46e6325358eb33efd6fba71261`. PR #34 post-merge backend/full-stack CI (`44779902641`) and production Compose (`44779902679`) passed on `a87db5d`; PR #35 backend/auth and Docker full-stack checks passed on exact head `09237c13` before merge; post-merge backend/full-stack CI (`44780741763`) and production Compose (`44780741842`) passed on exact main SHA `d69b09e`.

## How progress is measured

The percentages below measure distinct product capabilities, not the number of passing workflows or PRs. Each capability is counted once. Re-running backend, Angular or Docker regression suites protects existing work but does not increase implementation progress.

- **MVP capability implementation: 92.15% (92% rounded).** Re-audited against the Docker-installable MVP 0.1 acceptance boundary, not the entire commercial SaaS roadmap. The earlier score incorrectly treated deferred commercial features (payment-provider checkout, arbitrary third-party archive distribution and remote Angular bundles) as incomplete MVP capabilities even though the current trusted, statically bundled plugin model already delivers the MVP workflows. This score counts implemented and tested MVP capabilities once; remaining production and SaaS work is reported separately below.
- **Release readiness: 72% (provisional; unchanged).** This is deliberately lower because production hardening, full tenant-route review, encrypted off-site backup operations, TLS/monitoring and some release gates remain incomplete.

## Capability breakdown (current `main`)

| Capability | Weight | Estimated completion | Evidence / remaining scope |
|---|---:|---|
| Core runtime, Fastify, plugin registry/lifecycle and event bus | 10% | 95% | Runtime, dependency-aware startup, lifecycle hooks and event bus are implemented; richer package runtime and process-level isolation remain. |
| MongoDB persistence and Docker foundation | 10% | 95% | MongoDB persistence, tenant indexes, production Compose, health checks, persistent volumes and restore drill are implemented; operational hardening remains. |
| Authentication and sessions | 10% | 93% | Login, JWT, refresh rotation/replay rejection, persisted sessions, logout, live membership/role revalidation and stale-role regression coverage; MFA, account recovery, verification and advanced rate limiting remain post-MVP hardening. |
| Companies, memberships and roles | 15% | 94% | Multi-company membership, active company switching, built-in/custom roles, owner-only role administration, invitations, permissions, quotas, audit and session revocation; owner transfer and exhaustive route audit remain. |
| Angular public/dashboard/auth UI | 10% | 92% | Mobile-first public/dashboard/auth shells, company switching, member management, marketplace, plugin outlet and lifecycle progress are implemented and exercised in browser/full-stack CI; broader business-plugin UX remains. |
| Template engine | 10% | 93% | Tenant-scoped public/dashboard templates, domains, installation/selection, preferences, themes and private SSE revocation are implemented; arbitrary remote structural Angular bundles remain intentionally outside the trusted MVP model. |
| Marketplace and entitlements | 10% | 90% | Company-filtered catalog, Starter/Pro/Enterprise plans, trial, purchases, subscription webhooks, entitlement/dependency checks, quotas and dashboard controls are implemented; provider checkout, invoices and customer billing portal remain commercial SaaS work. |
| Plugin lifecycle and package ecosystem | 15% | 93% | Trusted manifests, strict dependency/path/duplicate validation, deterministic dependency ordering, durable install/update/uninstall jobs, lease renewal, stale-worker rejection, bounded retries, tenant-scoped status, Angular progress and migration compensation after lifecycle-hook failures; immutable third-party archives, signature verification and remote frontend registration remain. |
| Tenant isolation and security | 5% | 84% | Live server-resolved tenant context across auth, template and organization administration, TenantCollection, cross-company IDOR tests, private tenant files, scoped lifecycle jobs and ownership-mutation protection; exhaustive route, webhook and asynchronous-path audit remains. |
| Production operations and release packaging | 5% | 82% | Production Compose build/start/health, host-port isolation, Mongo/session persistence and automated MongoDB dump/isolated-restore sentinel round-trip; encrypted off-site backup retention, TLS, monitoring and final clean-install release gate remain. |

The weighted capability score is **92.15%** (92% rounded). The broader SaaS plugin-platform roadmap remains approximately **67%** because immutable third-party package distribution, cryptographic publisher trust, payment-provider integration, dynamic frontend registration and universal tenant-isolation review extend beyond the Docker-installable MVP. The score is an engineering estimate of distinct MVP capabilities, not test coverage or production readiness.

## Verified on `main`

- PR #1 — MongoDB migration.
- PR #3 — public/dashboard/auth UI foundation.
- PR #4 — Angular migration.
- PR #5 — full-stack CI foundation.
- PR #7 — production Docker Compose overlay and deployment guide.
- PR #8 — tenant cross-company IDOR mutation regression tests.
- PR #10 — tenant-scoped audit-log regression test.
- PR #17 — persisted custom company roles, tenant permission resolution, owner-only management, assignment and session revocation.
- PR #18 — tenant-scoped successful login/logout audit events.
- PR #19 — production Compose CI, port isolation, stack health and refresh-session persistence across MongoDB/API restarts.
- PR #20 — tenant-scoped audit events for invitations, custom roles, membership changes/suspension, plugin lifecycle and permission denials.
- PR #22 — private template SSE session and active-membership revalidation; post-merge backend/full-stack CI run `44765696476` and production Compose run `44765696509` passed on `15faa3b`.
- PR #23 — durable company-scoped installation jobs, active-job deduplication, lease recovery, bounded retries, tenant-scoped job status and Angular installation progress. Backend/MongoDB, Docker full-stack and Angular browser smoke checks passed before merge; post-merge backend/full-stack run `44767972917`, Angular run `44767972896` and production Compose run `44767972871` all passed on `67986b5`.
- PR #27 — durable asynchronous uninstall, lifecycle-operation conflict prevention, `uninstalling` state recovery, tenant-scoped job status, deduplicated requests, preserved company data and Angular progress. Pre-merge backend/full-stack and Angular browser checks passed on `b9f8136`; post-merge backend/full-stack run `44770367394`, production Compose run `44770367267` and Angular browser-smoke run `44770367382` all passed on `4ad792c`.
- PR #32 — automated MongoDB logical dump, isolated restore, sentinel verification and temporary-database cleanup. PR-head production Compose run `44777108094` and post-merge run `44777925729` passed.
- PR #33 — template/domain write authorization now uses the live tenant membership role; stale JWT `admin` claim regression test. Backend/auth and Docker full-stack checks passed on PR head `858d044`; post-merge CI and production Compose passed on main SHA `02e7766` (runs `44778714998` and `44778715071`).
- PR #34 — migration compensation after lifecycle-hook failures, reverse-order rollback and persisted rollback failures; plugin manifest validation for semantic dependency ranges, duplicate declarations and unsafe paths; lifecycle worker lease renewal and rejection of stale worker completion. Backend/MongoDB and Docker full-stack CI passed on PR head `cb511cad`; post-merge backend/full-stack CI (`44779902641`) and production Compose (`44779902679`) passed on `a87db5d`.
- PR #35 — organization routes now carry the live server-resolved `TenantContext` for permission checks; stale JWT `owner` claim cannot create company roles. Backend/auth and Docker full-stack CI passed on exact PR head `09237c13`; post-merge backend/full-stack CI (`44780741763`) and production Compose (`44780741842`) passed on exact main SHA `d69b09e`.

PR #20 passed backend typecheck/build/MongoDB auth tests and Docker Compose full-stack integration. The dedicated Angular workflow was correctly skipped because no Angular files changed; Angular was built and exercised within the full-stack workflow. Post-merge checks passed on `1c96e8100d2145f518a0232d300122c866551c1b`: backend and full-stack CI run `44764328710`, plus production Compose run `44764328866`.

PR #19's production Compose workflow also passed on its reviewed PR head, including the production overlay validation.

## Why progress appeared stuck

1. PRs #12, #13 and #14 were stacked on old security branches. Each later PR included earlier commits and old copies of the audit/role foundation already integrated by PRs #17 and #18. Comparing their heads directly with `main` showed 12 commits behind and duplicated foundation files. Merging them unchanged would reintroduce stale code.
2. PR #9 repeats deployment files/workflow already superseded by PR #19 and is marked dirty against `main`.
3. PR #6 repeats the original custom-role/audit foundation, now superseded by PR #17/#18, and is marked dirty.
4. Every PR reruns the same broad regression workflows. Those runs are valuable gates, but repeated green CI does not represent new product functionality.
5. The former progress percentage had no published weighting and described already implemented marketplace/install/template foundations as remaining work.

PR #20 selectively ported the unique audit functionality onto current `main`, rather than merging the stacked branches wholesale.

## Active next work

1. Complete package archive signature/digest verification and trusted publisher key management; migration compensation and worker lease recovery are now covered.
2. Complete tenant-isolation review across remaining protected routes, file/media paths, webhooks and background tasks; PRs #33 and #35 close stale-JWT authorization gaps in template and organization administration.
3. Implement immutable signed package archives, signature/digest verification and manifest-driven dynamic frontend registration.
4. Add payment-provider integration, checkout/subscription management and billing reconciliation.
5. Complete TLS, encrypted off-site backup retention/monitoring, production runbook and final clean-install release gate; MongoDB dump/restore mechanics are now covered by CI.
6. Build and validate the `hello-world` reference plugin against the final manifest and tenant lifecycle contract.
7. Tag `0.1.0` only after all release gates pass.

## Links

- Repository: https://github.com/alexandre-aparicio/Bee-core
- PR #17: https://github.com/alexandre-aparicio/Bee-core/pull/17
- PR #18: https://github.com/alexandre-aparicio/Bee-core/pull/18
- PR #19: https://github.com/alexandre-aparicio/Bee-core/pull/19
- PR #20: https://github.com/alexandre-aparicio/Bee-core/pull/20
- PR #29: https://github.com/alexandre-aparicio/Bee-core/pull/29
- PR #30: https://github.com/alexandre-aparicio/Bee-core/pull/30
- PR #31: https://github.com/alexandre-aparicio/Bee-core/pull/31
- PR #32: https://github.com/alexandre-aparicio/Bee-core/pull/32
- PR #33: https://github.com/alexandre-aparicio/Bee-core/pull/33
- PR #34: https://github.com/alexandre-aparicio/Bee-core/pull/34
- PR #35: https://github.com/alexandre-aparicio/Bee-core/pull/35
- Actions: https://github.com/alexandre-aparicio/Bee-core/actions

- PR #29 — prevents tenant ownership mutation through MongoDB update operators, including operator-based and nested-path changes.
- PR #30 — durable tenant-scoped plugin update jobs, entitlement/permission rechecks, migration-aware updates, crash recovery around version switching, audit events and Angular update progress. Backend/full-stack and Angular checks passed before merge.
- PR #31 — deterministic transitive dependency-first ordering, rejection of missing dependencies and cycles, dependency entitlement/installation checks on install/update, and end-to-end marketplace update coverage. Pre-merge CI run `44774469128` passed; post-merge CI `44774847013` and production Compose `44774847047` passed on main SHA `4dce576`.
- PR #32 — automated MongoDB logical dump, isolated restore and sentinel verification in production Compose CI. PR-head run `44777108094` and post-merge main run `44777925729` passed on `b2cbc63`.


## Platform Superadministrator (PR #43 — merged into main)

Platform-wide superadministrator foundation is merged into `main` at `53a427c`. It is not included in the MVP capability completion percentages pending focused verification and acceptance review.

- Persisted bootstrap `platformRole: superadmin`, with existing bootstrap credentials preserved.
- Auth JWT/login/refresh profile carries the platform role.
- Separate platform-admin plugin validates dashboard client, JWT session, persisted active refresh session, enabled user and persisted superadmin role.
- Global company list/create/status endpoints and Angular panel are added.
- Integration test added for superadmin bootstrap, company create/list/activate/suspend and tenant-user denial.
- Validation at merge: backend TypeScript check and build passed; Angular CI passed; Docker Compose full-stack integration passed (API/plugin registry, Nginx proxy, auth and refresh rotation). Backend auth integration test job was still running at merge time and is pending follow-up verification.
- Details: `docs/platform-superadmin.md` and PR https://github.com/alexandre-aparicio/Bee-core/pull/43.
- Main merge commit: `53a427cfd4419d0fd658f7715553ed60e96684d5`.


## Dashboard navigation and Settings reorganization (in progress)

- Dashboard content is split into sections: Dashboard, Plugins, Organization, Activity, Settings, and Platform Administration.
- Platform Superadmin menu omits tenant Organization management and exposes platform/global company controls plus additional platform sections. Owners, admins, managers and members see reduced menu sets; members retain Organization to accept invitations.
- Menu visibility is a frontend convenience only; backend permission checks remain authoritative.
- Theme controls moved from the public footer to authenticated Settings routes: Dashboard Theme, Public Theme, and Branding. The theme manager accepts a target and filters the trusted package catalog.
- The color-token palette remains shared between public and dashboard surfaces in this first pass; independent palettes are a follow-up. Domain, integrations, security, and system pages are navigation placeholders only.
- Pending verification: Angular compile, browser smoke, and role-based navigation tests. This PR is not merged.
