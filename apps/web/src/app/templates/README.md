# Bee-Core Template Engine

The Angular runtime has a trusted template registry. Templates are presentation packages, not business plugins.

## Product surfaces

The target product separates three scopes:
- **Platform corporate website:** selected globally by the platform superadministrator. Its existing content and page structure remain predefined.
- **Tenant public website:** selected independently by each tenant and composed from public capabilities exposed by that tenant's installed/enabled plugins.
- **Tenant dashboard:** selected independently by each tenant. Each dashboard template owns a fixed palette and supports light/dark appearance modes.

See [Template and Website Business Model](../../../../docs/template-business-model.md) for ownership, target preferences, plugin composition, migration and acceptance criteria.

## Current runtime foundations

The current registry still uses the legacy targets `public` and `dashboard`:
- Built-in public entries: Aurora and Editorial.
- Built-in dashboard entries: Midnight and Paper.
- Trusted compiled package entries: Studio (public) and Glass (dashboard).
- Public/dashboard slots: `header`, `hero`, `content`, `footer`, `sidebar`, `topbar` and `widgets`.

The template manager now exposes template selection and package installation only; arbitrary color-picker controls have been removed from the UI. Template-owned fixed palettes are the product direction. Dashboard light/dark mode is part of the target contract and still needs persisted implementation.

## Template manifest

A manifest declares a stable ID, semantic version, target surface, registered layout key, supported slots and descriptive metadata. The target model also requires declared appearance modes and a default mode for dashboard templates.

Plugins may contribute trusted compiled Angular components to approved slots. They do not own the global dashboard shell or corporate website content.

## Package installation

The current tenant package catalog contains:
- `studio`: public website presentation package.
- `glass`: dashboard presentation package.

Tenant administrators can use:
- `GET /templates/catalog`
- `POST /templates/install` with `{ "templateId": "studio" }`
- `DELETE /templates/install/:templateId`
- `GET /templates/installed`

Only catalog IDs are accepted. An active package cannot be uninstalled until another package is selected for that surface. Installed package IDs are stored in the tenant's MongoDB `template_preferences` document and tenant-scoped updates are broadcast through the private template event channel.

The current installer is a trusted compiled-package foundation. It does not download or execute arbitrary JavaScript, HTML or Angular bundles. A package's registration metadata/styles do not by themselves provide a dynamically downloadable structural Angular layout.

## Plugin contributions and tenant websites

The slot registry supports trusted compiled Angular components. The long-term tenant website renderer must compose only explicitly public contributions from plugins installed and enabled for the resolved tenant. Private dashboard routes, data, settings and components must never be rendered publicly.

The current public tenant landing page resolves the hostname to a tenant and displays safe tenant identity details. Full plugin-driven public-site composition, public capability manifests and the separate platform-corporate template scope are still pending.

## Fixed palettes and legacy color tokens

The product no longer offers arbitrary color selection in the template manager. Template packages own their visual identity. Dashboard users choose only a supported appearance mode (light/dark) once that mode is implemented for each template.

The client engine no longer applies legacy custom color tokens and no longer sends theme-token save requests. Legacy `tokens` and `customized` fields in older public-preference responses or template SSE events are ignored; selection, installation and event handling remain unchanged. The server payload contract is not changed by this client migration. Do not reintroduce color pickers or tenant-defined hex palettes.

## Scope and safety

- Template selection and installed packages are scoped to the correct platform or tenant owner.
- Platform corporate settings must be separate from tenant preferences.
- Tenant template events must remain tenant-scoped and revalidate active membership.
- Platform website selection is superadmin-only.
- Templates are distinct from business plugins, plans and plugin entitlements.
- Only trusted, reviewed, versioned Angular code may execute. No arbitrary remote JavaScript, HTML or Angular bundles.


## Design system standards

Dashboard page and shared UI development must follow the [Global Bee-Core Design System](../../../../../docs/design-system/bee-core-design-system.md) and the [Midnight Template Style Guide](./packages/midnight/STYLE-GUIDE.md) when Midnight is the active dashboard template. These are normative guides; see the [design system index](../../../../../docs/design-system/README.md).
