# Bee Core plugin package and distribution architecture

## Status

This document defines the target contract and implemented foundation slices. A database-backed global package registry now separates platform package state from tenant installation rows for the built-in packages. ZIP upload/extraction, dynamic backend loading and Angular remote-module loading are still not implemented.

## Three independent state dimensions

Bee Core must not overload the word "installed". The platform package and each tenant have separate state:

1. **Platform package** — a package version has been uploaded, validated, stored and registered by Super Organization. This makes its code available to the Bee Core runtime.
2. **Tenant entitlement** — a tenant receives access through its subscription plan, an explicit Super Organization grant, or a purchase.
3. **Tenant activation** — the tenant may use the plugin only after its tenant installation/migrations have completed and it is enabled.

A plan change must never uninstall platform code. A tenant deactivation or entitlement removal must never delete tenant data.

## Activation policy

Every tenant plugin declares an activation policy:

- `automatic`: when the package is globally installed and the tenant is entitled, Bee Core may provision/enable it automatically, subject to dependency and migration success.
- `manual`: entitlement only makes the plugin available; an authorized administrator must activate it for that tenant.

The policy is a default, not an authorization bypass. Backend routes continue to enforce tenant permission, entitlement, tenant installation and enabled state.

Current built-in defaults:
- Documents: automatic.
- Time Tracking: automatic.
- Connected Devices: manual, because device pairing and capability grants are operational choices for each company.

## Common plugin contract

Every plugin has a stable identifier, semantic version, declared runtime dependencies, scope, activation policy, backend lifecycle entrypoint, frontend route registrations, tenant collections and versioned migrations.

The three business modules are tenant-scoped. They own their domain data and APIs and must not read or write another plugin's collections. Cross-plugin integrations use declared dependencies and public service/API contracts only.

Canonical internal layers:

`manifest → plugin lifecycle → routes/controller → handlers → service → repository → tenant-scoped persistence`

The exact number of files can vary when a module is small, but authorization and tenant scoping belong in the service/repository boundary, not duplicated ad hoc across route handlers.

## ZIP installation target

A future Super Organization package installer must:

1. Accept a bounded ZIP upload and validate the archive before extraction.
2. Reject path traversal, symlinks, duplicate paths, ZIP bombs, unsupported files and invalid manifests.
3. Verify the package digest and publisher signature against a trusted key.
4. Validate runtime compatibility, dependency versions, declared permissions, collections, frontend routes and migration checksums.
5. Stage extraction in a temporary directory, atomically move the validated version into the configured plugin directory and register the platform package/version in MongoDB.
6. Run platform migrations and mark the package installed only after success.
7. Schedule a controlled runtime restart/reload. Fastify route registration is completed during startup; installing executable backend code cannot safely pretend to hot-mount new routes into an already-ready server.
8. Keep the previous version available for rollback until the new version passes startup health checks.

Uninstalling a platform package must be blocked while tenant installations or dependent packages still reference it, unless an explicit, audited migration/decommission flow has been completed.

## Frontend loading

The current Angular application is statically compiled. Extracting frontend files from a ZIP does not make Angular components available at runtime. The package format therefore needs a versioned frontend contract (initially a constrained web-component/custom-element bundle or a separately compiled remote entry), an explicit route registry, CSP-compatible asset loading and a trusted-origin policy. Do not dynamically execute arbitrary uploaded JavaScript in the dashboard.

## Migration of the three built-in modules

- **Documents** retains Files as an explicit infrastructure dependency and keeps its storage adapter.
- **Connected Devices** remains independent of Documents, Time Tracking and business modules. Its device pairing and lifecycle stay in its own repository/service boundary.
- **Time Tracking** remains independent of Connected Devices. Browser/mobile clocking must work without a registered device; optional device-aware workflows can integrate through a public contract later.
- Existing tenant data and collection names must be preserved. Migration work must be additive and reversible where possible.

## Implementation sequence

1. Establish and validate the common manifest metadata and activation policy. (Implemented in the foundation PR.)
2. Introduce separate platform package registry/install state and tenant entitlement grants. (Global registry and legacy-state bridge implemented; plan/manual entitlement grants remain pending.)
3. Implement secure ZIP upload, verification, staged extraction, migrations and controlled runtime restart. (Pending.)
4. Add Super Organization package-management UI and audit trail.
5. Implement plan-driven automatic grants/activation and explicit manual grants, with dependency resolution.
6. Migrate the three built-in plugins to the same lifecycle and persistence conventions without changing their APIs or deleting tenant data.
7. Implement the trusted frontend bundle/route contract.
8. Add integration tests for install, upgrade, rollback, plan changes, tenant isolation, disable/re-enable and dependency removal.

No stage is complete until the relevant backend tests, Angular build, browser checks and migration/rollback tests have run.


## Global package registry — implementation slice

The backend now maintains `platform_plugin_packages` as the platform-level source of truth, separate from `tenant_plugin_installations`:

- Built-in package metadata is seeded idempotently as `available` without pretending that every package is installed.
- Existing Super Organization installation rows are migrated into the registry at platform-admin startup, preserving compatibility with the current Settings → Plugins installation flow.
- Super Organization marketplace install/uninstall jobs synchronize the global package state. ZIP-sourced records are protected from bundled-package synchronization.
- Superadmin endpoints expose the global package registry at `GET /platform/plugin-packages`; company plugin state reads global installation from this registry and tenant enabled state from tenant installation rows.
- This is a database/state normalization step. It does not yet accept ZIP uploads or dynamically load external backend/frontend code.
