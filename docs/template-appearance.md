# Template appearance modes

Every registered template supports `light` and `dark`. The package owns a fixed palette; users select a mode but cannot edit arbitrary colors.

| Target | Package | Default |
|---|---|---|
| Public | Aurora | Dark |
| Public | Editorial | Light |
| Public | Studio | Light |
| Dashboard | Midnight | Dark |
| Dashboard | Paper | Light |
| Dashboard | Glass | Dark |

## Controls and preference scope

- Public layout exposes the public mode toggle.
- Dashboard header exposes the dashboard mode toggle.
- Appearance settings expose the same template/mode controls.
- Each package retains its own saved mode; `defaultMode` is used when no preference exists.
- Public mode is browser-local per hostname.
- Dashboard mode is browser-local per active tenant/company and selected package.
- Cross-browser/device synchronization is not implemented by this refactor.

## Active surface contract

The runtime sets `data-bee-active-template` and `data-bee-active-mode` on `html`, and keeps independent public/dashboard metadata on `body`. Each package mode mirrors identical tokens to its host and matching active HTML surface. Mode changes update tokens without a full page reload. Public and dashboard changes must not affect each other.

## Contrast

Body text, surface text, muted text, accent text, status and link pairs target 4.5:1. Input placeholders and focus rings target 3:1. The checker composites supported alpha values over the actual backdrop and prints every skipped non-solid value.

Midnight Dark is the visual reference. Its `accent-text / accent` pair is the only documented exception (3.52:1); that pair is intentionally unchanged.

## Source structure

- `base/base.css`: shared structure and neutral primitives.
- `base/tokens.contract.css`: authoritative 89-token contract.
- `packages/<id>/tokens.css`: fixed Light/Dark palette values.
- `packages/<id>/styles.css`: package layout/decoration, not a second palette.
- Runtime and `core/appearance-modes.css`: lifecycle, registry, mode controls and active-surface synchronization.

The device simulator under `src/assets/device-simulator/**` is a standalone preview asset with an intentionally independent palette, not a seventh template. The legacy backend `/templates/theme` endpoint remains for compatibility; the current client ignores legacy custom-token fields.
