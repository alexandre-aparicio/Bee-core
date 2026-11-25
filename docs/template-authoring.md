# Template authoring guide

A template is a trusted, compiled Angular presentation package. It is not a business plugin and does not own application behavior.

## Registered packages

| Target | Package | Default | Availability |
|---|---|---|---|
| Public | Aurora | Dark | Built in |
| Public | Editorial | Light | Built in |
| Public | Studio | Light | Installable |
| Dashboard | Midnight | Dark | Built in |
| Dashboard | Paper | Light | Built in |
| Dashboard | Glass | Dark | Installable |

Every package supports `light` and `dark`; `defaultMode` only defines the initial mode.

## Add a package

1. Copy the closest directory into `src/app/templates/packages/<new-id>/`.
2. Change the stable lowercase ID in `manifest.ts` and every selector in `tokens.css`.
3. Set manifest identity, version, target, preview URL, description, availability, layout key, component ID, slots, `appearanceModes: ['light', 'dark']` and `defaultMode`.
4. Register the manifest in `packages/index.ts` and register/export its layout component using the existing registry pattern. Do not add a new runtime loader.
5. Define exactly one complete token block for each declared mode. Every block must include all 89 contract tokens exactly once.
6. Keep `styles.css` for package layout and decoration using semantic tokens. Do not put a second palette in package styles, component styles, inline styles or templates.
7. Update the package README and preview asset. Preserve component IDs, selectors, attributes, APIs, routes, permissions, i18n and plugin slots.

## Ownership boundaries

| Layer | Owns | Does not own |
|---|---|---|
| `base/base.css` | Shared shell structure, responsive geometry and neutral primitives | Package palette |
| `base/tokens.contract.css` | Authoritative 89-token contract and neutral fallbacks | Package color choices |
| `packages/<id>/tokens.css` | Fixed Light/Dark values for all 89 tokens | Business logic or user-defined palettes |
| `packages/<id>/styles.css` | Package layout and decoration using semantic tokens | Literal palette values or `!important` |
| Runtime/registry and `core/appearance-modes.css` | Lifecycle, registry/selection, mode controls and active-surface synchronization | Package palette or feature business logic |
| Feature components | Feature content and interactions | Template-specific palette overrides |

Dashboard content and plugin integration remain shared. Templates change presentation only.

## Active HTML mirror

Each package mode rule scopes the same declarations to its own package host and the active document surface:

- Host: `.bee-template-package-host[data-bee-template="<id>"][data-bee-<target>-mode="<mode>"]`
- HTML mirror: `html[data-bee-active-template="<id>"][data-bee-active-mode="<mode>"]`

The engine maintains active template/mode attributes on `html` and independent public/dashboard metadata on `body`. Host and HTML mirror must resolve identical tokens. Do not add local `:host-context` palette overrides or broad selectors that leak between surfaces.

## Contrast and validation

- 4.5:1 for body text/background, text/surface, muted/surface, accent-text/accent, status/status-soft and link/background.
- 3:1 for input-placeholder/input-background and focus-ring/page-background.
- Supported alpha and `color-mix()` values are composited over the relevant backdrop. Unresolvable values print `SKIPPED (non-solid)`.
- Midnight Dark is the visual reference. Its `accent-text / accent` pair at 3.52:1 is the single explicit exception; do not change it without design approval.

Run from `apps/web`:

```bash
npm run check:template-tokens
npm run lint:styles
npm run audit:styles -- --strict
npx playwright test e2e/templates.spec.ts
```

CI also runs the contrast checker in blocking mode and `node --test scripts/check-extensibility.test.mjs`.

## Guardrails and compatibility

Strict audit scans `.css`, `.ts` (including inline Angular styles/templates) and `.html` under `src`. Stylelint covers standalone CSS. The only allowlist entries are package `tokens.css`, `tokens.contract.css` and `src/assets/device-simulator/**`.

The device simulator is a standalone preview asset with an intentionally independent palette, not a seventh template.

The backend legacy `/templates/theme` endpoint and response shape remain unchanged for compatibility. The current client ignores legacy custom-token fields and renders the selected package's fixed tokens.

