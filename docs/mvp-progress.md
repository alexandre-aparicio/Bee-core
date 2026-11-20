# Bee-Core MVP progress

Updated: 2026-11-20 (UTC)

This file records only repository changes and checks observed in GitHub. It is not a claim that unmerged work is part of `main`.

## Integrated into `main`

- PR #8 — tenant cross-company IDOR mutation regression tests and security foundation — merged.
- Merge commit: `331a0b3527936c4d2de2d7073f97761ecdb04f73`.
- PR #5 — full-stack CI foundation — merged previously.
- PR #4 — Angular migration — merged previously.
- PR #3 — public/dashboard/auth UI foundation — merged previously.
- PR #1 — MongoDB migration — merged previously.

## Verified CI, not yet merged

- PR #9 production Docker Compose profile: CI checks succeeded (backend, Angular and Docker production profile).
- PR #15 custom company roles: backend CI and Angular CI succeeded on commit `d50f08f`, but merge into `main` currently fails due to merge conflicts. It is **not merged**.
- PR #16 custom-company-role integration: Angular CI succeeded on earlier commit `110d5f2`; backend integration failed at test line 308 because a manager session had been revoked after role assignment/reset, while the test still reused the old token. The test was corrected in commit `a705233` to log in again and activate the company before checking manager permissions. Backend and Angular workflows for that correction are currently running; their result is pending.

## Remaining work

1. Resolve PR #15 merge conflict against current `main` without losing PR #8 security changes; re-run backend, Angular and Docker integration CI; merge only after green.
2. Retarget and validate PR #16 against the updated main/custom-role implementation; confirm custom-role CRUD, assignment, permission allowlist, revocation, cross-tenant denial and safe deletion tests all pass.
3. Integrate the audit-event PR chain (#10–#14 in dependency order) after verifying each base/head and CI; do not merge out of order.
4. Review the production Docker profile, clean-install/restart/persistence and rollback instructions; perform a final smoke test from a clean environment.
5. Update progress here after each verified merge or test run; tag `0.1.0` only after release checks pass.

## Links

- Repository: https://github.com/alexandre-aparicio/Bee-core
- PR #8: https://github.com/alexandre-aparicio/Bee-core/pull/8
- PR #9: https://github.com/alexandre-aparicio/Bee-core/pull/9
- PR #15: https://github.com/alexandre-aparicio/Bee-core/pull/15
- PR #16: https://github.com/alexandre-aparicio/Bee-core/pull/16
- Actions: https://github.com/alexandre-aparicio/Bee-core/actions
