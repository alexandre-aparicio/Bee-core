| Scope | Status | Evidence / remaining work |
|---|---|---|
| G1 — Strict style guardrails | Done | CI #45598330411, SHA `cfe6938a81cd6e281447ac3acb427b6e9151936c`: strict audit, 88 files scanned, 9 documented allowlisted; Stylelint 18.1.0. |
| G2 — WCAG contrast | Done | CI #45598330411, SHA `cfe6938a81cd6e281447ac3acb427b6e9151936c`: 132 pairs, zero skipped, zero unexcepted failures; Midnight Dark exception 3.52:1. |
| G3 — Template browser tests | Done | CI #45613899464, SHA `69324565d31f677c7e4859b5f458cd86b15ecad4`: 31/31 Playwright tests (18 smoke + 13 template); 42 screenshots in `bee-core-template-screenshots` (artifact 15021842058). Dashboard captures use viewport; public captures remain full-page. |
| G4 — Extensibility proof | Done | CI #45598330411, SHA `cfe6938a81cd6e281447ac3acb427b6e9151936c`: `node --test scripts/check-extensibility.test.mjs`, 3/3. |
| G5 — Documentation | Done | Required docs present; `mvp-progress.md` remains tables only and below the 150-line limit. |
| G6 — PR readiness | Done | Final PR description delivered in chat; no PR opened. CI #45598330411, SHA `cfe6938a81cd6e281447ac3acb427b6e9151936c`. |

| Original phase | Status | Remaining acceptance boundary |
|---|---|---|
| Step 7 — Guardrails, contrast, browser and extensibility | Partial | G1–G4 complete. Human visual equivalence review remains NOT verified. |
| Step 8 — Documentation and cleanup | Done | G5 documentation reconciled; CI #45598330411, SHA `cfe6938a81cd6e281447ac3acb427b6e9151936c`. |

| Acceptance item | Status | Evidence / remaining work |
|---|---|---|
| Strict audit and Stylelint; deliberate violations rejected | Done | CI #45598330411, SHA `cfe6938a81cd6e281447ac3acb427b6e9151936c`. Hex: `color-no-hex`/audit hex; rgb(): `function-disallowed-list`/audit colorFunctions; named colors: declaration-value rule/audit namedColor; `!important`: `declaration-no-important`/audit important. |
| Contrast report and blocking check | Done | CI #45598330411, SHA `cfe6938a81cd6e281447ac3acb427b6e9151936c`; 132-pair table, blocking checker. |
| Browser matrix and screenshot artifact | Done | CI #45598330411, SHA `cfe6938a81cd6e281447ac3acb427b6e9151936c`; artifact `bee-core-template-screenshots` (15014806091). |
| Extensibility test | Done | CI #45598330411, SHA `cfe6938a81cd6e281447ac3acb427b6e9151936c`; `node --test scripts/check-extensibility.test.mjs`. |
| Smoke and template regression suite | Done | CI #45613899464, SHA `69324565d31f677c7e4859b5f458cd86b15ecad4`: 31 passed in 37.0s; all three CI jobs succeeded; screenshot artifact 15021842058. |
| Dashboard workspace selector | Done | Same CI: smoke test `dashboard company selector switches the active tenant session` passed. |
| Notes plugin frontend session | Done | `plugin-frontend-registry.service.ts` now supplies the access token to `BeeNotesComponent`; marketplace smoke test installs Notes and creates a company-scoped note successfully in CI #45613899464. |
| Required documentation matches code | Done | CI #45598330411, SHA `cfe6938a81cd6e281447ac3acb427b6e9151936c`. |
| Midnight Dark visual equivalence | NOT verified | Screenshots and token behavior are not pixel comparison to the pre-refactor baseline. |
| First paint before Angular boots | NOT verified | Neutral fallback is source-defined; no pre-Angular capture asserted. |
| Human visual pass: Midnight Dark/Light, Paper, Glass | NOT verified | Required local visual review remains outstanding. |
| Integration branch merge | Done | Dedicated branch `integration/template-refactor-into-main`; merge commit `8dd87e8` (first parent `main` `699f6d2`, second parent refactor `262eeab`). Preserved tenant activation, global package controls, manual grants, and install/uninstall lifecycle actions. Final CI #45639462591 at `daafd12`: Angular production build, backend build, 118/118 backend tests (0 skipped), 31/31 browser tests, style/token/extensibility checks; 42 screenshots artifact `15033522665`. `main` and `feature/documents-full-decoupling` were not modified. Browser test now waits for authenticated tenant loading before deep-link navigation (commit `8dc0dfe`); CI #45640992686: Angular build success, backend 118/118 (0 skipped), browser 31/31, all three jobs successful. Human visual pass remains NOT verified. |
| Control Horario backend decoupling | Partial | Draft PR #214: tenant-owned sessions, schedules, corrections and memberships now pass through repository-scoped `TenantCollection` access; upserts stamp the active tenant; package/runtime dependencies are `auth` and `organizations` only, with no Files dependency. CI #45675788719 queued. Frontend work has not started. |
