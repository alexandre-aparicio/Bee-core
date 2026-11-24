# Complete module decoupling: package-runtime migration

## Scope

The public third-party SDK is explicitly deferred. This work targets only the modules already shipped by Bee-Core.

The acceptance model is that the existing modules are treated exactly like uploaded packages: a signed ZIP is submitted through the platform upload flow, verified, persisted, registered and loaded by the runtime. Tenant-scoped modules additionally require an explicit entitlement/grant and a successful tenant installation before their routes, navigation entries or frontend can be used.

No module may depend on a special static registration path merely because it ships with Bee-Core.

## Existing module inventory

The current application bootstrap statically imports and registers:

- hello
- auth
- organizations
- teams
- files
- documents
- connected-devices
- time-tracking
- marketplace
- notes
- platform-admin
- notifications
- mail
- localization

The Angular frontend statically imports plugin components through `BeePluginFrontendRegistry`. The current ZIP installer rejects every non-empty `frontend.routes` declaration. These are the primary coupling points to remove.

## Required runtime model

1. **Package upload is the only module delivery path.** Built-in modules are packaged by the build/release process and submitted through the same ZIP verification/storage/registration pipeline as any uploaded package. No special bundled-plugin seed is allowed to silently make module code available.
2. **Platform packages and tenant installations remain separate.** Platform-scope infrastructure packages are installed once and run as platform services. Tenant-scope feature packages require an explicit plan entitlement or Super Admin grant, then a tenant install/migration job and enabled state.
3. **All plugin code is loaded from package storage.** The application bootstrap must not import or register individual plugin entrypoints. Dependency order is derived from verified manifests.
4. **Frontend is package-owned.** Each tenant-facing package carries a versioned frontend artifact and route/navigation metadata. The dashboard loads it through a controlled runtime boundary; it must not import plugin Angular components statically. Uploaded frontend code must not execute with unrestricted access to the dashboard origin/session.
5. **Core remains a host, not a module catalog.** Shared authentication/session primitives, tenant context, permission evaluation, event bus, database access, package verification, lifecycle orchestration and safe frontend hosting belong to Core. Module-specific routes, services, repositories, migrations, permissions, translations, navigation and UI belong to their package.
6. **Dependencies are explicit.** A package may use another package only through declared dependencies and stable runtime contracts. Optional integrations must not become hard imports.
7. **No tenant bypass.** A platform package being installed does not imply tenant entitlement. A tenant entitlement does not imply installation. A tenant installation does not bypass user permissions. Routes and frontend exposure must require the complete applicable state.
8. **Data safety.** Existing tenant collections, identifiers and records must remain intact through packaging and migration. Uninstall/revocation disables access without deleting tenant data unless a separately audited destructive operation is explicitly requested.

## Package simulation used by automated tests

The test suite must not seed feature modules as `source: "bundled"` and then call them installed. Instead it must:

1. Build the existing first-party modules into package fixtures.
2. Generate a test publisher keypair and sign each fixture.
3. Submit every fixture through the same upload handler used by Super Admin.
4. Assert package digest/signature/manifest/dependency validation and persistent storage.
5. Start a fresh runtime from the stored packages and assert that all expected plugins are loaded without static plugin imports.
6. Grant a selected tenant access to each tenant-scoped package, run its install job/migrations and assert the tenant can use it.
7. Assert a second tenant without a grant cannot see, load or call those modules.
8. Assert platform-scope services start once and are not exposed as tenant-installable feature modules.
9. Assert package restart/reload preserves runtime registration, tenant grants and tenant data.
10. Exercise package frontend loading, tenant navigation visibility and backend authorization together.

## Required regression coverage

- No static plugin entrypoint imports/registrations in `src/index.ts`.
- No static feature-component imports/registrations in Angular's plugin registry or dashboard root.
- Every shipped module is represented by a verified package artifact.
- ZIP upload rejects tampering, invalid signatures, unsafe paths, missing dependencies, incompatible versions and unsupported frontend artifacts.
- Runtime startup loads packages in dependency order and isolates failures.
- Tenant entitlement, install, enable, disable, update and uninstall are independent and tenant-scoped.
- A tenant cannot discover or invoke a package it is not entitled to.
- User permissions remain enforced after package loading.
- Frontend package code is isolated and cannot read arbitrary dashboard-origin state.
- Existing module APIs, data and cross-tenant isolation remain compatible.
- Backend tests, Angular production build, browser integration tests and Docker full-stack tests pass.

## Explicitly out of scope

- Public SDK or third-party developer experience.
- Arbitrary untrusted code execution or an unrestricted plugin sandbox.
- Rewriting business behavior unrelated to removing static module coupling.
- Merging this work into `main` without explicit user authorization.

## Completion rule

The migration is not complete merely because ZIP upload succeeds. It is complete only when the shipped modules are loaded from package storage, tenant authorization is enforced, frontend assets are resolved from the installed package, and the automated upload-to-tenant-use tests pass.
