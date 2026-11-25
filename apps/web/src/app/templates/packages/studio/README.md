# Studio template package

- **ID:** `studio`
- **Target:** `public`
- **Default mode:** `light`
- **Availability:** Installable
- **Layout:** `public.studio`

Warm editorial landing page with a bright accent palette.

## Token contract

`tokens.css` defines all 89 semantic `--bee-*` tokens in both `light` and `dark`. Each mode scopes values to this package host and mirrors them to the active HTML surface. This is the package's only palette source.

`styles.css` owns package-specific layout and decoration using semantic variables. It must not define another palette, literal color values, legacy aliases, broad host-context overrides or `!important`.

## Shared ownership

The base owns shared shell structure, responsive behavior and neutral primitives. Runtime owns lifecycle, registry/selection, mode controls and active-surface synchronization. Dashboard content and plugin integration remain shared. This package must not change business logic, i18n, routing, permissions, IDs, attributes, APIs or component contracts.

## Supported slots

- header
- hero
- content and footer

See [Template authoring](../../../../../../../docs/template-authoring.md) for the full contract and token reference.
