# Bee-Core template refactor progress

Updated: 2026-11-25  
Branch: `refactor/template-base-and-packages`  
Scope: `apps/web` template palettes, shared dashboard styles and feature CSS. No branch creation, main changes or PR.

## Step 1 — Palette and template foundation

| Item | Status | Source evidence / remaining work |
|---|---|---|
| Fixed package palettes and active html/body theme scope | Done by source review | Six package token sheets; Light/Dark selectors are mirrored to the active html surface. First paint before Angular boot remains neutral fallback. |
| Remove legacy client custom-palette runtime | Done by source review | Engine token application/save/preview runtime and six `theme-tokens.ts` files removed. Backend legacy endpoint and payload contract intentionally retained. |
| Shared wrapper migration | Done by source review | Midnight, Paper and Glass dashboard wrappers have empty `styles: []`; shared structure is in `base.css`. |
| Legacy alias removal | Done by source search | Migrated the final `organization-company` and `teams-workspace` consumers and removed all six temporary aliases from the package host. |

## Step 2 — Token contract and checker

| Item | Status | Source evidence / remaining work |
|---|---|---|
| Six package palettes | Done by source comparison | 89 contract tokens compared against both mode blocks in all six packages; zero missing/duplicate in the source comparison after adding the QR contrast tokens. |
| F2 missing control tokens | Done by source search | Replaced `--bee-control-bg` / `--bee-control-border` in time tracking with existing `--bee-input-bg` / `--bee-input-border`; updated Midnight STYLE-GUIDE. No new tokens required. |
| F3 used-token checker | Implemented; GitHub CI PASS | Scans `src/**/*.{css,ts,html}` outside contract/package token sheets and reports every used `var(--bee-*)` absent from the contract. |
| Package token checker | Implemented; GitHub CI PASS | Validates manifest id/target/default mode, missing manifests as warnings, unique contract declarations, exactly one token block per declared mode, complete token coverage, and rejects duplicate or undeclared tokens/modes. Script executed successfully in GitHub Actions. |

## Step 3 — Active surface synchronization

| Item | Status | Source evidence / remaining work |
|---|---|---|
| Route transition audit | Source-reviewed | Public Home/Hello World links use client-side `pushState`; sign-in links are full page loads. Auth success/invitation/MFA use `location.assign('/dashboard')`. Dashboard logout/session failure use `location.assign/replace('/login')`. Dashboard brand returns to public via full-load `href="/"`. Auth shell links to Home/Login/Forgot use full-load anchors. |
| Client navigation synchronization | Implemented; NOT runtime verified | Added `BeeTemplateEngine.syncActiveSurface()`; called after `navigatePublicPath`, `navigatePlatformManage`, `navigateSection` and `popstate`. Full-load transitions reinitialize through normal Angular startup. |

Explicit transition paths from source review:
- Public `/` and `/hello-world`: package Home/Hello World anchors call `navigatePublicPath` and use client-side `history.pushState`.
- Public → auth: `/login` anchors (Sign in / Open dashboard) are ordinary anchors; full page load.
- Auth → public: auth-shell Home links to `/`; full page load. Auth → auth: Login and Forgot links are ordinary anchors; full page load.
- Auth → dashboard: successful sign-in, invitation acceptance and MFA completion call `location.assign('/dashboard')`; full page load.
- Dashboard → auth: logout uses `location.assign('/login')`; refresh/session validation failure uses `location.replace('/login')`; full page load.
- Dashboard → public: shared dashboard brand anchor uses `href="/"`; full page load.
- Dashboard internal section/deep-link changes and Platform Admin tenant management use `history.pushState`; client-side. Browser back/forward uses `popstate` and now re-syncs the active html surface.


## Step 4 — Appearance-mode and package structure

| Item | Status | Source evidence / remaining work |
|---|---|---|
| Appearance controls / dashboard shell split | Done by source review | `appearance-modes.css` retains tokenized appearance controls; shared dashboard shell rules are in `base.css`. |
| Paper / Glass refinements | Done by source review | Package CSS uses semantic tokens; no literal hex/RGB/HSL in Midnight, Paper or Glass `styles.css` in the previous audit. Glass blur remains package-token driven. |
| Midnight Dark visual equivalence | NOT verified | Canonical token values retained; browser comparison has not been performed. |

## Step 5 — Feature CSS tokenization and compatibility-block removal

