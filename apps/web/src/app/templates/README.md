# Template architecture

The Angular template runtime has two targets: `public` and `dashboard`. A package changes presentation only.

| Layer | Responsibility |
|---|---|
| `base/base.css` | Shared shell structure, responsive geometry and neutral primitives |
| `base/tokens.contract.css` | 89 semantic `--bee-*` tokens and neutral fallback values |
| `packages/<id>/tokens.css` | Fixed values for all 89 tokens in Light and Dark |
| `packages/<id>/styles.css` | Package-specific layout/decoration using semantic tokens |
| Runtime/registry and `core/appearance-modes.css` | Lifecycle, selection, mode controls and active HTML surface synchronization |

## Packages

| Target | Package | Default | Built in |
|---|---|---|---|
| Public | Aurora | Dark | Yes |
| Public | Editorial | Light | Yes |
| Public | Studio | Light | No |
| Dashboard | Midnight | Dark | Yes |
| Dashboard | Paper | Light | Yes |
| Dashboard | Glass | Dark | No |

Base owns shared structure; the contract owns token names; each package owns its fixed palette and layout decoration; runtime owns lifecycle and mode activation; feature components own content and interactions. Dashboard content and plugin integration remain shared.

The engine mirrors the active package/mode to `html[data-bee-active-template]` and `html[data-bee-active-mode]`, with independent surface metadata on `body`. Package token rules target their own host and the matching HTML surface.

Do not add literal colors, legacy aliases (`--bg`, `--panel`, `--muted`, `--border`, `--purple`, `--cyan`), `!important`, `[class*=` palette hacks or old `md-`/`pd-`/`gd-` prefixes. The device simulator is a standalone preview asset with its own documented palette exception, not a seventh template.

The legacy backend `/templates/theme` endpoint remains unchanged for compatibility; the current client ignores legacy custom-token fields.

See [Template authoring](../../../../../docs/template-authoring.md), [Appearance modes](../../../../../docs/template-appearance.md) and [Business model](../../../../../docs/template-business-model.md).
