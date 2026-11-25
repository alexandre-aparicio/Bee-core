| Scope | Status | Evidence / remaining work |
|---|---|---|
| G1 — Strict style guardrails | Done | CI #45598330411, SHA `cfe6938a81cd6e281447ac3acb427b6e9151936c`: strict audit, 88 files scanned, 9 documented allowlisted; Stylelint 18.1.0. |
| G2 — WCAG contrast | Done | CI #45598330411, SHA `cfe6938a81cd6e281447ac3acb427b6e9151936c`: 132 pairs, zero skipped, zero unexcepted failures; Midnight Dark exception 3.52:1. |
| G3 — Template browser tests | Done | CI #45598330411, SHA `cfe6938a81cd6e281447ac3acb427b6e9151936c`: 13 Playwright tests; 42 screenshots in `bee-core-template-screenshots` (artifact 15014806091). |
| G4 — Extensibility proof | Done | CI #45598330411, SHA `cfe6938a81cd6e281447ac3acb427b6e9151936c`: `node --test scripts/check-extensibility.test.mjs`, 3/3. |
| G5 — Documentation | Done | CI #45598330411, SHA `cfe6938a81cd6e281447ac3acb427b6e9151936c`: required docs present; `mvp-progress.md` is 25 lines and tables only. |
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
| Required documentation matches code | Done | CI #45598330411, SHA `cfe6938a81cd6e281447ac3acb427b6e9151936c`. |
| Midnight Dark visual equivalence | NOT verified | Screenshots and token behavior are not pixel comparison to the pre-refactor baseline. |
| First paint before Angular boots | NOT verified | Neutral fallback is source-defined; no pre-Angular capture asserted. |
| Human visual pass: Midnight Dark/Light, Paper, Glass | NOT verified | Required local visual review remains outstanding. |