| Item | Status | Source evidence / remaining work |
|---|---|---|
| Temporary compatibility block | Done by source search | Deleted. `base.css`: 0 `!important`, 0 `[class*=`, 0 hex, 0 RGB/HSL; braces 96 / 96. |
| Component migration | Done by source search | All required owners and remaining non-public feature components have 0 palette hex / RGB-HSL / `!important` / palette `:host-context` occurrences. Teams Workspace's final three Midnight-Light overrides were removed and now consume canonical package tokens. |
| Generic element rules | Done by source review | Inputs, placeholders, tables, rows/cells, buttons, dialogs, menus, badges, tabs, empty states and toggles use token-only zero-specificity `:where()` primitives. Explicit `.bee-status--*` and `.bee-text-muted` classes replace broad substring color selectors. |
| Palette `:host-context` | Done by source search | 0 remaining in feature components. Documents, Organization Roles and Role Audit had already been migrated; this pass removed the final 3 Teams Workspace Midnight-Light overrides (9 literals). |
| Component counts | Source-reviewed | All migrated feature components now have 0 hex / 0 RGB-HSL / 0 `!important` / 0 palette `:host-context`. Runtime visual result NOT verified. |

## Step 6 — Public templates

| Item | Status | Scope |
|---|---|---|
| Public template tokenization | Source-reviewed; runtime NOT verified | Aurora public page + package CSS: 22 hex / 1 RGB-HSL → 0 / 0; Editorial: 29 hex / 0 RGB-HSL → 0 / 0; Studio: 40 hex / 0 RGB-HSL → 0 / 0. All three public page components and package layout styles now consume semantic tokens; inline CSS braces balanced (29/29, 29/29, 41/41). Used tokens exist in the contract and both modes of all six packages. |

## Step 7 — Stylelint / CI

| Item | Status | Scope |
|---|---|---|
| Package token and manifest checker | Implemented; GitHub CI PASS | `check-template-tokens.mjs` scans CSS/TS/HTML token usages against the contract; validates manifest id/target/default mode, unique contract declarations, one block per declared mode, complete token coverage, and rejects duplicate/undeclared tokens or modes. It excludes `shared`, reports missing manifests as warnings, and exits 1 for errors. Six current package directories contain manifests by tree inventory. |
| Stylelint and CI policy | GitHub CI PASS | Added `stylelint.config.mjs`; `lint:styles` pins `stylelint@18.1.0` via `npx` and covers standalone `src/app/**/*.css`, `src/assets/**/*.css` and `src/styles.css`. Inline Angular CSS remains source-audited, not parsed by Stylelint. Device-simulator's local standalone palette is intentionally independent of the six app templates; its forced-priority utility was removed. CI runs token/manifest checks, style audit, Stylelint, production build and Playwright discovery; web Node is pinned to 22.22.2. Stylelint is installed by the pinned npx invocation; CI executed successfully on the refactor branch. |

## Step 8 — Cleanup and documentation

| Item | Status | Scope |
|---|---|---|
| Legacy palette aliases | Removed by source search | Migrated the remaining `organization-company` and `teams-workspace` consumers to `--bee-*` tokens, then removed all six temporary aliases (`--bg`, `--panel`, `--muted`, `--border`, `--purple`, `--cyan`) from the package host. |
| Cleanup and documentation reconciliation | Done by source review | Reconciled `mvp-progress.md`, `template-token-mapping.md` and Midnight STYLE-GUIDE with current source. No feature palette host-context exception remains; runtime and visual validation remain NOT verified. |

## Step 5 — source batches completed

