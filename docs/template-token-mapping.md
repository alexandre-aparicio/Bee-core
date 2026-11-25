# Template semantic token mapping

This is the migration map for replacing literal colors with semantic tokens in `apps/web/src/app/templates/base/tokens.contract.css`.

The Midnight DARK values in `apps/web/src/app/templates/packages/midnight/tokens.css` are the reference when migrating existing Midnight-dark surfaces. Template palettes remain fixed in their own package `tokens.css`; users select only Light or Dark.

## Literal color → semantic token

| Existing literal / family | Semantic token | Mapping note |
|---|---|---|
| `#080a12`, `#090b13` | `--bee-bg` | Midnight-dark page/canvas background. `#090b13` is unified with the canonical Midnight value. |
| `#0b0d16`, `#0b0e17`, `#0c0f18`, `#0c0f19`, `#10131d`, `#10131ef0`, `#111420`, `#111421`, `#121522`, `#131622` | `--bee-surface` / `--bee-surface-deep` | Nearby dark panel shades consolidated into package surface roles. `#0b0d16` remains the Midnight-dark deep surface. |
| `#17202f`, `#181a24`, `#292c3c` | `--bee-surface-subtle` / `--bee-surface-raised` | Neutral raised/subtle surface family. Some shades are unified; review density and contrast. |
| `#242637`, `#242736`, `#25293a`, `#26293a`, `#262a3a`, `#292b3d`, `#2a2b3d`, `#2a2d3c`, `#303348` | `--bee-border` | Dark neutral border family consolidated to the package border token. |
| `#59677d` | `--bee-border-strong` | Strong border/separator. |
| `#e8eaf2`, `#e5e8f0`, `#edf0f8`, `#d2d6e2`, `#c5c9d5`, `#c7cedc`, `#c8ceda` | `--bee-text` | Primary foreground shades consolidated to the mode's primary text. |
| `#8991a4`, `#8f95a8`, `#9ca4b6`, `#9da5b6`, `#929bad` and nearby muted neutrals | `--bee-text-muted` | Metadata, helper text and secondary labels. |
| `#697388`, `#717b90`, `#737c91`, `#788398`, `#7e879b`, `#80899b`, `#818ba0`, `#82899b`, `#848ea2`, `#858ea3`, `#8790a4`, `#8791a5`, `#8a93a8`, `#8b95a9` | `--bee-text-muted` / `--bee-text-subtle` | Muted and tertiary foreground family; actual token is selected by role. |
| `#8c72ff`, `#8771f8`, `#8b75ff`, `#9276ff`, `#8974f7` | `--bee-accent` | Primary accent family. |
| `#4f44c9`, `#6655d8`, `#6756d8`, `#6b58c4` | `--bee-accent-strong` | Darker endpoint for original brand/action gradients; not interchangeable with primary accent. |
| `#a79aff`, `#a99aff`, `#b2a5ff`, `#b2a6ff`, `#b5a9ff`, `#b8a8ff` | `--bee-accent-hover` | Lighter accent foregrounds and hover states. |
| `#69e5d4`, `#6bdbdb`, `#58d4d4` | `--bee-secondary` | Secondary cyan/teal accent and gradient endpoint. |
| `#55c99a`, `#53d598`, `#6ed8a7`, `#72d9a4`, `#73d8a8`, `#75d9aa`, `#8ddbb2` | `--bee-status-success` | Success text/indicator shades. Alpha variants use token-based mixes. |
| `#e6b45f`, `#e8b46a` | `--bee-status-warning` | Warning text/indicator shades. Alpha variants use token-based mixes. |
| `#ef7777`, `#e58a8a`, `#f0aaaa`, `#f26f73`, `#ff9b9f`, `#ff8e9c` | `--bee-status-danger` | Danger/error text/indicator shades. Alpha variants use token-based mixes. |
| `#69b8e5`, `#70b7ff`, `#79b9ff` | `--bee-status-info` | Informational blue shades. Alpha variants use token-based mixes. |
| `#0003`, `#0004`, `#0005`, `#0007`, `#0008`, `#0000000b`, `#050711b8` | `--bee-overlay` / `--bee-overlay-strong` | Modal backdrops and elevation shadows; offsets, blur and spread remain unchanged. |
| `#ffffff03`, `#ffffff04`, `#ffffff05`, `#ffffff08`, `#ffffff09`, `#ffffff0a`, `#ffffff0b` | `color-mix(in srgb, var(--bee-text) N%, transparent)` | Translucent separators and neutral surfaces adapt to the current mode. |
| `#0a0d16` | `--bee-input-bg` | Input surface. |
| `#ffffff` | `--bee-text` / `--bee-accent-text` | Chosen by foreground role; action text uses accent text, ordinary text uses primary text. |

