# Building a Bee-Core business plugin

This guide describes the target first-party plugin architecture: a tenant-scoped backend package delivered as a signed ZIP and, when the plugin has an Angular UI, a Native Federation remote bundled in that same versioned package.

## 1. Keep the plugin boundary independent

Place backend code and its `plugin.manifest.ts` under `src/plugins/<plugin-id>/`. The plugin owns its domain routes, services, repositories, migrations, permissions and lifecycle hooks. Core owns authentication, tenant resolution, shared infrastructure, package verification, entitlements and the generic runtime.

Declare dependencies explicitly. Do not import another business plugin's internal collections or frontend components. Optional integrations must remain optional.

## 2. Enforce tenant and user authorization

For every protected API:
1. Verify the session/access token.
2. Resolve the active tenant from the authenticated session and persisted membership; never trust a tenant ID supplied by the browser.
3. Check the plugin's entitlement/grant, installation and enabled/activation state.
4. Check the user's specific permission for the operation.
5. Scope every business query and mutation to the resolved tenant.

The menu and frontend outlet are presentation controls only. Backend authorization is mandatory even when the plugin is not visible in navigation.

## 3. Scope business data

Use the repository's tenant-scoped collection/service abstractions for company-owned records. Do not expose a raw collection path that bypasses tenant filtering. Preserve existing collection names, identifiers and records during package or frontend migrations.

Add cross-tenant tests for list, detail, create, update and delete. Two tenants using the same business key must never see or modify each other's records.

## 4. Declare the package manifest

The plugin-owned manifest declares at least:
- stable plugin ID and semantic version;
- description, category and dependencies;
- backend entrypoint and required host services;
- permission definitions and tenant data/migration declarations;
- activation policy and tenant-facing scope;
- frontend transport and route/navigation metadata when a UI exists.

The package builder consumes the manifest; do not maintain a second handwritten copy of permissions or routes in Core. Keep migration IDs/checksums immutable once released. Any compensating migration must be explicit and tested.

For device capabilities, set the optional manifest field `deviceConnector: true` only when the package is an actual Connected Devices connector and its declared permissions are intended to be requested/granted by paired devices. The field is included in the signed `bee-plugin.json` manifest and propagated to the platform package registry and tenant plugin catalog. Missing or false means the package is not a device connector; category, plugin ID and permission names must never be used as substitutes for this marker. Do not mark ordinary business plugins (including their user/role permissions) as connectors.

## 5. Build an Angular remote

For a first-party plugin with an Angular interface:

1. Create a separate Angular remote project under `plugins/<plugin-id>/frontend`.
2. Reuse Angular dependencies from `apps/web/node_modules`; do not create a second Angular installation in the plugin.
3. Configure Native Federation with a stable remote name and expose `./Component` from a small `src/plugin.component.ts` entrypoint.
4. Share Angular and required framework packages as strict singletons with versions resolved from the host workspace.
5. Keep component, template, styles, translations and plugin-owned assets inside the remote project.
6. Build the remote before packaging. The generated distribution must include `remoteEntry.json`, all referenced chunks and assets.
7. Add the remote output to the same signed ZIP as the backend entrypoint and `bee-plugin.json`.

The build and ZIP generation must work from a clean checkout with one documented command. Do not rely on `NODE_PATH`, manually copying `node_modules`, or untracked VPS changes.

## 6. Runtime loading and navigation

Do not statically import a migrated plugin component into the Core Angular registry or dashboard root. The host's generic outlet receives the authorized runtime descriptor, validates the remote entry and loads the exposed component through Native Federation.

Navigation metadata is read from the verified manifest and exposed only when the tenant has the required entitlement/grant, installation and enabled state. The generic outlet must not contain plugin-specific component branches.

The remote runs in the host document and JavaScript realm. Native Federation is not an isolation sandbox: only reviewed, signed, trusted first-party code belongs in this transport. Legacy sandboxed iframe packages remain a separate compatibility model for isolated HTML/JavaScript payloads.

## 7. Package publication and tenant lifecycle

The publisher signs versioned ZIPs with the release private key. The private key must come from the release environment and must never be committed or included in a package. The platform verifies signature, digest, manifest, compatibility, dependencies and safe paths before persisting/registering the package.

Platform upload is distinct from tenant entitlement and installation. Preserve each plugin's declared activation policy. A package must not become available to all tenants merely because it exists in the platform catalog.

## 8. Required tests

- backend typecheck, build and package-entrypoint import;
- signature, digest, manifest, dependency and unsafe-path rejection;
- tenant isolation and user permission tests;
- entitlement, install, enable, disable, revoke and uninstall behavior;
- package upgrade/migration idempotency and data preservation;
- clean Native Federation remote build with singleton Angular dependencies;
- ZIP contents and remote-entry metadata validation;
- browser loading, navigation, tenant switching and critical module workflows;
- production host build and full package lifecycle integration.

## Current reference and migration status

Connected Devices is the Native Federation reference implementation in the `refactor/native-angular-plugin-runtime` branch. Documents and Control Horario are planned migrations: their current statically registered Angular frontends must be moved into their own remotes without changing backend contracts or tenant data.

Hola Mundo remains a deliberately small sandboxed iframe example; it demonstrates the legacy isolated HTML transport, not the first-party Angular remote pattern.

Do not describe a plugin as migrated until its signed package, runtime loading, authorization, navigation and browser acceptance tests all pass.
