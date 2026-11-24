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
