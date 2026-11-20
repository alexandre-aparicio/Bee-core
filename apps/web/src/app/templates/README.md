# Bee-Core Template Engine

The Angular runtime owns a typed template registry for two independent surfaces:
- `public`: public website layouts and visual themes.
- `dashboard`: authenticated workspace layouts and visual themes.

## Manifest contract

A template manifest declares a stable id, semantic version, target surface, registered layout key and supported slots. Plugins can contribute content to agreed slots; they do not own the global shell.

## Runtime contract

`BeeTemplateEngine` registers manifests, validates target compatibility, activates one template per surface, persists a local fallback and synchronizes authenticated users' public/dashboard selections to MongoDB through `/templates/preferences`, then applies stable body data attributes. The manager UI changes either surface independently without touching authentication, routes, plugin state or business data.

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

The current milestone supplies the runtime resolver, four compiled visual shells and the typed slot registration/rendering contract. A package installer, signed template bundles, compatibility checks, preview/rollback UI and workspace/tenant-scoped selection (the current persistence scope is per user) remain subsequent work.
