# Bee-Core MVP progress

Updated: 2026-11-20 — `main` includes PR #20, PR #21 and PR #22 at `15faa3b85cae75fc1812017f5467752a3ccddf33`; post-merge backend, full-stack and production Compose workflows passed. Durable plugin installation is in progress on PR #23 and is not counted in the current main percentages.

## How progress is measured

The percentages below measure distinct product capabilities, not the number of passing workflows or PRs. Each capability is counted once. Re-running backend, Angular or Docker regression suites protects existing work but does not increase implementation progress.

- **MVP capability implementation: 85%.** Weighted assessment of the actual code and documented acceptance scope. The previous 78% estimate was too conservative: it treated marketplace purchase/install foundations and template capabilities as broadly pending even though their basic APIs, persistence and dashboard surfaces are already implemented. It also did not publish a repeatable scoring breakdown.
- **Release readiness: 68%.** This is deliberately lower because production hardening, full tenant-route review, backup/restore, TLS/monitoring and some release gates remain incomplete.

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
| Plugin lifecycle and package ecosystem | 15% | 65% | Trusted packages, manifests, dependencies, migrations, install/uninstall and static Angular registry; immutable signed archives, durable jobs, upgrades/rollback and dynamic frontend registration remain. |
| Tenant isolation and security | 5% | 70% | Tenant context, scoped collection helper, IDOR regression coverage and auth audit; not every route, event and background task has been audited. |
| Production operations and release packaging | 5% | 75% | Production Compose build/start/health, host-port isolation and Mongo/session persistence test; TLS, backup/restore drills, monitoring and release runbook hardening remain. |

The weighted capability score is **85%**. The broader SaaS plugin-platform roadmap is approximately **67%** because durable third-party package distribution, billing-provider integration, plugin upgrade/rollback and universal tenant-isolation review extend beyond the Docker-installable MVP. It is an engineering estimate, not test coverage or a claim that all production requirements are complete.

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

1. Merge and validate PR #20: audit invitation lifecycle, role CRUD/changes, member suspension, plugin install/uninstall and permission denials.
2. Close superseded PRs #6, #9, #12, #13 and #14 after PR #20 is integrated; retain their branches for history.
3. Complete tenant-isolation review across every protected route, file/media path, SSE channel and asynchronous entrypoint.
4. Implement durable plugin install/update jobs, immutable signed package storage, version upgrade/rollback and manifest-driven frontend registration.
5. Add payment-provider integration, checkout/subscription management and billing reconciliation.
6. Complete TLS, backups/restore drills, monitoring, production runbook and final clean-install release gate.
7. Tag `0.1.0` only after the release gates pass.

## Links

- Repository: https://github.com/alexandre-aparicio/Bee-core
- PR #17: https://github.com/alexandre-aparicio/Bee-core/pull/17
- PR #18: https://github.com/alexandre-aparicio/Bee-core/pull/18
- PR #19: https://github.com/alexandre-aparicio/Bee-core/pull/19
- PR #20: https://github.com/alexandre-aparicio/Bee-core/pull/20
- Actions: https://github.com/alexandre-aparicio/Bee-core/actions