## Step 2 — Global stylesheet migration

- Replaced all color literals in `apps/web/src/styles.css` with semantic `--bee-*` tokens or token-based `color-mix()` expressions. The global stylesheet contains zero hexadecimal, RGB, HSL or named `white/black` color declarations.
- Preserved the multi-stop brand/action gradients with separate `--bee-accent` and `--bee-accent-strong` tokens; preserved the public CTA gradient's accent/secondary distinction.
- Preserved the architecture panel's depth with `--bee-surface` and `--bee-surface-deep`.
- Moved the global Midnight palette out of `:root`. Root now contains only font/rendering settings; `body` uses `--bee-bg` and `--bee-text`.
- Removed the duplicated global `data-bee-public-mode="light"` block. Public Light appearance is owned by package tokens.
- Kept the six legacy variable aliases only on `.bee-template-package-host` in `base.css`, marked temporary for removal in Step 8. They resolve to the active package tokens and are not literal palettes.
- Added `--bee-accent-strong` and `--bee-surface-deep` to the contract and all six packages in both modes before consuming them.
- Replaced the old translucent surface fallback with a 1% `--bee-text` mix.

## Unifications requiring visual review

- Midnight `#090b13` joins `--bee-bg: #080a12`.
- Nearby dashboard/public dark surfaces are consolidated to `--bee-surface` and `--bee-surface-deep`; inspect public preview and dashboard panels.
- Multiple neutral border and foreground shades are consolidated to `--bee-border`, `--bee-text-muted` and `--bee-text-subtle`.
- Accent/status shade families use package canonical accent and status tokens. Gradient endpoints retain separate semantic tokens, but exact pixel matching still requires visual review.
- Shadow and overlay colors use semantic overlay tokens; alpha and shadow geometry are retained through token mixes.

These are semantic consolidations, not claims of pixel equivalence. Review public preview, auth, dashboard cards, company directory, audit table, invitation menus and platform-admin modals in all six templates and both modes.

## Step 3 — Dashboard wrapper migration

The Midnight, Paper and Glass dashboard page wrappers no longer carry inline component styles. Shared dashboard structure now lives in `apps/web/src/app/templates/base/base.css`; package-specific geometry is supplied through the dashboard token contract in `tokens.contract.css` and both appearance blocks in all six package token sheets.

The shared shell consumes these package-level values:

