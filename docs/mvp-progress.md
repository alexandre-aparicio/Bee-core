# Bee-Core MVP progress

Updated: 2026-11-20 (UTC)

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

## Verified CI, not yet merged

- PR #9 production Docker Compose profile: earlier backend, Angular and production-profile checks succeeded; it has now been retargeted to `main` after PR #7. Its current mergeability is not yet confirmed and the CI for the retargeted state must be rechecked.
- PR #11 authentication audit-event integration: backend and Angular CI succeeded, but merge conflicts against `main` currently block integration. **Not merged**.
- PR #15 custom company roles: backend CI and Angular CI succeeded on commit `d50f08f`, but merge into `main` currently fails due to merge conflicts. It is **not merged**.
- PR #16 custom-company-role integration: Angular CI succeeded on earlier commit `110d5f2`; backend integration failed at test line 308 because a manager session had been revoked after role assignment/reset, while the test still reused the old token. The test was corrected in commit `a705233` to log in again and activate the company before checking manager permissions. Backend CI for that correction is now green, and Angular CI is green. Docker Compose full-stack integration is green. Corrected PR #16 commit `a705233` now has backend CI, Docker Compose full-stack integration, and Angular CI all green.

## Remaining work

1. Resolve the PR #11 audit-log merge conflict while retaining PR #8/#10 changes; validate and merge.
2. Resolve PR #15 merge conflict against current `main` without losing PR #8 security changes; re-run backend, Angular and Docker integration CI; merge only after green.
3. Retarget and validate PR #16 against the updated main/custom-role implementation; confirm custom-role CRUD, assignment, permission allowlist, revocation, cross-tenant denial and safe deletion tests all pass.
4. Integrate the audit-event PR chain (#12–#14 in dependency order) after verifying each base/head and CI; do not merge out of order.
5. Review the production Docker profile, clean-install/restart/persistence and rollback instructions; perform a final smoke test from a clean environment.
6. Update progress here after each verified merge or test run; tag `0.1.0` only after release checks pass.

## Links

- Repository: https://github.com/alexandre-aparicio/Bee-core
- PR #8: https://github.com/alexandre-aparicio/Bee-core/pull/8
- PR #9: https://github.com/alexandre-aparicio/Bee-core/pull/9
- PR #15: https://github.com/alexandre-aparicio/Bee-core/pull/15
- PR #16: https://github.com/alexandre-aparicio/Bee-core/pull/16
- Actions: https://github.com/alexandre-aparicio/Bee-core/actions
