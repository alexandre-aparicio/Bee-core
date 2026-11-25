# Shared template runtime and appearance controls

The shared core is limited to package lifecycle, registry/selection, appearance-mode controls and active-surface synchronization. It does not own package palettes, feature business logic, permissions, routing or page content.

## Responsibilities

- Register trusted compiled manifests and layout components.
- Validate selected packages against target and installed state.
- Resolve active package/mode for public and dashboard surfaces.
- Set `data-bee-active-template` and `data-bee-active-mode` on `html`, and independent surface metadata on `body`.
- Provide Light/Dark controls and persist browser-local mode preferences at hostname/tenant scope.
- Keep existing component IDs, attributes, APIs and plugin slots stable.

Runtime services and package/slot registries live under `templates/`; `core/appearance-modes.css` styles shared appearance controls. Core contains no package color values.

## Non-responsibilities

No package palettes, global page layouts, feature business logic, permissions, route definitions, API behavior or plugin-owned page content.

`base/tokens.contract.css` defines the 89 semantic tokens and neutral fallbacks. Each package `tokens.css` supplies all values for both modes. Runtime selects and activates a package; it never computes or rewrites the palette.

See [Template architecture](../README.md) and [Template authoring](../../../../../../docs/template-authoring.md).