- Typography and geometry: `--bee-dashboard-font-family`, `--bee-dashboard-font-size`, `--bee-dashboard-sidebar-width`, `--bee-dashboard-sidebar-padding`, `--bee-dashboard-sidebar-gap`, `--bee-dashboard-main-padding-inline`, `--bee-dashboard-main-padding-bottom`, `--bee-dashboard-header-height`, `--bee-dashboard-content-width`, and `--bee-dashboard-content-margin`.
- Semantic shell surfaces: `--bee-dashboard-sidebar-background`, `--bee-dashboard-sidebar-border`, `--bee-dashboard-header-background`, `--bee-dashboard-header-border`, `--bee-dashboard-header-color`, `--bee-dashboard-header-button-background`, `--bee-dashboard-header-button-border`, and `--bee-dashboard-header-button-radius`.
- Navigation and content: `--bee-dashboard-sidebar-heading-color`, `--bee-dashboard-nav-color`, `--bee-dashboard-nav-active-background`, `--bee-dashboard-nav-active-color`, `--bee-dashboard-nav-radius`, `--bee-dashboard-card-background`, `--bee-dashboard-card-border`, `--bee-dashboard-card-color`, `--bee-dashboard-card-shadow`, `--bee-dashboard-quick-action-background`, `--bee-dashboard-quick-action-border`, `--bee-dashboard-quick-action-color`, `--bee-dashboard-quick-action-muted`, and `--bee-dashboard-quick-action-radius`.
- Settings, profile and mobile drawer: `--bee-dashboard-settings-active-background`, `--bee-dashboard-settings-panel-border`, `--bee-dashboard-settings-panel-background`, `--bee-dashboard-profile-menu-border`, `--bee-dashboard-profile-status-border`, `--bee-dashboard-mobile-overlay`, `--bee-dashboard-mobile-drawer-shadow`, and `--bee-dashboard-mobile-overlay-blur`.

| Package | Dashboard font | Sidebar width | Sidebar padding | Sidebar gap | Header min-height | Main horizontal padding | Content max-width | Content margin |
|---|---|---:|---|---:|---:|---:|---:|---|
| Midnight | Inter / system-ui, 14px | 260px | 22px 17px | 12px | 75px | 28px | 1400px | 25px auto |
| Paper | Georgia / serif, 15px | 238px | 24px 16px | 11px | 78px | 34px | 1380px | 28px auto |
| Glass | Inter / system-ui, 14px | 255px | 22px 17px | 12px | 78px | 27px | 1450px | 25px auto |
| Aurora | Inter / system-ui, 14px | 256px | 22px 17px | 12px | 78px | 28px | 1440px | 25px auto |
| Editorial | Inter / system-ui, 14px | 256px | 22px 17px | 12px | 78px | 28px | 1440px | 25px auto |
| Studio | Georgia / serif, 15px | 248px | 24px 16px | 11px | 78px | 30px | 1380px | 28px auto |

All six packages define the custom dashboard tokens in both Light and Dark blocks. Surface, border, text, accent, shadow and overlay values resolve through the package's semantic tokens; the shared base stylesheet contains no literal palette colors. Glass keeps its translucent surfaces and uses the package `--bee-blur` value for the shared sidebar, header and card surfaces in both modes. Midnight Dark continues to resolve the dashboard canvas, surfaces, text, borders and accents through the canonical Midnight Dark tokens described above.

The removed wrapper-only selectors `.bee-dash-workspace`, `.bee-dash-label` and `.bee-dash-user` were dead in the current shared dashboard template (the workspace switcher and sidebar user block are not rendered). The obsolete Paper workspace override was removed. Dashboard grid columns are defined once in `base.css`, with the mobile single-column override in the same rule family.

This is a source migration, not a claim of visual equivalence. Production build, token checker, style audit, browser screenshots and visual comparison remain required before acceptance.

## Part B1 — Appearance rule classification (original source snapshot)

The following classification numbers every one of the 65 CSS blocks in the original `core/appearance-modes.css` snapshot before migration. The category letters follow the refactor brief: **(a)** core appearance/toggle UI, **(b)** generic dashboard/shell, **(c)** public Light presentation, **(d)** temporary feature-compatibility overrides.

