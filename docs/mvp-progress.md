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
| Six package palettes | Done by source comparison | 87 contract tokens compared against both mode blocks in all six packages; zero missing/duplicate in the earlier review. |
| F2 missing control tokens | Done by source search | Replaced `--bee-control-bg` / `--bee-control-border` in time tracking with existing `--bee-input-bg` / `--bee-input-border`; updated Midnight STYLE-GUIDE. No new tokens required. |
| F3 used-token checker | Implemented; NOT verified | Checker now scans `src/**/*.{css,ts,html}`, excluding contract/package token sheets, and reports every `var(--bee-*)` use absent from the contract. Re-read line by line. Script NOT executed. |
| Package token checker | NOT verified | Existing package/mode coverage checker remains unexecuted. |

## Step 3 — Active surface synchronization

| Item | Status | Source evidence / remaining work |
|---|---|---|
| Route transition audit | Source-reviewed | Public Home/Hello World links use client-side `pushState`; sign-in links are full page loads. Auth success/invitation/MFA use `location.assign('/dashboard')`. Dashboard logout/session failure use `location.assign/replace('/login')`. Dashboard brand returns to public via full-load `href="/"`. Auth shell links to Home/Login/Forgot use full-load anchors. |
| Client navigation synchronization | Implemented; NOT runtime verified | Added `BeeTemplateEngine.syncActiveSurface()`; called after `navigatePublicPath`, `navigatePlatformManage`, `navigateSection` and `popstate`. Full-load transitions reinitialize through normal Angular startup. |

## Step 4 — Appearance-mode and package structure

| Item | Status | Source evidence / remaining work |
|---|---|---|
| Appearance controls / dashboard shell split | Done by source review | `appearance-modes.css` retains tokenized appearance controls; shared dashboard shell rules are in `base.css`. |
| Paper / Glass refinements | Done by source review | Package CSS uses semantic tokens; no literal hex/RGB/HSL in Midnight, Paper or Glass `styles.css` in the previous audit. Glass blur remains package-token driven. |
| Midnight Dark visual equivalence | NOT verified | Canonical token values retained; browser comparison has not been performed. |

## Step 5 — Feature CSS tokenization and compatibility-block removal

| Item | Status | Source evidence / remaining work |
|---|---|---|
| Temporary compatibility block | Pending | Previously reviewed at 20 `!important` and 28 `[class*=` selectors. Delete only as owning components are migrated. |
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

## Current source audit metrics

| Scope | Metric | Result |
|---|---|---:|
| `base.css` temporary compatibility block | `!important` | 20 (previously reviewed) |
| `base.css` temporary compatibility block | `[class*=` | 28 (previously reviewed) |
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
