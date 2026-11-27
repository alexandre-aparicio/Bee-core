# Plugin frontend architecture decision

## Decision

Bee-Core uses **Native Federation with native Angular components** as the target frontend architecture for trusted first-party business plugins. Connected Devices is the reference implementation in this branch. Documents and Control Horario are planned migrations to the same model.

The host remains an Angular application. A plugin remote exposes an Angular component and is mounted by the generic plugin outlet into the host document. It is not an iframe and does not create a second Angular runtime.

## Runtime model

1. The host initializes Native Federation before bootstrapping the Angular application.
2. Each remote is built as an independent Angular project under its plugin directory. For example, Connected Devices lives in `plugins/connected-devices/frontend`.
3. The remote exposes a stable component contract such as `./Component` from `src/plugin.component.ts`, and publishes `remoteEntry.json` plus its chunks and assets.
4. Angular and other shared framework dependencies are resolved from the host workspace and shared as strict singletons. A remote must not install or bundle a second Angular runtime.
5. The package builder places the compiled remote output in the signed, versioned plugin ZIP. The ZIP also contains the backend package and verified manifest.
6. The generic outlet obtains an authorized runtime descriptor, validates the remote-entry response and Native Federation metadata, then loads the exposed component into a `ViewContainerRef`.
7. Plugin routes and navigation metadata come from the verified package manifest and are projected only into the active tenant's authorized navigation catalogue.

The remote build must be reproducible with the repository's package-build command. It must resolve workspace dependencies without `NODE_PATH`, manual copying of Angular packages, or undocumented VPS-only fixes.

## Trust and security boundary

Native Federation is **not a sandbox**. The remote component executes JavaScript in the host page's JavaScript realm and shares the host DOM. It is intended for trusted, reviewed, signed first-party packages, not arbitrary third-party uploads.

Therefore:
- Only packages that pass manifest, digest, signature, compatibility and safe-path verification may become executable remotes.
- The backend issues a narrowly scoped, short-lived asset authorization token only after validating the user, active membership, tenant entitlement, tenant installation, plugin enabled/activation state and asset allowlist.
- Asset responses use private/no-store caching and do not expose package storage paths.
- The remote receives only the runtime inputs/services required by its contract. Any access token passed to a trusted remote is still sensitive; do not log it, persist it, send it to unrelated origins or treat frontend checks as authorization.
- Every API request independently validates authentication, tenant context, membership, plugin availability and the user's permissions. Hiding a route or menu is not an authorization control.
- CSP, origin restrictions, dependency version compatibility and package review remain part of the trust model.

A future third-party or untrusted HTML/JavaScript package must use a separately designed sandbox boundary. It must not be promoted to Native Federation merely because it can be packaged as a ZIP.

## Legacy iframe compatibility

The runtime retains a legacy sandboxed-iframe transport for existing packages whose frontend contract is static HTML/JavaScript, such as the Hola Mundo demonstration. The frame uses `sandbox="allow-scripts"`, without `allow-same-origin`; host credentials remain outside the frame and API calls are mediated by a validated host bridge.

This is a compatibility path, not the target architecture for Connected Devices, Documents or Control Horario. Do not mix iframe assumptions (isolated origin, postMessage bridge) with Native Federation assumptions (same document and JavaScript realm).

## Module migration plan

| Plugin | Backend delivery | Frontend status / target |
|---|---|---|
| Connected Devices | Signed ZIP | Native Federation remote; reference implementation in this branch |
| Documents | Signed ZIP migration in progress; legacy backend fallback still to retire | Migrate the current statically registered Angular UI to a Native Federation remote |
| Control Horario | Signed ZIP backend | Migrate the current statically registered Angular UI to a Native Federation remote |
| Hola Mundo | Signed ZIP | Keep the small sandboxed iframe example as a legacy/isolated HTML package demonstration |

Documents and Control Horario must preserve their existing APIs, permissions, tenant data, routes and business behavior during frontend migration. Their Angular components must leave the Core static bundle only when their remote packages are built, installed and loaded through the generic runtime. Do not mark either migration complete based on documentation or a successful backend ZIP build alone.

## Package and activation lifecycle

Platform upload verifies and registers a package; it does not automatically grant it to every tenant. Tenant access requires the applicable entitlement/grant, tenant installation, enabled state and user permission. The runtime descriptor and navigation are returned only for the authorized tenant/user context.

Activation policy remains manifest-driven. Connected Devices uses manual activation. Do not assume that Documents or Control Horario must inherit that policy; preserve each package's approved policy and existing tenant behavior.

## Shared contract and ownership

The host owns authentication bootstrap, tenant context, navigation shell, shared design system, internationalization infrastructure, Native Federation loader, package lifecycle and generic outlet. A plugin owns its backend routes, domain logic, repositories, migrations, permissions, translations, Angular component, styles, remote build configuration and manifest declarations.

The generic runtime must not contain plugin-ID-specific component imports or conditional rendering. Plugin-specific behavior belongs in the plugin package.

## Package manifest ownership

Permissions are owned by each plugin folder in `src/plugins/<plugin-id>/plugin.manifest.ts`. The platform manifest registry composes these definitions for trusted platform consumers. The package builder discovers and includes the plugin-owned permission definitions in signed package metadata. Do not duplicate module permission arrays in the builder or central registry. The generic Core permission catalogue remains reserved for Core-owned capabilities.

## Acceptance criteria

- The remote builds reproducibly from a clean checkout using workspace Angular dependencies as strict singletons.
- The signed ZIP contains the expected remote entry, chunks, assets, backend and manifest; no Angular runtime is duplicated.
- The generic outlet validates remote metadata and mounts the Angular component in the host document.
- Navigation, asset access and APIs fail closed when entitlement, installation, activation, membership or permission is absent.
- Revocation/uninstall prevents further authorized loading without deleting tenant data.
- Browser tests cover loading, navigation, errors, tenant isolation and module-specific critical workflows.
- Documents and Control Horario pass the same package-to-runtime acceptance tests after migration.