| Original rule(s) | Original selector / responsibility | Class | Destination or decision |
|---|---|---|---|
| 1 | `.theme-mode-toggle` | a | Keep in `core/appearance-modes.css`; semantic tokens only. |
| 2 | `.theme-mode-toggle:hover` | a | Keep in core; no literal color. |
| 3 | `.bee-template-manager__mode-controls` | a | Keep in core; layout only. |
| 4 | `.bee-template-mode` | a | Keep in core; semantic surface/border tokens. |
| 5 | `.bee-template-mode > div` | a | Keep in core; token-based muted surface. |
| 6 | `.bee-template-mode button` | a | Keep in core; semantic foreground/surface tokens. |
| 7 | `.bee-template-mode button.active` | a | Keep in core; replace literal shadow with semantic shadow token. |
| 8–14 | Dashboard canvas, sidebar/header, panels, nav buttons, quick actions and panel headings | b | Shared shell/content rules belong in `base.css`; use package dashboard tokens and no mode selector. |
| 15–34 | Public Light host, header, nav, hero, CTA, preview, cards, architecture, footer and login controls | c | Remove after equivalent token-driven public styles and package values exist; no dashboard selector may affect these surfaces. |
| 35 | Responsive stacking for `.bee-template-mode` | a | Keep in core as the responsive behavior of the appearance control. |
| 36–39 | Dashboard color-scheme, canvas, sidebar and header normalization | b | Shared base shell owns these roles; package tokens supply Light/Dark values. |
| 40 | Broad feature surface selector, including platform admin/company, members, settings, plugins, marketplace, audit, roles, invitations, forms, dialogs and package surfaces | d | Split into named, token-only compatibility rules at the end of `base.css`; retain `!important` only in this block. |
| 41 | Dashboard content text inheritance | b | Generic content inheritance belongs in `base.css`; no palette override. |
| 42 | Feature description, subtitle, eyebrow and hint text | d | Temporary feature compatibility rule in the end-of-file base block; semantic muted token only. |
| 43 | Feature input/select/textarea normalization | d | Temporary feature compatibility rule in the end-of-file base block; input/text/border tokens only. |
| 44 | Feature input placeholder normalization | d | Temporary feature compatibility rule in the end-of-file base block; placeholder token only. |
| 45 | Feature table surface normalization | d | Temporary feature compatibility rule in the end-of-file base block; surface/text/border tokens only. |
| 46 | Feature table row/cell normalization | d | Temporary feature compatibility rule in the end-of-file base block; surface/text/border tokens only. |
| 47–49 | Sidebar buttons, selected navigation and dashboard content buttons | b | Shared shell behavior belongs in `base.css`; package tokens define active/inactive states. |
| 50 | Feature create/action buttons (Platform Admin, Platform Company and Company Members) | d | Temporary feature compatibility rule in the end-of-file base block; action/surface/text/border tokens only. |
| 51 | Platform Admin modal backdrop and dialog foreground | d | Temporary feature compatibility rule in the end-of-file base block; semantic foreground token only. |
| 52 | Platform Admin/Company Members/error text | d | Temporary feature compatibility rule in the end-of-file base block; danger token only. |
| 53 | Platform Admin/Company Members/success text | d | Temporary feature compatibility rule in the end-of-file base block; success token only. |
| 54–56 | Final sidebar default, hover and active navigation pass | b | Merge into the token-driven base sidebar/navigation rules; no mode selector or `!important`. |
| 57–61 | Template manager appearance-mode card, label, segmented controls and active control | a | Keep in core; remove Light-only selector and use semantic tokens in both modes. |
| 62–63 | Template manager field label and select | a | Keep with template manager/appearance controls; use semantic text/input tokens without `!important`. |
| 64–65 | `.bee-users` and `.bee-company` alias overrides | b | Remove the two alias blocks; the active package host and Midnight Light tokens now supply the semantic values. |

The original 65-block snapshot contained **59 `!important` declarations**, **28 `[class*=` selectors**, **131 hex literals**, **41 `.bee-dash-` selector occurrences**, and **66 dashboard/public mode-attribute selector occurrences**. These are historical baseline counts. The temporary compatibility block was subsequently removed in Step 5; the public page components and their package-owned layout styles were tokenized in Step 6.

## Part B1–B4 — appearance migration result (2026-11-25)

The original-rule classification above is the migration ledger for all 65 CSS blocks from the pre-migration appearance-modes.css. The source migration is now applied as follows:

