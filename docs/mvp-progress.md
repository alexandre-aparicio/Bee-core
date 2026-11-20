# Bee-Core MVP progress

Updated: 2026-11-20 — PR #19 is merged into `main` as `9fc30a3e3d69bdb215e12f4588f51835f3b35280`.

This document distinguishes merged implementation from verified release evidence. A merged change is not considered fully validated until its relevant checks pass on the main-branch commit.

## Integrated into `main`

- PR #1 — MongoDB migration.
- PR #3 — public/dashboard/auth UI foundation.
- PR #4 — Angular migration.
- PR #5 — full-stack CI foundation.
- PR #7 — production Docker Compose overlay and deployment guide (merge commit `2bbea958e6072538fedd1dcb2e550c6178f6e129`).
- PR #8 — tenant cross-company IDOR mutation regression tests and security foundation (merge commit `331a0b3527936c4d2de2d7073f97761ecdb04f73`).
- PR #10 — tenant-scoped audit-log regression test (merge commit `54f7fac9ff7ee1cc9893db08061e8cce601b8fbf`).
- PR #17 — custom company roles persisted per tenant, permission resolution, owner-only management, assignment and session revocation (merge commit `63e3d14d5b3e9b0ec0078d521d5c35b820015089`).
- PR #18 — successful login/logout tenant-scoped audit events (merge commit `61c148599bbfc79f267890c89c6d060daf0ae4d8`).
- PR #19 — dedicated production Compose CI and progress reconciliation (merge commit `9fc30a3e3d69bdb215e12f4588f51835f3b35280`).

## CI evidence

All four PR #19 checks completed successfully on head `dfdf39b8a35484073a80b72d9becf16c9e9b21aa`:
- Backend typecheck, build and MongoDB auth tests.
- Docker Compose full-stack integration.
- Angular CI.
- Production Compose profile validation.

The production Compose job validates host-port exposure (only the web gateway is published), builds and starts the production stack, checks web and internal API health, confirms named data volumes, and exercises refresh-session persistence across MongoDB/API restarts.

The merge commit is now the `main` HEAD. Its four checks were queued when this document was updated; verify their completion before treating main-branch CI as green.

## Current progress estimate (2026-11-20)

These are engineering estimates, not test-coverage percentages. Implementation completeness and release evidence are scored separately; unmerged work does not count as integrated.

- **MVP implementation: 78%.** Core runtime/plugin lifecycle, MongoDB persistence, Angular public/dashboard foundation, authentication, tenant membership and custom company roles, template preferences, marketplace/entitlement foundations and CI are substantially implemented. Remaining work includes broader plugin purchase/installation flows, complete audit coverage, tenant-boundary review and release polish.
- **Release readiness: 68%.** PR #19 now has passing production Compose validation, including restart/session-persistence coverage. Main-branch checks for the merge commit are pending. Security hardening, backups/restore, TLS/monitoring, route-wide isolation review and final release packaging remain.

## Remaining work

1. Verify all CI checks on main merge commit `9fc30a3`.
2. Add audit events for role/member changes, plugin lifecycle and permission denials.
3. Audit tenant-sensitive routes and background/async entrypoints.
4. Complete security hardening, operational backup/restore and release smoke tests.
5. Tag `0.1.0` only after all release checks pass.

## Known security/release gaps

- Audit query/export and retention controls are not implemented.
- Tenant-isolation audit of every route and asynchronous entrypoint is incomplete.
- MFA, rate limiting, password recovery, email verification and immediate access-token revocation remain outstanding.
- HTTPS, firewalling, encrypted off-site backups, restore drills and monitoring remain deployment requirements.

## Links

- Repository: https://github.com/alexandre-aparicio/Bee-core
- PR #7: https://github.com/alexandre-aparicio/Bee-core/pull/7
- PR #8: https://github.com/alexandre-aparicio/Bee-core/pull/8
- PR #9: https://github.com/alexandre-aparicio/Bee-core/pull/9
- PR #17: https://github.com/alexandre-aparicio/Bee-core/pull/17
- PR #18: https://github.com/alexandre-aparicio/Bee-core/pull/18
- PR #19: https://github.com/alexandre-aparicio/Bee-core/pull/19
- Actions: https://github.com/alexandre-aparicio/Bee-core/actions