## Full token reference

Generated from `templates/base/tokens.contract.css` (89 declared tokens).

| Token | Purpose | Example usage | Light / Dark intent |
|---|---|---|---|
| `--bee-bg` | Page canvas background | `background: var(--bee-bg);` | Light uses lighter surfaces; Dark uses deeper surfaces with clear layer separation. |
| `--bee-surface` | Default panel/card surface | `background: var(--bee-surface);` | Light uses lighter surfaces; Dark uses deeper surfaces with clear layer separation. |
| `--bee-surface-raised` | Elevated card, menu and popover surface | `background: var(--bee-surface-raised);` | Light uses lighter surfaces; Dark uses deeper surfaces with clear layer separation. |
| `--bee-surface-deep` | Surface deep | `background: var(--bee-surface-deep);` | Light uses lighter surfaces; Dark uses deeper surfaces with clear layer separation. |
| `--bee-surface-subtle` | Surface subtle | `background: var(--bee-surface-subtle);` | Light uses lighter surfaces; Dark uses deeper surfaces with clear layer separation. |
| `--bee-surface-hover` | Surface hover | `background: var(--bee-surface-hover);` | Light uses lighter surfaces; Dark uses deeper surfaces with clear layer separation. |
| `--bee-surface-active` | Surface active | `background: var(--bee-surface-active);` | Light uses lighter surfaces; Dark uses deeper surfaces with clear layer separation. |
| `--bee-text` | Primary foreground text | `color: var(--bee-text);` | Use a mode-appropriate foreground/accent with contrast against its actual surface. |
| `--bee-text-muted` | Secondary labels and descriptions | `color: var(--bee-text-muted);` | Use a mode-appropriate foreground/accent with contrast against its actual surface. |
| `--bee-text-subtle` | Text subtle | `color: var(--bee-text-subtle);` | Use a mode-appropriate foreground/accent with contrast against its actual surface. |
| `--bee-text-inverse` | Text inverse | `color: var(--bee-text-inverse);` | Use a mode-appropriate foreground/accent with contrast against its actual surface. |
| `--bee-link` | Inline link foreground | `color: var(--bee-link);` | Use a mode-appropriate foreground/accent with contrast against its actual surface. |
| `--bee-border` | Border | `border-color: var(--bee-border);` | Package-specific value; preserve semantic meaning and readable contrast in both modes. |
| `--bee-border-strong` | Border strong | `border-color: var(--bee-border-strong);` | Package-specific value; preserve semantic meaning and readable contrast in both modes. |
| `--bee-focus-ring` | Keyboard focus indicator | `background: var(--bee-focus-ring);` | Package-specific value; preserve semantic meaning and readable contrast in both modes. |
| `--bee-accent` | Primary brand/action accent | `background: var(--bee-accent);` | Use a mode-appropriate foreground/accent with contrast against its actual surface. |
| `--bee-accent-strong` | Accent strong | `background: var(--bee-accent-strong);` | Use a mode-appropriate foreground/accent with contrast against its actual surface. |
| `--bee-accent-hover` | Accent hover | `background: var(--bee-accent-hover);` | Use a mode-appropriate foreground/accent with contrast against its actual surface. |
| `--bee-accent-soft` | Accent soft | `background: var(--bee-accent-soft);` | Use a mode-appropriate foreground/accent with contrast against its actual surface. |
| `--bee-accent-text` | Foreground on accent surfaces | `color: var(--bee-accent-text);` | Use a mode-appropriate foreground/accent with contrast against its actual surface. |
| `--bee-secondary` | Secondary | `background: var(--bee-secondary);` | Package-specific value; preserve semantic meaning and readable contrast in both modes. |
| `--bee-action-text` | Action text | `color: var(--bee-action-text);` | Use a mode-appropriate foreground/accent with contrast against its actual surface. |
| `--bee-status-success` | Status success | `color: var(--bee-status-success);` | Keep semantic status meaning and contrast against its matching soft surface. |
| `--bee-status-success-soft` | Status success soft | `color: var(--bee-status-success-soft);` | Keep semantic status meaning and contrast against its matching soft surface. |
| `--bee-status-warning` | Status warning | `color: var(--bee-status-warning);` | Keep semantic status meaning and contrast against its matching soft surface. |
| `--bee-status-warning-soft` | Status warning soft | `color: var(--bee-status-warning-soft);` | Keep semantic status meaning and contrast against its matching soft surface. |
| `--bee-status-danger` | Status danger | `color: var(--bee-status-danger);` | Keep semantic status meaning and contrast against its matching soft surface. |
| `--bee-status-danger-soft` | Status danger soft | `color: var(--bee-status-danger-soft);` | Keep semantic status meaning and contrast against its matching soft surface. |
| `--bee-status-info` | Status info | `color: var(--bee-status-info);` | Keep semantic status meaning and contrast against its matching soft surface. |
| `--bee-status-info-soft` | Status info soft | `color: var(--bee-status-info-soft);` | Keep semantic status meaning and contrast against its matching soft surface. |
| `--bee-shadow` | Shadow | `box-shadow: var(--bee-shadow);` | Adapt elevation/transparency without colored glow or loss of separation. |
| `--bee-shadow-raised` | Shadow raised | `box-shadow: var(--bee-shadow-raised);` | Adapt elevation/transparency without colored glow or loss of separation. |
| `--bee-overlay` | Modal and drawer backdrop | `background: var(--bee-overlay);` | Adapt elevation/transparency without colored glow or loss of separation. |
| `--bee-overlay-strong` | Overlay strong | `background: var(--bee-overlay-strong);` | Adapt elevation/transparency without colored glow or loss of separation. |
| `--bee-blur` | Blur | `backdrop-filter: blur(var(--bee-blur));` | Adapt elevation/transparency without colored glow or loss of separation. |
| `--bee-radius-sm` | Radius sm | `border-radius: var(--bee-radius-sm);` | Geometry/typography normally stays stable between modes. |
| `--bee-radius-md` | Radius md | `border-radius: var(--bee-radius-md);` | Geometry/typography normally stays stable between modes. |
| `--bee-radius-lg` | Radius lg | `border-radius: var(--bee-radius-lg);` | Geometry/typography normally stays stable between modes. |
| `--bee-input-bg` | Input/control surface | `background: var(--bee-input-bg);` | Light uses lighter surfaces; Dark uses deeper surfaces with clear layer separation. |
| `--bee-input-border` | Input border | `border-color: var(--bee-input-border);` | Package-specific value; preserve semantic meaning and readable contrast in both modes. |
| `--bee-input-placeholder` | Input placeholder foreground | `background: var(--bee-input-placeholder);` | Package-specific value; preserve semantic meaning and readable contrast in both modes. |
| `--bee-qr-dark` | Qr dark | `background: var(--bee-qr-dark);` | Package-specific value; preserve semantic meaning and readable contrast in both modes. |
| `--bee-qr-light` | Qr light | `background: var(--bee-qr-light);` | Package-specific value; preserve semantic meaning and readable contrast in both modes. |
| `--bee-public-hero-grid-opacity` | Public hero grid opacity | `opacity: var(--bee-public-hero-grid-opacity);` | Package-specific value; preserve semantic meaning and readable contrast in both modes. |
| `--bee-public-preview-sidebar-background` | Public preview sidebar background | `background: var(--bee-public-preview-sidebar-background);` | Light uses lighter surfaces; Dark uses deeper surfaces with clear layer separation. |
| `--bee-public-feature-card-background` | Public feature card background | `background: var(--bee-public-feature-card-background);` | Light uses lighter surfaces; Dark uses deeper surfaces with clear layer separation. |
| `--bee-dashboard-font-family` | Dashboard font family | `font-family: var(--bee-dashboard-font-family);` | Geometry/typography normally stays stable between modes. |
| `--bee-dashboard-font-size` | Dashboard font size | `font-size: var(--bee-dashboard-font-size);` | Geometry/typography normally stays stable between modes. |
| `--bee-dashboard-sidebar-heading-font-family` | Dashboard sidebar heading font family | `font-family: var(--bee-dashboard-sidebar-heading-font-family);` | Geometry/typography normally stays stable between modes. |
| `--bee-dashboard-sidebar-heading-letter-spacing` | Dashboard sidebar heading letter spacing | `letter-spacing: var(--bee-dashboard-sidebar-heading-letter-spacing);` | Geometry/typography normally stays stable between modes. |
| `--bee-dashboard-welcome-font-weight` | Dashboard welcome font weight | `font-weight: var(--bee-dashboard-welcome-font-weight);` | Geometry/typography normally stays stable between modes. |
| `--bee-dashboard-sidebar-width` | Dashboard sidebar width | `width: var(--bee-dashboard-sidebar-width);` | Geometry/typography normally stays stable between modes. |
| `--bee-dashboard-sidebar-padding` | Dashboard sidebar padding | `padding: var(--bee-dashboard-sidebar-padding);` | Geometry/typography normally stays stable between modes. |
| `--bee-dashboard-sidebar-gap` | Dashboard sidebar gap | `gap: var(--bee-dashboard-sidebar-gap);` | Geometry/typography normally stays stable between modes. |
| `--bee-dashboard-main-padding-inline` | Dashboard main padding inline | `padding: var(--bee-dashboard-main-padding-inline);` | Geometry/typography normally stays stable between modes. |
| `--bee-dashboard-main-padding-bottom` | Dashboard main padding bottom | `padding: var(--bee-dashboard-main-padding-bottom);` | Geometry/typography normally stays stable between modes. |
| `--bee-dashboard-header-height` | Dashboard header height | `height: var(--bee-dashboard-header-height);` | Geometry/typography normally stays stable between modes. |
| `--bee-dashboard-content-width` | Dashboard content width | `width: var(--bee-dashboard-content-width);` | Geometry/typography normally stays stable between modes. |
| `--bee-dashboard-content-margin` | Dashboard content margin | `margin: var(--bee-dashboard-content-margin);` | Geometry/typography normally stays stable between modes. |
| `--bee-dashboard-sidebar-background` | Dashboard sidebar background | `background: var(--bee-dashboard-sidebar-background);` | Light uses lighter surfaces; Dark uses deeper surfaces with clear layer separation. |
| `--bee-dashboard-sidebar-border` | Dashboard sidebar border | `border-color: var(--bee-dashboard-sidebar-border);` | Package-specific value; preserve semantic meaning and readable contrast in both modes. |
| `--bee-dashboard-header-background` | Dashboard header background | `background: var(--bee-dashboard-header-background);` | Light uses lighter surfaces; Dark uses deeper surfaces with clear layer separation. |
| `--bee-dashboard-header-border` | Dashboard header border | `border-color: var(--bee-dashboard-header-border);` | Package-specific value; preserve semantic meaning and readable contrast in both modes. |
| `--bee-dashboard-header-color` | Dashboard header color | `color: var(--bee-dashboard-header-color);` | Use a mode-appropriate foreground/accent with contrast against its actual surface. |
| `--bee-dashboard-header-button-background` | Dashboard header button background | `background: var(--bee-dashboard-header-button-background);` | Light uses lighter surfaces; Dark uses deeper surfaces with clear layer separation. |
| `--bee-dashboard-header-button-border` | Dashboard header button border | `border-color: var(--bee-dashboard-header-button-border);` | Package-specific value; preserve semantic meaning and readable contrast in both modes. |
| `--bee-dashboard-header-button-radius` | Dashboard header button radius | `border-radius: var(--bee-dashboard-header-button-radius);` | Geometry/typography normally stays stable between modes. |
| `--bee-dashboard-sidebar-heading-color` | Dashboard sidebar heading color | `color: var(--bee-dashboard-sidebar-heading-color);` | Use a mode-appropriate foreground/accent with contrast against its actual surface. |
| `--bee-dashboard-nav-color` | Dashboard nav color | `color: var(--bee-dashboard-nav-color);` | Use a mode-appropriate foreground/accent with contrast against its actual surface. |
| `--bee-dashboard-nav-active-background` | Dashboard nav active background | `color: var(--bee-dashboard-nav-active-background);` | Light uses lighter surfaces; Dark uses deeper surfaces with clear layer separation. |
| `--bee-dashboard-nav-active-color` | Dashboard nav active color | `color: var(--bee-dashboard-nav-active-color);` | Use a mode-appropriate foreground/accent with contrast against its actual surface. |
| `--bee-dashboard-nav-radius` | Dashboard nav radius | `border-radius: var(--bee-dashboard-nav-radius);` | Geometry/typography normally stays stable between modes. |
| `--bee-dashboard-card-background` | Dashboard card background | `background: var(--bee-dashboard-card-background);` | Light uses lighter surfaces; Dark uses deeper surfaces with clear layer separation. |
| `--bee-dashboard-card-border` | Dashboard card border | `border-color: var(--bee-dashboard-card-border);` | Package-specific value; preserve semantic meaning and readable contrast in both modes. |
| `--bee-dashboard-card-color` | Dashboard card color | `color: var(--bee-dashboard-card-color);` | Use a mode-appropriate foreground/accent with contrast against its actual surface. |
| `--bee-dashboard-card-shadow` | Dashboard card shadow | `box-shadow: var(--bee-dashboard-card-shadow);` | Adapt elevation/transparency without colored glow or loss of separation. |
| `--bee-dashboard-quick-action-background` | Dashboard quick action background | `background: var(--bee-dashboard-quick-action-background);` | Light uses lighter surfaces; Dark uses deeper surfaces with clear layer separation. |
| `--bee-dashboard-quick-action-border` | Dashboard quick action border | `border-color: var(--bee-dashboard-quick-action-border);` | Package-specific value; preserve semantic meaning and readable contrast in both modes. |
| `--bee-dashboard-quick-action-color` | Dashboard quick action color | `color: var(--bee-dashboard-quick-action-color);` | Use a mode-appropriate foreground/accent with contrast against its actual surface. |
| `--bee-dashboard-quick-action-muted` | Dashboard quick action muted | `background: var(--bee-dashboard-quick-action-muted);` | Package-specific value; preserve semantic meaning and readable contrast in both modes. |
| `--bee-dashboard-quick-action-radius` | Dashboard quick action radius | `border-radius: var(--bee-dashboard-quick-action-radius);` | Geometry/typography normally stays stable between modes. |
| `--bee-dashboard-settings-active-background` | Dashboard settings active background | `background: var(--bee-dashboard-settings-active-background);` | Light uses lighter surfaces; Dark uses deeper surfaces with clear layer separation. |
| `--bee-dashboard-settings-panel-border` | Dashboard settings panel border | `border-color: var(--bee-dashboard-settings-panel-border);` | Package-specific value; preserve semantic meaning and readable contrast in both modes. |
| `--bee-dashboard-settings-panel-background` | Dashboard settings panel background | `background: var(--bee-dashboard-settings-panel-background);` | Light uses lighter surfaces; Dark uses deeper surfaces with clear layer separation. |
| `--bee-dashboard-profile-menu-border` | Dashboard profile menu border | `border-color: var(--bee-dashboard-profile-menu-border);` | Package-specific value; preserve semantic meaning and readable contrast in both modes. |
| `--bee-dashboard-profile-status-border` | Dashboard profile status border | `border-color: var(--bee-dashboard-profile-status-border);` | Keep semantic status meaning and contrast against its matching soft surface. |
| `--bee-dashboard-mobile-overlay` | Dashboard mobile overlay | `background: var(--bee-dashboard-mobile-overlay);` | Adapt elevation/transparency without colored glow or loss of separation. |
| `--bee-dashboard-mobile-drawer-shadow` | Dashboard mobile drawer shadow | `box-shadow: var(--bee-dashboard-mobile-drawer-shadow);` | Adapt elevation/transparency without colored glow or loss of separation. |
| `--bee-dashboard-mobile-overlay-blur` | Dashboard mobile overlay blur | `backdrop-filter: blur(var(--bee-dashboard-mobile-overlay-blur));` | Adapt elevation/transparency without colored glow or loss of separation. |
