# Midnight template package

- ID: `midnight`
- Version: `1.0.0`
- Target: `dashboard`
- Layout component: `BeeMidnightLayoutComponent`

## Package contents

- `manifest.ts`: template identity and supported slots.
- `tokens.css`: fixed semantic palette for Light and Dark modes.
- `components/layout.component.ts`: Angular layout projection component.
- `styles.css`: package-owned layout styles.
- `assets/`: package-owned assets and preview.

The shared runtime owns navigation, data, plugin slots and lifecycle. This package owns its presentation. Angular packages are trusted and statically compiled; installation enables a package already registered by the application and does not execute arbitrary uploaded JavaScript.
