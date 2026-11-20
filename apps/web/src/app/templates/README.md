# Bee-Core Template Engine

The Angular runtime owns a typed template registry for two independent surfaces:
- `public`: public website layouts and visual themes.
- `dashboard`: authenticated workspace layouts and visual themes.

## Manifest contract

A template manifest declares a stable id, semantic version, target surface, registered layout key and supported slots. Plugins can contribute content to agreed slots; they do not own the global shell.

## Runtime contract

`BeeTemplateEngine` registers manifests, validates target compatibility, activates one template per surface, persists selections in local storage and applies stable body data attributes. The manager UI changes either surface independently without touching authentication, routes, plugin state or business data.

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
