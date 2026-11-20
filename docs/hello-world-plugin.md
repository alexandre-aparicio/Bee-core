# Hola Mundo tenant plugin

The first tenant-facing reference plugin is registered as `hello-world` and displayed as **Hola Mundo**.

- The trusted package is available in Starter, Pro and Enterprise plans.
- Tenant owners/admins can activate or deactivate it from Dashboard → Plugins. The existing durable marketplace lifecycle queue performs the install/uninstall.
- The platform superadministrator can activate/deactivate Hola Mundo independently for each company from Platform Administration.
- The public tenant API exposes only enabled plugin IDs for the tenant resolved from the request host.
- When enabled, the tenant landing navigation displays **Hola Mundo** and `/hello-world` renders the plugin page. When disabled, the menu entry and page are unavailable.
- The frontend component is statically bundled and registered in the trusted frontend registry; this does not introduce remote Angular code loading.

Activation is tenant-scoped. Enabling the plugin for Dragchart does not enable it for another tenant.

No tests, builds or GitHub workflows were run for this implementation, as explicitly requested. Source integration is not a claim of runtime validation.
