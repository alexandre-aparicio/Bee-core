# Bee-Core template and website business model

Updated: 2026-11-25. This describes the current implementation on `refactor/template-base-and-packages` and separates it from future product work.

## Current runtime targets

The engine currently has two targets; separate corporate and tenant-public selectors are not implemented.

| Target | Scope | Selection/content |
|---|---|---|
| `public` | Hostname/public landing renderer shared by corporate and tenant-public presentation | Host-scoped selection; existing public page and tenant identity |
| `dashboard` | Active tenant/company workspace | Tenant/company-scoped selection; shared dashboard shell, feature pages and plugin outlets |

## Registered packages

| Target | Package | Default | Built in |
|---|---|---|---|
| Public | Aurora | Dark | Yes |
| Public | Editorial | Light | Yes |
| Public | Studio | Light | No |
| Dashboard | Midnight | Dark | Yes |
| Dashboard | Paper | Light | Yes |
| Dashboard | Glass | Dark | No |

Every package declares both modes, a default, target, layout/component identity and slots. Each supplies 89 semantic tokens in Light and Dark. Users choose a fixed package/mode; arbitrary color pickers and custom palettes are not part of the model.

## Template versus business plugin

| Template | Business plugin |
|---|---|
| Changes visual presentation | Adds a business capability |
| Trusted compiled Angular package | Owns plugin API, permissions, data and lifecycle |
| Supplies fixed palette and layout | Contributes approved navigation/routes/widgets/UI |
| Does not own business rules or tenant data | Does not replace the shared shell |

Dashboard content and plugin integration remain shared. Templates must not change permissions, routing, data loading, i18n, IDs, attributes or component contracts.

## Architecture

- `templates/base/base.css`: shared shell structure, responsive geometry and neutral primitives.
- `templates/base/tokens.contract.css`: authoritative 89-token contract and neutral fallback values.
- `templates/packages/<id>/tokens.css`: fixed package values for both modes.
- `templates/packages/<id>/styles.css`: package layout/decoration using semantic tokens.
- Runtime/registry and `core/appearance-modes.css`: lifecycle, selection, mode controls and active HTML surface synchronization.
- `src/assets/device-simulator/**`: standalone preview asset with an independent palette, not a template.

## Preferences and compatibility

Public mode is browser-local per hostname. Dashboard mode is browser-local per active tenant/company and package. Cross-browser/device mode synchronization is not part of this refactor.

The backend legacy `/templates/theme` endpoint and response shape remain unchanged for compatibility. The current client ignores legacy custom-token fields and has no custom-palette persistence adapter. Installation does not download and execute arbitrary bundles.

## Future work, not current capabilities

- Separate permissioned platform-corporate and tenant-public targets.
- Versioned public plugin-contribution slots and public plugin routes/pages.
- CMS editing for corporate/tenant public content.
- Cross-device appearance-mode synchronization.
- Runtime execution of uploaded template bundles.

Future extensions must preserve separation between presentation packages and business plugins, enforce scope/permissions server-side and maintain tenant isolation.
