# Package decoupling: four installable modules

## Scope

The public third-party SDK is explicitly deferred. This work is limited to four installable packages already represented in Bee-Core's plugin catalog:

1. **Connected Devices** — real module.
2. **Control Horario** — real module.
3. **Documents** — tenant-facing module.
4. **Hola Mundo** — deliberately simple example package used to prove that the runtime can install and load a module without a hard-coded integration.

**Private Files is platform infrastructure and is not part of this four-package migration. Team Notes is also outside the current scope.** The remaining Core capabilities (authentication, organizations, teams, files infrastructure, marketplace, platform administration, notifications, mail, localization and shared runtime services) are not to be converted into tenant-installable modules as part of this task.

The acceptance model is that these four package artifacts are delivered through the same upload, verification, persistence, registration and runtime-loading pipeline. All four packages are tenant-facing and require tenant entitlement/grant, installation and enabled state before their routes, navigation entries, frontend assets or APIs can be used. Their actual manifest scopes must be preserved.

## Implementation status in this branch

The first runtime/package phase is now implemented:

- `scripts/build-plugin-packages.mjs` builds versioned, signed ZIP artifacts for Connected Devices, Control Horario, Documents and Hola Mundo. It copies each module's compiled relative-import dependency graph, so the ZIP is loadable independently of the source tree.
- `npm run build:plugin-packages` requires the publisher private key from the release environment. The manual `.github/workflows/package-release.yml` workflow publishes the four ZIPs as an artifact; the private key is never committed.
- The package contract distinguishes host runtime dependencies from `tenantDependencies`. Core services such as auth, organizations, files and marketplace are not mistakenly treated as tenant-installable modules.
- The platform upload endpoint now allows only these four known first-party IDs to transition from bundled packages to ZIP packages. It preserves existing plan visibility, grants, purchasability and the Documents system classification.
- Startup prefers an uploaded ZIP for each of the four IDs. A temporary bundled fallback remains only while that package has not yet been uploaded, to make the migration deployable without taking the existing modules offline.
- The ZIP installer accepts a declared frontend entrypoint and allowlisted assets. Hola Mundo is the first package frontend: its Angular component has been removed and the package is rendered in a sandboxed iframe. The host keeps the bearer token and only proxies API requests allowed by the package manifest.
- Documents, Connected Devices and Control Horario still use their existing statically compiled Angular frontends. Their frontend migration and removal of the temporary backend fallback are not yet complete.

### Verification so far

- Backend TypeScript build: passed.
- Angular production build: passed.
- New package test: passed; it generates temporary Ed25519 keys, builds all four ZIPs, installs them through the real ZIP verifier, imports every backend entrypoint, and checks the Hola Mundo frontend assets.
- Full backend suite: 117 tests, 109 passed, 8 failed, 0 skipped. The eight failures are in existing auth, Private Files isolation, marketplace entitlement, user quota, platform MFA, custom-role policy, stream-ticket memory-bound and tenant-context tests. The new package/frontend tests passed.

This is not yet the end-to-end acceptance point. The remaining work is to migrate the three complex Angular frontends, remove the temporary bundled backend fallback after the signed ZIPs have been uploaded and verified, and add integration tests that exercise upload through tenant grant/install/authorization and frontend/API access across two tenants.

## Required runtime model

1. **Package upload is the delivery path for the four packages.** Build each package as a versioned ZIP and submit it through the same upload/verification/storage/registration pipeline used by an uploaded package. No special static seed may silently make the module code available.
2. **Platform installation and tenant authorization are separate.** A package may be present in the platform catalog/runtime without being available to every tenant. Each of the four packages requires explicit entitlement/grant and tenant installation.
3. **All four packages load through the package runtime.** The application bootstrap must not import or register their entrypoints directly. Dependencies and load order come from verified manifests.
4. **Frontend is package-owned.** Package frontend artifacts and route/navigation metadata are resolved by the runtime. Angular must not statically import these package components. Uploaded frontend code must run behind a controlled boundary and must not gain unrestricted access to dashboard-origin/session state.
5. **Core remains the host.** Authentication/session primitives, tenant context, permission evaluation, event bus, shared database/storage access, package verification and lifecycle orchestration remain in Core. Module-specific routes, services, repositories, migrations, permissions, translations, navigation and UI belong to the package.
6. **Dependencies are explicit.** Package dependencies are declared and versioned. Optional integrations must not become hard imports.
7. **No authorization bypass.** Platform package availability does not imply tenant entitlement. Tenant entitlement does not imply installation. Installation does not bypass user permissions. Backend APIs, navigation and frontend exposure must enforce the complete applicable state.
8. **Data safety.** Existing tenant collections, identifiers and records remain intact. Revocation/uninstall disables access without deleting tenant data unless a separately audited destructive operation is explicitly requested.

## Package simulation and acceptance tests

The automated tests must simulate the existing modules as uploaded packages rather than marking statically bundled modules as installed:

1. Build ZIP fixtures for Connected Devices, Control Horario, Documents and Hola Mundo.
2. Generate a test publisher keypair and sign each fixture.
3. Submit each fixture through the same upload handler used by the platform administrator.
4. Verify manifest, digest, signature, compatibility, dependencies and safe paths; assert that the package is persisted.
5. Start a fresh runtime from persisted package artifacts and assert that all four are loaded without static entrypoint imports.
6. For tenant-scoped packages, grant access to a test tenant, install/run migrations and verify tenant navigation, frontend and API access.
7. Verify that a second tenant without a grant cannot discover, load or invoke tenant-scoped packages.
8. Verify Documents is tenant-isolated and does not gain a special static loading path.
9. Verify Hola Mundo can be uploaded, installed, enabled, rendered and called using the same generic lifecycle, with no module-specific Core code.
10. Verify restart/reload preserves package registration, tenant grants and tenant data.
11. Exercise package frontend loading and backend authorization together; verify user permissions remain enforced after loading.

## Regression coverage

- No static plugin entrypoint imports/registrations for these four packages in the backend bootstrap.
- No static Angular component imports/registrations for these four packages in the frontend registry or dashboard root.
- Each package is represented by a verified ZIP artifact.
- ZIP upload rejects tampering, invalid signatures, unsafe paths, missing dependencies and incompatible versions.
- Runtime startup loads packages in dependency order and isolates package failures.
- Tenant entitlement, installation, enablement, disablement and revocation are independent and tenant-scoped.
- A tenant cannot discover or invoke a tenant package it is not entitled to use.
- Tenant authorization and isolation are enforced for all four packages.
- Existing APIs, data and cross-tenant isolation remain compatible.
- Backend tests, Angular production build and package lifecycle integration tests pass.

## Explicitly out of scope

- Public SDK or third-party developer experience.
- Private Files and other Core/platform infrastructure.
- Team Notes.
- Converting all Core capabilities or all catalog entries into installable packages.
- Arbitrary untrusted code execution or an unrestricted plugin sandbox.
- Rewriting business behavior unrelated to removing static coupling.
- Merging this work into `main` without explicit user authorization.

## Completion rule

The migration is not complete merely because ZIP upload succeeds. It is complete only when the four packages are loaded from persisted package artifacts, their declared scopes and tenant authorization are enforced, frontend assets are resolved from package artifacts, and automated upload-to-runtime-to-authorized-use tests pass.
