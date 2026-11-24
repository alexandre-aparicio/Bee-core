# Template semantic token mapping

This is the working migration map for replacing literal colors with the semantic tokens in `apps/web/src/app/templates/base/tokens.contract.css`.

The Midnight DARK values in `apps/web/src/app/templates/packages/midnight/tokens.css` are the reference when migrating existing Midnight-dark surfaces. Template palettes remain fixed in their own package `tokens.css`; users select only Light or Dark.

## Literal color → semantic token

| Existing literal / family | Semantic token | Mapping note |
|---|---|---|
| `#080a12`, `#090b13` | `--bee-bg` | Midnight-dark page/canvas background; `#090b13` is unified with the canonical Midnight value. |
| `#10131e`, `#101827`, `#111b2a` | `--bee-surface` or `--bee-surface-raised` | Panel and raised-surface family. The latter two shades are unified to the available semantic surface roles; review the small shade changes in visual QA. |
| `#17202f` | `--bee-surface-subtle` | Subtle secondary surface. |
| `#263247` | `--bee-surface-hover` | Hover surface. |
| `#34415a` | `--bee-surface-active` | Active/pressed surface. |
| `#25324a`, `#303447` | `--bee-border` | Border family. `#25324a` is unified with the canonical `#303447`; inspect contrast and density after migration. |
| `#59677d` | `--bee-border-strong` | Strong border/separator. |
| `#e8eaf2`, `#e5ecf8` | `--bee-text` | Primary foreground family. `#e5ecf8` is unified with the Midnight canonical text color. |
| `#8991a4` | `--bee-text-muted` | Muted text and metadata. |
| `#8998ad` | `--bee-text-subtle` | Subtle secondary text. |
| `#ffffff` | `--bee-text-inverse` or `--bee-accent-text` | Choose by semantic role, not by literal alone. |
| `#8c72ff` | `--bee-accent` | Midnight primary accent/focus. |
| `#b2a5ff` | `--bee-accent-hover` | Midnight accent hover. |
| `#69e5d4` | `--bee-secondary` | Midnight secondary accent. |
| `#55c99a`, `#e6b45f`, `#ef7777`, `#69b8e5` | `--bee-status-success`, `--bee-status-warning`, `--bee-status-danger`, `--bee-status-info` | Map each status color only to its matching status role. |
| Status tint families such as `#55c99a18`, `#e6b45f18`, `#ef777718`, `#69b8e518` | Corresponding `--bee-status-*-soft` | Keep each tint paired with its status role. |
| Existing shadows | `--bee-shadow`, `--bee-shadow-raised` | Preserve the intended elevation level; do not replace shadows with a color token. |
| Existing modal/backdrop overlays | `--bee-overlay` | Use the package-defined overlay token. |
| Translucent white borders/overlays such as `rgba(255,255,255,.05)` | `color-mix(in srgb, var(--bee-text) 8%, transparent)` or a dedicated semantic token | Do not retain an RGB literal in feature or core CSS. Add a contract token if the role is reused or needs a package-specific fixed value. |
| Input surfaces | `--bee-input-bg`, `--bee-input-border`, `--bee-input-placeholder` | Keep input roles distinct from general cards where the current design does so. |

## Unification decisions requiring visual review

1. Near-black backgrounds `#090b13` are mapped to Midnight's `--bee-bg: #080a12`.
2. Panel shades `#101827` and `#111b2a` are consolidated into the existing surface/raised-surface roles rather than preserved as local colors.
3. Border shade `#25324a` is consolidated into `--bee-border: #303447`.
4. Foreground shade `#e5ecf8` is consolidated into `--bee-text: #e8eaf2`.

These are intentional semantic consolidations, not claims of pixel equivalence. Review them against the pre-refactor Midnight DARK appearance on real screens.

## Migration rules

- Extend this table before introducing a mapping not listed here.
- Use tokens from the contract only; confirm every consumed token exists in all six package palettes in both supported modes.
- If no existing token represents a color role, add a semantic token to the contract and all six package token files in both modes before consuming it.
- Do not add tenant-defined palettes or color pickers. Templates own their fixed Light and Dark palettes.
- Do not use local hex fallbacks in feature styles.


## Global stylesheet migration — Step 2

The following literal families were found in the original `apps/web/src/styles.css` and mapped by declaration role. Alpha-bearing colors use `color-mix(in srgb, var(--bee-token) N%, transparent)`; translucent shadow colors use `--bee-overlay-strong` so the original shadow geometry is retained.

