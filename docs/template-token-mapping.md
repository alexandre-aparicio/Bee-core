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
