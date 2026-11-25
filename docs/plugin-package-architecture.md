# Bee Core plugin package and distribution architecture

## Status

This document describes the signed package pipeline and the staged frontend migration. Superadmin can upload a signed ZIP, the server validates and extracts it into persistent storage, registers it globally, and loads its backend plugin on restart. The sandboxed iframe frontend path is used by Hola Mundo and Documents. Connected Devices and Time Tracking are still on their Angular migration path.

## Three independent state dimensions

Bee Core must not overload the word "installed". The platform package and each tenant have separate state:

1. **Platform package** — a package version has been uploaded, signature-verified, stored and registered by Super Organization. Its backend becomes available after the next Bee Core restart and startup verification.
2. **Tenant entitlement** — a tenant receives access through its subscription plan, an explicit Super Organization grant, or a purchase.
3. **Tenant activation** — the tenant may use the plugin only after its tenant installation/migrations have completed and it is enabled.

A plan change must never uninstall platform code. A tenant deactivation or entitlement removal must never delete tenant data.

## Activation policy

Every tenant plugin declares an activation policy:

- `automatic`: when the package is globally installed and the tenant is entitled, Bee Core may provision/enable it automatically, subject to dependency and migration success.
- `manual`: entitlement only makes the plugin available; an authorized administrator must activate it for that tenant.

The policy is a default, not an authorization bypass. Backend routes continue to enforce tenant permission, entitlement, tenant installation and enabled state.

Current built-in defaults:
- Documents: manual.
- Time Tracking: automatic.
- Connected Devices: manual, because device pairing and capability grants are operational choices for each company.

## Common plugin contract

Every plugin has a stable identifier, semantic version, declared runtime dependencies, scope, activation policy, backend lifecycle entrypoint, frontend route registrations, tenant collections and versioned migrations.

The three business modules are tenant-scoped. They own their domain data and APIs and must not read or write another plugin's collections. Cross-plugin integrations use declared dependencies and public service/API contracts only.

Canonical internal layers:

`manifest → plugin lifecycle → routes/controller → handlers → service → repository → tenant-scoped persistence`

The exact number of files can vary when a module is small, but authorization and tenant scoping belong in the service/repository boundary, not duplicated ad hoc across route handlers.

## Signed ZIP installation — implemented backend pipeline

The Superadmin Platform Admin page now provides Upload plugin ZIP. The endpoint is POST /platform/plugin-packages and accepts a JSON body with archiveBase64. The upload limit is 50 MiB. The server:

1. Parses ZIP central-directory records and accepts only stored/deflate entries; rejects ZIP64, multi-disk and encrypted archives.
2. Rejects traversal, absolute paths, backslashes, NULs, duplicate/case-colliding paths, symlinks, special files, CRC/size mismatches, excessive entry counts, oversized files, total expansion and compression ratios.
3. Requires a configured publisher public key, validates the SHA-256 package digest and verifies the publisher signature.
4. Validates manifest schema, runtime compatibility, dependency presence/version ranges, backend entrypoint and declared tenant migration metadata.
5. Extracts into a private staging directory and atomically promotes the package into a versioned directory under the persistent plugin volume. A per-version lock prevents concurrent duplicate installs.
6. Writes platform package and package-version records, with runtime state stored_pending_runtime.
7. On the next startup, re-reads every stored file, rejects symlinks/special files, recomputes the digest and signature, imports the .mjs backend entrypoint, validates its BeePlugin manifest/dependencies/migration hooks and registers it before Fastify becomes ready.
8. Records runtime state as loaded or failed. Previous package versions are retained on disk; automatic fallback to a previous version is not yet implemented.

Uninstalling a platform package must be blocked while tenant installations or dependent packages still reference it, unless an explicit, audited migration/decommission flow has been completed.

## Current package format and frontend limitation

The installer accepts a package-owned frontend entrypoint and an explicit asset allowlist. The runtime serves only declared files and applies a restrictive Content-Security-Policy. The dashboard mounts the page in an iframe with scripts enabled but without same-origin access. The host retains the bearer token; the iframe can request backend calls only through a parent-window message bridge, and only for API prefixes declared in the signed manifest. The token is never sent into the iframe. Hola Mundo and Documents use this package-owned frontend path. The bridge is not a general-purpose sandbox for arbitrary backend code: signed backend plugins remain trusted code running inside the Bee Core process.

## Migration of the three built-in modules

- **Documents** is distributed as a signed ZIP. It owns file metadata and binary storage and has no Files dependency.
- **Connected Devices** remains independent of Documents, Time Tracking and business modules. Its device pairing and lifecycle stay in its own repository/service boundary.
- **Time Tracking** remains independent of Connected Devices. Browser/mobile clocking must work without a registered device; optional device-aware workflows can integrate through a public contract later.
- Existing tenant data and collection names must be preserved. Migration work must be additive and reversible where possible.

## Implementation sequence

1. Establish and validate the common manifest metadata and activation policy. (Implemented in the foundation PR.)
2. Introduce separate platform package registry/install state and tenant entitlement grants. (Implemented.)
3. Implement secure signed ZIP upload, staged extraction, persistent package versions and startup backend loading. (Backend-only pipeline implemented; automatic rollback pending.)
4. Add Super Organization package-management UI and audit trail. (Upload, package list, plan assignment and manual tenant grants implemented.)
5. Implement plan-driven automatic provisioning and explicit manual grants, with dependency resolution. (Backend provisioning queue implemented.)
6. Migrate the three built-in plugins to the same lifecycle and persistence conventions without changing their APIs or deleting tenant data.
7. Implement the sandboxed frontend bundle/route contract. (Hola Mundo and Documents are packaged and loaded remotely; Connected Devices and Time Tracking still use statically compiled Angular components.)
8. Add integration tests for install, upgrade, rollback, plan changes, tenant isolation, disable/re-enable and dependency removal.

No stage is complete until the relevant backend tests, Angular build, browser checks and migration/rollback tests have run.


## Global package registry

The backend maintains `platform_plugin_packages` as the platform-level source of truth, separate from `tenant_plugin_installations`. Built-in package metadata is seeded idempotently, legacy Super Organization installations are migrated, and Marketplace global install operations synchronize the registry.

ZIP package versions are recorded in `platform_plugin_package_versions`. The extracted package files are stored under the persistent plugin volume, while runtime readiness is tracked independently as `stored_pending_runtime`, `loaded` or `failed`. Tenant plan assignments live in `plugin_plan_package_assignments`; manual tenant grants live in `tenant_plugin_entitlements`. Neither grants nor plan changes copy package files into tenants.


## Current limitations

- Hola Mundo and Documents use the package-owned sandboxed frontend. Connected Devices and Time Tracking still have static Angular frontend registrations.
- The package backend is trusted executable code inside the Bee Core process. Signature verification establishes publisher trust; it is not a sandbox.
- Manifest permission declarations are currently validated and stored as package metadata; they are not automatically added to the tenant role catalog. External route handlers must enforce tenant context, entitlement, installation/enabled state and permissions using the existing Core guards.
- The public key setting currently supports one configured publisher key, not a multi-publisher trust store or key rotation UI.
- Package upgrades retain prior version directories, but startup does not automatically fall back if the new version fails to load.
- Global ZIP install is separate from tenant grants/activation. Tenant migration hooks run through the existing Marketplace lifecycle worker.
