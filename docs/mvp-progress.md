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
| Legacy alias removal | Pending | Six aliases remain on the package host in `base.css` for unconverted feature CSS. |

## Step 2 — Token contract and checker

| Item | Status | Source evidence / remaining work |
|---|---|---|
| Six package palettes | Done by source comparison | 89 contract tokens compared against both mode blocks in all six packages; zero missing/duplicate in the source comparison after adding the QR contrast tokens. |
| F2 missing control tokens | Done by source search | Replaced `--bee-control-bg` / `--bee-control-border` in time tracking with existing `--bee-input-bg` / `--bee-input-border`; updated Midnight STYLE-GUIDE. No new tokens required. |
| F3 used-token checker | Implemented; NOT verified | Checker now scans `src/**/*.{css,ts,html}`, excluding contract/package token sheets, and reports every `var(--bee-*)` use absent from the contract. Re-read line by line. Script NOT executed. |
| Package token checker | NOT verified | Existing package/mode coverage checker remains unexecuted. |

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
| Temporary compatibility block | Pending | Current source count: 20 `!important` and 15 `[class*=` selectors after retiring six migrated owner selectors (Platform Admin/Company, role-item, settings-card, workspace-card and package). This block is still pending. Delete only as owning components are migrated. |
| Component migration | Pending | Required order: Platform Admin, Company Members, Organization Roles, Role Audit, Plugin Settings, Settings Workspace, Marketplace, Audit Log, Documents, then remaining non-public feature components. |
| Generic element rules | Pending | Graduate tokenized input/table/text/dialog/button rules into zero-specificity `:where(.bee-dash-content)` styles only after their hard-coded component owners are migrated. |
| Deferred `:host-context` | Pending / intentionally deferred | Documents 17, Organization Roles 4, Teams Workspace 3, Role Audit 1 (25 total); do not rewrite in this pass. |
| Component counts | Baseline from task brief; current values NOT verified | Organization Roles: 124 hex / 22 important / 4 host-context; Plugin Settings 65 hex; Platform Identity 26; Connected Devices 25; Role Audit 22 hex / 5 important / 1 host-context; Documents 21 hex / 6 important / 17 host-context; Notifications Page 20; Settings Workspace 19; Messages Inbox 14; Template Manager 13; Notification Center 12. Other listed components await baseline search. |

## Step 6 — Public templates

| Item | Status | Scope |
|---|---|---|
| Public template tokenization | Not started | Explicitly out of scope until instructed. |

## Step 7 — Stylelint / CI

| Item | Status | Scope |
|---|---|---|
| Stylelint and CI policy | Not started | Explicitly out of scope until instructed. |

## Step 8 — Cleanup and documentation

| Item | Status | Scope |
|---|---|---|
| Cleanup beyond this progress record | Not started | Explicitly out of scope until instructed. |

## Step 5 — source batches completed