- **(a) Core controls:** the theme toggle, mode cards, segmented controls, labels and fields remain in core/appearance-modes.css. They use semantic tokens, have no !important, and are not restricted to Light mode.
- **(b) Shared dashboard shell:** canvas, sidebar, header, cards, quick actions, content foreground inheritance, settings navigation and responsive drawer rules live in base/base.css. They are not selected by data-bee-dashboard-mode; package token blocks supply the Light/Dark values.
- **(c) Public Light presentation:** the old public Light selector block was removed only after its presentation had token-driven equivalents in global styles.css and package token sheets. Public page styling remains separate from the dashboard shell.
- **(d) Temporary feature compatibility:** the temporary feature-owned block at the end of base/base.css was removed in Step 5 after the owning components adopted semantic tokens. Permanent shared element primitives now use zero-specificity `:where()` selectors. `base.css` contains no `!important`, `[class*=`, hex, RGB/HSL or legacy alias declarations.

### Source inspection after migration

| File / scope | Hex / RGB / HSL | `!important` | `[class*=` | Other result |
|---|---:|---:|---:|---|
| core/appearance-modes.css | 0 | 0 | 0 | Tokenized appearance controls only. |
| base/base.css | 0 | 0 | 0 | Temporary compatibility block deleted; zero legacy alias declarations; 96 open / 96 close braces. |
| packages/aurora/styles.css | 0 | 0 | 0 | Package layout uses semantic tokens. |
| packages/editorial/styles.css | 0 | 0 | 0 | Public layout uses semantic tokens. |
| packages/studio/styles.css | 0 | 0 | 0 | Public layout uses semantic tokens. |
| packages/midnight/styles.css | 0 | 0 | 0 | Shared shell remains in base. |
| packages/paper/styles.css | 0 | 0 | 0 | Package refinements use semantic tokens. |
| packages/glass/styles.css | 0 | 0 | 0 | Package refinements use semantic tokens. |
| Public page component inline CSS | 0 | 0 | 0 | Aurora 29/29, Editorial 29/29 and Studio 41/41 braces; all used tokens exist in contract and all package modes. |
| styles.css | 0 | 0 | 0 | Eight previous auth/dashboard/Notes priority overrides were removed through more specific selectors. |
| apps/web/src/app/time-tracking/time-tracking.component.css | 0 | 0 | 0 | Semantic input, text, status and surface tokens. |

The original appearance stylesheet's 65 blocks, 59 `!important`, 28 substring selectors, 131 hex literals, 41 dashboard-prefix occurrences and 66 mode-attribute selectors are historical baseline values, not current source counts.

### Package separation and mode coverage

- All six package token sheets define all **89 contract tokens** in each Light and Dark mode block (12 blocks; source comparison reported zero missing declarations).
- Light and Dark palettes remain package-owned and distinct. Midnight retains its canonical Dark background `#080a12`; Paper, Glass, Aurora, Editorial and Studio retain their own package Light/Dark backgrounds.
- Glass defines `--bee-blur: 18px` in both Light and Dark blocks. The shared sidebar, header and card surfaces consume `--bee-blur`.
- Dashboard structure is owned by `base.css`. Public site and authentication presentation remain in global/public styles and the three public package page components; public styling is not reintroduced into the dashboard base.
- The six temporary legacy aliases (`--bg`, `--panel`, `--muted`, `--border`, `--purple`, `--cyan`) have been removed after migrating the remaining Organization Company and Teams Workspace consumers.

The migration is source-inspected only. CSS parsing, cascade/specificity behavior and Light/Dark visual equivalence still require the documented build and browser review.
## Part B5 — Deferred feature-local override backlog

The original deferral baseline was 25 feature-local `:host-context` selectors. Subsequent source migrations removed 22 of them before the current cleanup pass, contrary to the earlier deferral boundary; those removals are not being restored. The remaining selectors are:

| Feature component | Original baseline | Current source |
|---|---:|---:|
| Documents | 17 | 0 |
| Organization Roles | 4 | 0 |
| Teams Workspace | 3 | 3 |
| Role Audit | 1 | 0 |
| **Total** | **25** | **3** |

Teams Workspace's three Midnight-Light selectors and their nine palette literals remain deliberately untouched. Runtime and visual review are still required before considering that exception resolved.