| Component / owner | Before → after | Compatibility selectors removed |
|---|---|---|
| Platform Admin / Platform Company | Component TS: 0 hex, 0 RGB/HSL, 0 important, 0 palette host-context before and after. Existing global owner styles in styles.css already use semantic tokens (verified by source search). | Removed 5 explicit platform-admin/platform-company targets from action, modal-backdrop, error and success compatibility selectors. Shared substring selectors remain because they still serve other owners. |
| Company Members | 0 hex, 0 RGB/HSL, 0 important, 0 palette host-context; 85 legacy alias var() references → 0. Replaced with --bee-* tokens. | Removed 2 broad class-substring selectors ([class*="company-members"], [class*="invitation"]); the latter owned the invitation list. All remaining generic compatibility selectors were removed after feature owners were migrated. |
| Organization Roles | 124 hex / 16 RGB-HSL / 22 important / 4 palette host-context → 0 / 0 / 0 / 0. Removed legacy alias and undefined local-surface variables; all 14 used --bee-* tokens were source-compared against the contract and both modes of all six packages. Inline style braces: 272 open / 272 close. | Removed the component's literal palette and important rules; explicit semantic danger/success/warning classes remain in its template. |
| Role Audit | 22 hex / 2 RGB-HSL / 5 important / 1 palette host-context → 0 / 0 / 0 / 0. Nine used semantic tokens have no missing contract or package-mode declarations; inline style braces: 60 open / 60 close. | Error, warning and denied states carry explicit semantic status classes. |
| Plugin Settings | 65 hex / 1 RGB-HSL / 0 important / 0 palette host-context → 0 / 0 / 0 / 0. Twelve used semantic tokens have no missing contract or package-mode declarations; inline style braces: 121 open / 121 close. | Removed its `[class*="plugin-settings"]` compatibility selector, added explicit danger/success/warning status classes. |
| Settings Workspace | 19 hex / 0 RGB-HSL / 0 important / 0 palette host-context → 0 / 0 / 0 / 0. Six used semantic tokens have no missing contract or package-mode declarations; inline style braces: 63 open / 63 close. | Removed `[class*="settings-page"]` and `[class*="settings-workspace"]`; all state messages use explicit semantic status classes. Language error/success messages carry explicit semantic status classes. |
| Marketplace | 0 hex / 0 RGB-HSL / 0 important / 0 palette host-context before and after; global owner styles in `styles.css` already use semantic tokens. | Removed `[class*="marketplace"]`; the component now relies on semantic token styles. Added explicit danger/success status classes to error and installed states. |
| Audit Log | 0 hex / 0 RGB-HSL / 0 important / 0 palette host-context before and after; global owner styles in `styles.css` already use semantic tokens. | Removed `[class*="audit-log"]`; the component now relies on semantic token styles. Error and denied/success outcomes carry explicit semantic status classes. |
| Documents | 21 hex / 4 RGB-HSL / 6 important / 17 palette host-context → 0 / 0 / 0 / 0. Nine used semantic tokens have no missing contract or package-mode declarations; inline style braces: 153 open / 153 close. | Removed Midnight-Light host-context palette block; drag/drop selectors were raised in specificity to remove important flags. The component now relies on semantic token styles; error/success messages carry semantic status classes. |
| Platform Identity | 26 hex / 0 RGB-HSL / 0 important / 0 palette host-context → 0 / 0 / 0 / 0. Eight used semantic tokens have no missing contract or package-mode declarations; inline style braces: 72 open / 72 close. | Replaced legacy palette fallbacks and named status colors; error/save feedback uses explicit semantic status classes. Already isolated under `.settings-workspace *`. |
| Connected Devices | 25 hex / 1 RGB-HSL / 0 important / 0 palette host-context → 0 / 0 / 0 / 0. Added `--bee-qr-dark` and `--bee-qr-light` to contract and both modes of all six packages; QRCode reads computed token values. Inline style braces: 67 open / 67 close. | Replaced palette aliases, modal/device/status colors and shadows; component styles now use semantic tokens. |
| Notifications Page | 20 hex / 0 RGB-HSL / 0 important / 0 palette host-context → 0 / 0 / 0 / 0. Five used tokens have no missing contract/package-mode declarations; inline style braces: 41 / 41. | Replaced legacy palette fallbacks and added explicit danger status class; component styles now use semantic tokens. |
| Messages Inbox | 14 hex / 14 RGB-HSL / 0 important / 0 palette host-context → 0 / 0 / 0 / 0. Thirteen used tokens have no missing contract/package-mode declarations; inline style braces: 59 / 59. | Replaced hard-coded gradients, translucent surfaces and warning/online states with semantic token color-mix and package tokens; component styles now use semantic tokens. |
| Template Manager | 13 hex / 0 RGB-HSL / 0 important / 0 palette host-context → 0 / 0 / 0 / 0. Five used tokens have no missing contract/package-mode declarations; inline style braces: 39 / 39. | Replaced legacy aliases; the component now uses semantic palette tokens. |
| Notification Center | 12 hex / 0 RGB-HSL / 0 important / 0 palette host-context → 0 / 0 / 0 / 0. Six used tokens have no missing contract/package-mode declarations; inline style braces: 20 / 20. | Replaced legacy palette fallbacks and shadow literal; error message carries explicit danger status class. It renders in the dashboard header. |
| Platform Roles | 11 hex / 17 RGB-HSL / 11 important / 0 palette host-context → 0 / 0 / 0 / 0. Nine used tokens have no missing contract/package-mode declarations; inline style braces: 69 / 69. | Replaced translucent palette literals and strengthened component selectors to remove important flags; component styles now use semantic tokens. Error/success messages carry semantic status classes. |
| Platform Users | 8 hex / 0 RGB-HSL / 0 important / 0 palette host-context → 0 / 0 / 0 / 0. Uses existing border, subtle-surface and muted-text tokens; inline style braces: 20 / 20. | Replaced all slate color literals and muted fallback with semantic token color-mix values. |
| Mail Workspace | 11 hex / 18 RGB-HSL / 0 important / 0 palette host-context → 0 / 0 / 0 / 0. Twelve used tokens have no missing contract/package-mode declarations; inline style braces: 79 / 79. | Replaced gradients, translucent surfaces, modal backdrop, controls, toast and text colors with package semantic tokens; modal elevation uses `--bee-shadow-raised`. |
| Time Tracking | 3 hex / 0 RGB-HSL / 0 important / 0 palette host-context → 0 / 0 / 0 / 0. Replaced five legacy aliases with semantic palette tokens. | Tokenized controls, status, tabs, table, modal backdrop and elevation without changing component markup or behavior. |
| Auth MFA QR | 2 hex / 0 RGB-HSL / 0 important / 0 palette host-context → 0 / 0 / 0 / 0. Uses the already declared `--bee-qr-dark` / `--bee-qr-light` package tokens. | QR contrast now reads from the active root theme; no API or authentication flow changes. |
| Teams Workspace | 9 hex / 0 RGB-HSL / 0 important / 3 palette host-context → 0 / 0 / 0 / 0. Inline style braces: 363 / 363. | Removed the deferred Midnight-Light overrides; the component now inherits the canonical status, action-text, text and shadow tokens from the Midnight package. |
| Device Simulator (standalone asset) | 66 hex / 0 RGB-HSL / 0 important; CSS braces: 79 / 79. | Kept its self-contained device-demo palette separate from the six application templates; included its stylesheet in Stylelint and removed `!important` from `.hidden`. This is an intentional standalone palette, not a remaining dashboard/public component palette. |

