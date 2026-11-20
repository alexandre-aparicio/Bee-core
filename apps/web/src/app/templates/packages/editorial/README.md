# Editorial template package

- ID: `editorial`
- Version: `1.0.0`
- Target: `public`
- Layout component: `BeeEditorialLayoutComponent`

## Package contents

- `manifest.ts`: template identity and supported slots.
- `theme-tokens.ts`: fixed semantic palette.
- `components/layout.component.ts`: Angular layout projection component.
- `styles.css`: package-owned layout styles.
- `assets/`: package-owned assets and preview.

The shared runtime owns navigation, data, plugin slots and lifecycle. This package owns its presentation. Angular packages are trusted and statically compiled; installation enables a package already registered by the application and does not execute arbitrary uploaded JavaScript.
