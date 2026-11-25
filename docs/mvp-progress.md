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
| Control Horario backend and signed ZIP | Partial | PR #214: tenant-scoped repository boundary; no Files/Marketplace dependency; static backend fallback and Angular registry entry removed, so signed ZIP is the only runtime source. VPS npm publisher requires both `BEE_PLUGIN_PUBLISHER_PRIVATE_KEY` and `BEE_PLUGIN_PUBLISHER_PUBLIC_KEY`, checks matching Ed25519 keys and verifies each signature before writing. ZIP test installs all four packages, checks Control Horario manifest/migration/backend export, exact byte-for-byte frontend HTML/JS, all current UI flows, and rejects mismatched keys. CI #45680976363 success: backend build, 120/120 tests (0 skipped), Angular production build, 31/31 Playwright tests; screenshot artifact 15054276904. Actual npm generation with VPS keys, ZIP installation and runtime verification on VPS remain NOT verified. |
| Super Organization signed ZIP discovery and activation | Automated validation done | PR #214 branch: `platform-admin.plugin.ts` now lists and resolves signed ZIP packages only when the global package is installed and runtime is `loaded`; `codeAvailable:false` remains intact. Regression tests cover list, activation, tenant installation and rejection of failed runtime. CI #919, commit `4eba817a13584beae3cc958bf525f13c515d3d11`: backend build/tests and zero-skipped gate success, Angular production build success, browser tests/screenshots success; artifact `15062071537` (42 screenshots). Documents frontend source was not changed by this fix; browser captures show Documents route in Midnight Dark and Glass Light. VPS deployment and real Super Organization ZIP activation remain NOT verified. |
