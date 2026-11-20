# Bee-Core MVP progress

Updated: 2026-11-20 — `main` is at `b2cbc63e9c002d6a20915473ece4425cbb7df9bd`, including PRs #29–#32. PR #32's production Compose check (`44777108094`) passed before merge, and post-merge production Compose (`44777925729`) passed on this exact main commit.

## How progress is measured

The percentages below measure distinct product capabilities, not the number of passing workflows or PRs. Each capability is counted once. Re-running backend, Angular or Docker regression suites protects existing work but does not increase implementation progress.

- **MVP capability implementation: 88.5% (89% rounded).** Weighted assessment of the actual code and documented acceptance scope. The previous 78% estimate was too conservative: it treated marketplace purchase/install foundations and template capabilities as broadly pending even though their basic APIs, persistence and dashboard surfaces are already implemented. It also did not publish a repeatable scoring breakdown.
- **Release readiness: 72% (provisional).** This is deliberately lower because production hardening, full tenant-route review, encrypted off-site backup operations, TLS/monitoring and some release gates remain incomplete.

## Capability breakdown (current `main`)

| Capability | Weight | Estimated completion | Evidence / remaining scope |
|---|---:|---|
| Core runtime, Fastify, plugin registry/lifecycle and event bus | 10% | 95% | Runtime and lifecycle hooks exist; richer package runtime and lifecycle isolation remain. |
| MongoDB persistence and Docker foundation | 10% | 95% | MongoDB is primary persistence; Compose and production profile are present. |
| Authentication and sessions | 10% | 90% | Login, JWT, refresh rotation/replay rejection, logout and persistence; MFA, recovery, verification and rate limiting remain. |
| Companies, memberships and roles | 15% | 90% | Multi-company membership, active tenant context, built-in/custom roles, permissions and session revocation; owner transfer and full route audit remain. |
| Angular public/dashboard/auth UI | 10% | 90% | Responsive shells, auth, company selector, members, marketplace and browser smoke tests; broader product workflows and UX polish remain. |
| Template engine | 10% | 90% | Separate public/dashboard layouts, tenant tokens, installation/selection and SSE updates; arbitrary remote structural Angular bundles are intentionally not supported yet. |
| Marketplace and entitlements | 10% | 85% | Catalog, Starter/Pro/Enterprise plans, trial, purchases, subscription updates, entitlement checks and dashboard install controls; checkout/provider integration and billing UX remain. |
| Plugin lifecycle and package ecosystem | 15% | 86% | Trusted packages, manifests, durable install/update/uninstall jobs, lease recovery, retries, tenant-scoped status, Angular progress, migration-aware updates and deterministic transitive dependency ordering; full rollback guarantees, immutable signed archives, distributed scheduling and dynamic frontend registration remain. |
| Tenant isolation and security | 5% | 72% | Tenant context, scoped collection helper, IDOR regression coverage, auth audit and protection against MongoDB update operators mutating tenantId; complete route, file/media, webhook and background-task audit remains. |
| Production operations and release packaging | 5% | 80% | Production Compose build/start/health, host-port isolation, Mongo/session persistence and automated MongoDB dump/isolated-restore sentinel round-trip; encrypted off-site backup policy, TLS, monitoring and clean-install release gate remain. |

The weighted capability score is **88.5%** (89% rounded; 88.5% before rounding). The broader SaaS plugin-platform roadmap is approximately **67%** because durable third-party package distribution, billing-provider integration, plugin upgrade/rollback and universal tenant-isolation review extend beyond the Docker-installable MVP. It is an engineering estimate, not test coverage or a claim that all production requirements are complete.

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
- PR #27 — durable asynchronous uninstall, lifecycle-operation conflict prevention, `uninstalling` state recovery, tenant-scoped job status, deduplicated requests, preserved company data and Angular progress. Pre-merge backend/full-stack and Angular browser checks passed on `b9f8136`; post-merge backend/full-stack run `44770367394` and production Compose run `44770367267` passed on `4ad792c`; post-merge Angular run `44770367382` has completed its production build and is still in the Chromium/browser-smoke step.

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

1. Complete plugin update rollback guarantees and failure-injection coverage; durable updates and dependency ordering are now implemented.
2. Complete tenant-isolation review across protected routes, file/media paths, webhooks and background tasks; PR #22 closes the private template SSE revocation gap but not the full audit.
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
- Actions: https://github.com/alexandre-aparicio/Bee-core/actions

- PR #29 — prevents tenant ownership mutation through MongoDB update operators, including operator-based and nested-path changes.
- PR #30 — durable tenant-scoped plugin update jobs, entitlement/permission rechecks, migration-aware updates, crash recovery around version switching, audit events and Angular update progress. Backend/full-stack and Angular checks passed before merge.
- PR #31 — deterministic transitive dependency-first ordering, rejection of missing dependencies and cycles, dependency entitlement/installation checks on install/update, and end-to-end marketplace update coverage. Pre-merge CI run `44774469128` passed; post-merge CI `44774847013` and production Compose `44774847047` passed on main SHA `4dce576`.
- PR #32 — automated MongoDB logical dump, isolated restore and sentinel verification in production Compose CI. PR-head run `44777108094` and post-merge main run `44777925729` passed on `b2cbc63`.