| Original literal(s) | Semantic token |
|---|---|
| `#4f44c9`, `#6655d8`, `#6754d830`, `#6756d8`, `#6b58c4`, `#6f5be933`, `#6f5bf822`, `#7964f622`, `#7f6cf855`, `#8070d930`, `#8370ff30`, `#8570f71a`, `#8771f714`, `#8771f72e`, `#8771f8`, `#8772f716`, `#8773f72a`, `#8873f71c`, `#8874f71b`, `#8970ff16`, `#8974f7`, `#8a73ff0e`, `#8b75ff`, `#8b76ff`, `#8b76ff18`, `#8c72ff0b`, `#8c72ff18`, `#8c72ff1b`, `#8c72ff20`, `#8c72ff44`, `#8c72ff55`, `#8c75ff19`, `#8e7aff`, `#9276ff`, `#927aff14` | `--bee-accent` |
| `#9b85ff`, `#9b88ff07`, `#a293ff`, `#a394ff`, `#a595ff`, `#a79aff`, `#a998ff`, `#a99aff`, `#aa98ff`, `#aaa0ff`, `#b0a3ff`, `#b2a5ff`, `#b2a6ff`, `#b3a7ff`, `#b4a8ff`, `#b5a5ff`, `#b5a9ff`, `#b8a8ff`, `#c6baff` | `--bee-accent-hover` |
| `#080a12`, `#090b13` | `--bee-bg` |
| `#242637`, `#242736`, `#25293a`, `#26293a`, `#262a3a`, `#292b3d`, `#2a2b3d`, `#2a2d3c`, `#303348` | `--bee-border` |
| `#0a0d16` | `--bee-input-bg` |
| `#0000000b`, `#0003`, `#0004`, `#0005`, `#0007`, `#0008`, `#050711b8` | `--bee-overlay-strong` |
| `#58d4d40b`, `#6bdbdb` | `--bee-secondary` |
| `#b94a4a18`, `#e58a8a`, `#e58a8a0d`, `#e58a8a16`, `#e58a8a55`, `#f0a2a2`, `#f0aaaa`, `#f26f7310`, `#f26f7344`, `#ff8e9c`, `#ff9b9f` | `--bee-status-danger` |
| `#70b7ff`, `#70b7ff12`, `#79b9ff`, `#79b9ff10` | `--bee-status-info` |
| `#3b9c6c18`, `#53d598`, `#57d49c0a`, `#57d49c25`, `#59d59c0c`, `#59d59c33`, `#67d6a2`, `#6dd9a4`, `#6dd9a410`, `#6ed8a7`, `#70d8a5`, `#71d9a5`, `#72d9a4`, `#73d8a8`, `#73d8a810`, `#75d9aa`, `#75d9aa14`, `#76d8a6`, `#8ddbb2` | `--bee-status-success` |
| `#e8b46a`, `#e8b46a16`, `#e8b46a18` | `--bee-status-warning` |
| `#0b0d16`, `#0b0e17`, `#0c0f18`, `#0c0f19`, `#10131d`, `#10131ef0`, `#111420`, `#111421`, `#121522`, `#131622` | `--bee-surface` |
| `#181a24` | `--bee-surface-raised` |
| `#292c3c` | `--bee-surface-subtle` |
| `#000`, `#c5c9d5`, `#c7cedc`, `#c8ceda`, `#d2d6e2`, `#dcd5ff`, `#e5e8f0`, `#e8eaf2`, `#edf0f8`, `#eee`, `#fff`, `#ffffff03`, `#ffffff04`, `#ffffff05`, `#ffffff08`, `#ffffff09`, `#ffffff0a`, `#ffffff0b` | `--bee-text` |
| `#697388`, `#717b90`, `#737c91`, `#788398`, `#7e879b`, `#80899b`, `#80899d`, `#818ba0`, `#82899b`, `#828ca1`, `#848ca0`, `#848ea2`, `#858ea3`, `#8790a4`, `#8791a5`, `#8a93a8`, `#8b95a9`, `#8f95a8`, `#9099ac`, `#9199ac`, `#929bad`, `#929bae`, `#929bb0`, `#949caf`, `#969fb1`, `#9ba4b6`, `#9ca4b6`, `#9da5b6`, `#9da6b8`, `#a0a9bb`, `#b6bdcd` | `--bee-text-muted` |
| `#535b6d` | `--bee-text-subtle` |

Additional transformations: `rgba(160,170,200,.13)` → 13% `--bee-text` mix; `rgba(255,255,255,.05)` → 5% `--bee-text` mix; `rgba(136,124,255,.08)` → 8% `--bee-accent` mix; mask gradient `black` → opaque `--bee-text`; white action foregrounds → `--bee-accent-text`. The old `var(--surface, #ffffff04)` fallback was replaced with a 1% `--bee-text` mix.

## Step 2 semantic unifications requiring visual review

- Near-black page and dashboard canvases (including `#090b13`) use Midnight `--bee-bg`.
- Nearby panel shades are consolidated into `--bee-surface`, `--bee-surface-raised` and `--bee-surface-subtle`.
- Neutral foreground shades are consolidated into `--bee-text`, `--bee-text-muted` and `--bee-text-subtle`.
- Neutral borders are consolidated into `--bee-border`; accent borders/glows use the package accent token at their original alpha.
- Green, amber, red and blue status shades use their matching status tokens; alpha tints are derived from those tokens.
- Dark translucent shadows/backdrops use semantic overlay tokens while retaining existing offsets, blur and spread.
- Translucent white separators use the current mode's text token at the original alpha, so the tint changes with Light/Dark rather than staying white.

These are semantic consolidations, not claims of pixel equivalence. Review the public preview, auth surface, dashboard cards, company directory, audit table, invitation menus and platform-admin modals in all six templates and both modes.
