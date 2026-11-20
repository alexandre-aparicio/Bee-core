# Bee-Core MVP progress

Updated: 2026-11-20 (UTC) — PR #18 merged; PR-head backend, Docker Compose full-stack and Angular CI passed. Main-branch workflows are running on merge commit `61c1485`.

This file records repository changes and checks observed in GitHub. It does not treat unmerged work as integrated.

## Integrated into `main`

- PR #1 — MongoDB migration.
- PR #3 — public/dashboard/auth UI foundation.
- PR #4 — Angular migration.
- PR #5 — full-stack CI foundation.
- PR #7 — production Docker Compose overlay and deployment guide (merge commit `2bbea958e6072538fedd1dcb2e550c6178f6e129`).
- PR #8 — tenant cross-company IDOR mutation regression tests and security foundation (merge commit `331a0b3527936c4d2de2d7073f97761ecdb04f73`).
- PR #10 — tenant-scoped audit-log regression test (merge commit `54f7fac9ff7ee1cc9893db08061e8cce601b8fbf`).
- PR #17 — custom company roles persisted per tenant, permission resolution, owner-only management, assignment and session revocation (merge commit `63e3d14d5b3e9b0ec0078d521d5c35b820015089`). Backend, Docker Compose full-stack and Angular CI passed on its PR head.
- PR #18 — successful login/logout tenant-scoped audit events (merge commit `61c148599bbfc79f267890c89c6d060daf0ae4d8`). Backend/MongoDB, Docker Compose full-stack and Angular CI passed on its PR head SHA `9304dfd8dabf572c2396e4b6d8d009390fae8189`. Main-branch CI is being re-run against the merge commit.

## Deployment profile

The production Compose overlay, environment example and deployment guide from PR #7 are already present in `main`. PR #9 overlaps those files and is not merged. Its distinct production-profile CI validation is being reapplied separately; no duplicate Compose or guide files are being copied.

## Remaining work

1. Verify main-branch CI on merge commit `61c1485`.
2. Add audit events for role/member changes, plugin lifecycle and permission denials.
3. Add production Compose overlay CI and validate clean install, restart and persistence.
4. Audit tenant-sensitive routes and background/async entrypoints.
5. Complete security hardening and release smoke tests.
6. Tag `0.1.0` only after all release checks pass.

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
- Actions: https://github.com/alexandre-aparicio/Bee-core/actions
