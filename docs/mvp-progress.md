# Bee-Core MVP progress

Updated: 2026-11-20 (UTC) — PR #17 custom company roles merged; backend, Docker Compose full-stack and Angular CI all green.

This file records only repository changes and checks observed in GitHub. It is not a claim that unmerged work is part of `main`.

## Integrated into `main`

- PR #8 — tenant cross-company IDOR mutation regression tests and security foundation — merged.
- PR #10 — tenant-scoped audit-log regression test — merged after retargeting to `main` (merge commit `54f7fac9ff7ee1cc9893db08061e8cce601b8fbf`).
- Merge commit: `331a0b3527936c4d2de2d7073f97761ecdb04f73`.
- PR #7 — production Docker Compose overlay and install guide — merged in this session (merge commit `2bbea958e6072538fedd1dcb2e550c6178f6e129`).
- PR #5 — full-stack CI foundation — merged previously.
- PR #4 — Angular migration — merged previously.
- PR #3 — public/dashboard/auth UI foundation — merged previously.
- PR #1 — MongoDB migration — merged previously.

- PR #17 — custom company roles persisted per tenant, permission resolution, owner-only management, assignment and session revocation — merged to `main` (merge commit `63e3d14d5b3e9b0ec0078d521d5c35b820015089`); backend, Docker Compose full-stack and Angular CI all passed on head `971a790`.

## Verified CI, not yet merged

- PR #9 production Docker Compose profile: backend, Angular and Docker production-profile CI are all green on its current head. Merge is blocked by conflicts with PR #7, which already integrated overlapping files..
- PR #11 authentication audit-event integration: being reapplied on latest `main` in a fresh integration branch. Login/logout tests and implementation are awaiting CI; **not merged**.
- PR #15 custom company roles: backend CI and Angular CI succeeded on commit `d50f08f`, but merge into `main` currently fails due to merge conflicts. It is **not merged**.
- PR #16 custom-company-role integration: Angular CI succeeded on earlier commit `110d5f2`; backend integration failed at test line 308 because a manager session had been revoked after role assignment/reset, while the test still reused the old token. The test was corrected in commit `a705233` to log in again and activate the company before checking manager permissions. Backend CI for that correction is now green, and Angular CI is green. Docker Compose full-stack integration is green. Corrected PR #16 commit `a705233` now has backend CI, Docker Compose full-stack integration, and Angular CI all green.

## Remaining work

1. Validate and merge the fresh PR #18 authentication audit integration, preserving the tenant-scoped audit service and custom-role tests.
2. Complete audit coverage for role/member changes, plugin lifecycle and permission denials.
3. Revisit production Docker clean-install/restart/persistence and rollback validation.
4. Audit all tenant-sensitive routes and background/async entrypoints.
5. Run the final clean Docker installation, restart/persistence and smoke test.
6. Update progress after each verified merge; tag `0.1.0` only after release checks pass.

## Links

- Repository: https://github.com/alexandre-aparicio/Bee-core
- PR #8: https://github.com/alexandre-aparicio/Bee-core/pull/8
- PR #9: https://github.com/alexandre-aparicio/Bee-core/pull/9
- PR #15: https://github.com/alexandre-aparicio/Bee-core/pull/15
- PR #16: https://github.com/alexandre-aparicio/Bee-core/pull/16
- Actions: https://github.com/alexandre-aparicio/Bee-core/actions