| Component / owner | Before → after | Compatibility selectors removed |
|---|---|---|
| Platform Admin / Platform Company | Component TS: 0 hex, 0 RGB/HSL, 0 important, 0 palette host-context before and after. Existing global owner styles in styles.css already use semantic tokens (verified by source search). | Removed 5 explicit platform-admin/platform-company targets from action, modal-backdrop, error and success compatibility selectors. Shared substring selectors remain because they still serve other owners. |
| Company Members | 0 hex, 0 RGB/HSL, 0 important, 0 palette host-context; 85 legacy alias var() references → 0. Replaced with --bee-* tokens. | Removed 2 broad class-substring selectors ([class*="company-members"], [class*="invitation"]); the latter owned the invitation list. Shared toolbar/detail/empty selectors remain pending other owners. |
| Organization Roles | 124 hex / 16 RGB-HSL / 22 important / 4 palette host-context → 0 / 0 / 0 / 0. Removed legacy alias and undefined local-surface variables; all 14 used --bee-* tokens were source-compared against the contract and both modes of all six packages. Inline style braces: 272 open / 272 close. | Generic compatibility rules now exclude `.org-roles *`; added semantic `bee-status--danger/success/warning` classes and shared token utilities. Remaining shared substring rules stay for other owners. |
| Role Audit | 22 hex / 2 RGB-HSL / 5 important / 1 palette host-context → 0 / 0 / 0 / 0. Nine used semantic tokens have no missing contract or package-mode declarations; inline style braces: 60 open / 60 close. | Generic compatibility rules now exclude `.role-audit *`; error, warning and denied states carry explicit semantic status classes. |
| Plugin Settings | 65 hex / 1 RGB-HSL / 0 important / 0 palette host-context → 0 / 0 / 0 / 0. Twelve used semantic tokens have no missing contract or package-mode declarations; inline style braces: 121 open / 121 close. | Removed its `[class*="plugin-settings"]` compatibility selector, excluded `.plugin-settings *` from remaining generic overrides, and added explicit danger/success/warning status classes. |
| Settings Workspace | 19 hex / 0 RGB-HSL / 0 important / 0 palette host-context → 0 / 0 / 0 / 0. Six used semantic tokens have no missing contract or package-mode declarations; inline style braces: 63 open / 63 close. | Removed `[class*="settings-page"]` and `[class*="settings-workspace"]`; generic overrides now exclude `.settings-workspace *`. Language error/success messages carry explicit semantic status classes. |
| Marketplace | 0 hex / 0 RGB-HSL / 0 important / 0 palette host-context before and after; global owner styles in `styles.css` already use semantic tokens. | Removed `[class*="marketplace"]`; generic compatibility selectors now exclude `.bee-marketplace *`. Added explicit danger/success status classes to error and installed states. |
| Audit Log | 0 hex / 0 RGB-HSL / 0 important / 0 palette host-context before and after; global owner styles in `styles.css` already use semantic tokens. | Removed `[class*="audit-log"]`; generic compatibility selectors now exclude `.bee-audit-log *`. Error and denied/success outcomes carry explicit semantic status classes. |
| Documents | 21 hex / 4 RGB-HSL / 6 important / 17 palette host-context → 0 / 0 / 0 / 0. Nine used semantic tokens have no missing contract or package-mode declarations; inline style braces: 153 open / 153 close. | Removed Midnight-Light host-context palette block; drag/drop selectors were raised in specificity to remove important flags. Generic compatibility selectors now exclude `.documents *`; error/success messages carry semantic status classes. |
| Platform Identity | 26 hex / 0 RGB-HSL / 0 important / 0 palette host-context → 0 / 0 / 0 / 0. Eight used semantic tokens have no missing contract or package-mode declarations; inline style braces: 72 open / 72 close. | Replaced legacy palette fallbacks and named status colors; error/save feedback uses explicit semantic status classes. Already isolated under `.settings-workspace *`. |
| Connected Devices | 25 hex / 1 RGB-HSL / 0 important / 0 palette host-context → 0 / 0 / 0 / 0. Added `--bee-qr-dark` and `--bee-qr-light` to contract and both modes of all six packages; QRCode reads computed token values. Inline style braces: 67 open / 67 close. | Replaced palette aliases, modal/device/status colors and shadows; generic compatibility selectors exclude `.cd-page *`. |
| Notifications Page | 20 hex / 0 RGB-HSL / 0 important / 0 palette host-context → 0 / 0 / 0 / 0. Five used tokens have no missing contract/package-mode declarations; inline style braces: 41 / 41. | Replaced legacy palette fallbacks and added explicit danger status class; generic overrides exclude `.np *`. |
| Messages Inbox | 14 hex / 14 RGB-HSL / 0 important / 0 palette host-context → 0 / 0 / 0 / 0. Thirteen used tokens have no missing contract/package-mode declarations; inline style braces: 59 / 59. | Replaced hard-coded gradients, translucent surfaces and warning/online states with semantic token color-mix and package tokens; generic overrides exclude `.mi *`. |
| Template Manager | 13 hex / 0 RGB-HSL / 0 important / 0 palette host-context → 0 / 0 / 0 / 0. Five used tokens have no missing contract/package-mode declarations; inline style braces: 39 / 39. | Replaced legacy aliases; component is isolated under `.settings-workspace *`. |
| Notification Center | 12 hex / 0 RGB-HSL / 0 important / 0 palette host-context → 0 / 0 / 0 / 0. Six used tokens have no missing contract/package-mode declarations; inline style braces: 20 / 20. | Replaced legacy palette fallbacks and shadow literal; error message carries explicit danger status class. It renders in the dashboard header, outside the temporary content overrides. |
| Platform Roles | 11 hex / 17 RGB-HSL / 11 important / 0 palette host-context → 0 / 0 / 0 / 0. Nine used tokens have no missing contract/package-mode declarations; inline style braces: 69 / 69. | Replaced translucent palette literals and strengthened component selectors to remove important flags; generic compatibility rules exclude `.platform-roles *`. Error/success messages carry semantic status classes. |
| Platform Users | 8 hex / 0 RGB-HSL / 0 important / 0 palette host-context → 0 / 0 / 0 / 0. Uses existing border, subtle-surface and muted-text tokens; inline style braces: 20 / 20. | Replaced all slate color literals and muted fallback with semantic token color-mix values. |
| Mail Workspace | 11 hex / 18 RGB-HSL / 0 important / 0 palette host-context → 0 / 0 / 0 / 0. Twelve used tokens have no missing contract/package-mode declarations; inline style braces: 79 / 79. | Replaced gradients, translucent surfaces, modal backdrop, controls, toast and text colors with package semantic tokens. Modal elevation now uses `--bee-shadow-raised`; generic compatibility selectors exclude `.mail-app *`. |

## Current source audit metrics

| Scope | Metric | Result |
|---|---|---:|
| `base.css` temporary compatibility block | `!important` | 20 (previously reviewed) |
| `base.css` temporary compatibility block | `[class*=` | 15 after removing six migrated owner selectors (Platform Admin, Platform Company, role-item, settings-card, workspace-card, package) |
| `core/appearance-modes.css` | palette literals / `!important` / `[class*=` | 0 / 0 / 0 (previously reviewed) |
| Package styles | hex in Midnight / Paper / Glass | 0 / 0 / 0 (previously reviewed) |
| Deferred feature overrides | `:host-context` | 25 total (task baseline) |
| F2 source references | `--bee-control-(bg|border|placeholder)` in time tracking and STYLE-GUIDE | 0 after replacement; NOT independently executed |
| F3 checker | execution | NOT verified |

## Human validation commands

Run locally from the repository:

```bash
cd apps/web
npm ci
npm run check:template-tokens
npm run audit:styles
npx ng build --configuration production
npx playwright test
```

Then visually review Midnight Dark and Light, Paper and Glass on Platform Admin, Company Members, Organization Roles, Plugin Settings, Documents, Marketplace and Audit Log.

## Validation boundary

No repository code was executed by this work. The checker, style audit, Angular build, Playwright tests, route runtime behavior, cascade behavior, responsive behavior and all visual comparisons are **NOT verified**. Do not mark Steps 1–5 complete until their remaining source work and human validation are complete.