## Current source audit metrics

| Scope | Metric | Result |
|---|---|---:|
| `base.css` temporary compatibility block | `!important` | 0; block deleted |
| `base.css` | `[class*=` | 0; all substring compatibility selectors deleted |
| `base.css` | hex / RGB-HSL / brace balance | 0 / 0 / 96 open = 96 close |
| `core/appearance-modes.css` | palette literals / `!important` / `[class*=` | 0 / 0 / 0 (previously reviewed) |
| `apps/web/src/styles.css` | `!important` | 0 after removing eight auth, dashboard and Notes overrides by increasing selector specificity |
| Package styles | hex in Midnight / Paper / Glass | 0 / 0 / 0 (previously reviewed) |
| Feature components | palette `:host-context` | 0 remaining in all migrated feature owners |
| F2 source references | `--bee-control-(bg|border|placeholder)` in time tracking and STYLE-GUIDE | 0; uses `--bee-input-*` equivalents |
| F3 checker | GitHub CI | Scans CSS/TS/HTML `var(--bee-*)` uses outside token files and reports contract misses. Executed successfully. |

## Remaining human validation

The CI run validates Playwright test discovery only; it does not run the browser suite. For full browser and visual validation, run locally from the repository:

```bash
cd apps/web
npm ci
npm run check:template-tokens
npm run audit:styles
npm run lint:styles
npx ng build --configuration production
npx playwright test
```

Then visually review Midnight Dark and Light, Paper and Glass on Platform Admin, Company Members, Organization Roles, Plugin Settings, Documents, Marketplace and Audit Log.

## Validation boundary

GitHub Actions run [#45590215483](https://github.com/alexandre-aparicio/Bee-core/actions/runs/45590215483) completed with **success** on `refactor/template-base-and-packages` (commit `9970b58f17a49ae9e0ec2d0c06546880138f6042`). Passed: dependency installation, token/manifest checker, style audit, Stylelint, Angular production build, Playwright test discovery (`--list`), backend build, backend tests, and the no-skipped-tests guard. The full Playwright browser suite was not executed; route runtime behavior, cascade behavior, responsive behavior and visual comparisons remain **NOT verified**. Do not describe runtime or visual acceptance as complete until those checks have been run.
