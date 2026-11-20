# Bee-Core Template Engine

The Angular runtime owns a typed template registry for two independent surfaces:
- `public`: public website layouts and visual themes.
- `dashboard`: authenticated workspace layouts and visual themes.

## Manifest contract

A template manifest declares a stable id, semantic version, target surface, registered layout key and supported slots. Plugins can contribute content to agreed slots; they do not own the global shell.

## Runtime contract

`BeeTemplateEngine` registers manifests, validates target compatibility, activates one template per surface, persists a tenant-scoped local fallback and synchronizes the tenant's public/dashboard selections to MongoDB through `/templates/preferences`, then applies stable body data attributes. The manager UI changes either surface independently without touching authentication, routes, plugin state or business data.

The first release ships Aurora + Editorial public themes and Midnight + Paper dashboard themes. The registry is the controlled extension point for later packaged Angular layouts. A manifest does not execute arbitrary remote JavaScript: external templates must be supplied as trusted, versioned Angular code and registered through the application build/plugin loader.

## Extension example

```ts
engine.register({
  id: 'customer-workspace',
  name: 'Customer Workspace',
  version: '1.0.0',
  target: 'dashboard',
  description: 'Customer-specific workspace shell.',
  builtIn: false,
  layout: 'dashboard.customer-workspace',
  slots: ['sidebar', 'topbar', 'content', 'widgets']
});
engine.activate('dashboard', 'customer-workspace');
```

The layout key is a contract for the Angular layout resolver; registration alone intentionally does not evaluate remote code.


## Angular layout resolver and plugin slots

The root Angular view resolves the selected manifest's compiled layout key to a layout class and a stable `data-bee-layout` attribute. The current trusted layout keys are:
- `public.aurora` and `public.editorial`
- `dashboard.midnight` and `dashboard.paper`

The public and dashboard wrappers are independent; changing one does not replace the other. The wrappers keep the original page content mounted, so navigation, authentication and plugin state are not lost during theme changes.

### UI plugin contributions

Frontend plugins can contribute compiled Angular components to named slots through `BeeTemplateSlotRegistry`:

```ts
const unregister = slotRegistry.register({
  pluginId: 'sales',
  slot: 'widgets',
  component: SalesSummaryWidgetComponent,
  order: 20
});

// Call when the UI plugin is deactivated:
unregister();
```

Supported slots are `header`, `hero`, `content`, `footer`, `sidebar`, `topbar` and `widgets`. Contributions are ordered by priority and plugin id, one contribution per plugin and slot. Plugins must be trusted Angular code compiled into or loaded by the application. A JSON manifest cannot execute code or download arbitrary JavaScript.

The runtime supports live visual-token editing for the active tenant. The dashboard manager can edit six allowlisted CSS variables (`--bg`, `--panel`, `--muted`, `--border`, `--purple`, `--cyan`) and save them to MongoDB. The API validates each value as a hex color; arbitrary CSS, HTML and JavaScript are not accepted. Connected clients receive updates through a short-lived, one-use SSE ticket (`/templates/stream-ticket` then `/templates/events`) and apply CSS variables without rebuilding or restarting the frontend. Tenant selection and theme tokens are stored in one MongoDB preference document keyed by a unique `tenantId`; users within the same tenant share them, while different tenants are isolated. Existing per-user preference documents are migrated to the owning user's tenant at startup (the newest preference wins if a tenant had conflicting user-level values). Tenant admins can map hostnames with `PUT /tenants/domains`; anonymous public requests resolve the host through `GET /templates/public`. Local fallback keys are also tenant-specific.

This is **hot reload for template selection and visual design tokens**, not for arbitrary Angular component code or structural HTML. The four layout shells are still compiled into the Angular app. A new structural layout requires trusted, versioned Angular code to be integrated into an application build. A template package installer, signed bundles, compatibility checks, visual preview/rollback and tenant provisioning remain future milestones. Tenant admins can assign domains with `PUT /tenants/domains`; the anonymous `GET /templates/public` endpoint resolves the request hostname to that tenant and returns its public template selection and theme tokens. The current tenant boundary uses a single `tenantId` on each user; multi-workspace membership for one user and self-service tenant creation are not implemented. SSE fan-out is in-process; a horizontally scaled API deployment will need a shared event transport or MongoDB change-stream fan-out.
