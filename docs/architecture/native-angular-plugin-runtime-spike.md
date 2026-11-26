# Native Angular plugin runtime — one-hour feasibility spike

## Result

The repository is **not currently able to load an Angular component from a signed ZIP**. Connected Devices is still statically registered by the web application and its Angular component is compiled as part of the core web build. The ZIP builder now declares a Native Federation remote entry and can package a separately built federation output directory, but that remote build target and Angular host loader are not implemented yet.

This spike deliberately does not replace the iframe path with an unverified `import(url)`. Doing so without a compatible Angular compilation and dependency-sharing contract would either fail in production or bundle a second Angular runtime.

## Evidence inspected on 2026-11-26

- `apps/web/angular.json` defines one Angular application build using `@angular/build:application`; there is no Angular library/remote-plugin build target.
- `apps/web/src/app/plugins/plugin-frontend-registrations.ts` statically imports `connectedDevicesFrontend`.
- `apps/web/src/app/connected-devices/connected-devices.frontend.ts` lazy-imports `connected-devices.component.ts`. This creates a lazy chunk, but that chunk is still emitted by the core build and is not supplied by the ZIP.
- `scripts/build-plugin-packages.mjs` defines Connected Devices with `frontend.routes: []`; only Documents currently has a frontend source copied into its ZIP.
- `plugin-outlet.component.ts` mounts host-compiled Angular components through `ViewContainerRef.createComponent`, but unregistered ZIP frontends are rendered in a sandboxed iframe.
- The current architecture test explicitly asserts both the static Connected Devices registration and the backend-only ZIP. It must be replaced as part of the migration, not weakened to make a test pass.

## Required target contract

1. Core keeps the Angular runtime, shell, design system, authentication/session owner, plugin outlet and a small stable plugin-host API.
2. Connected Devices source, template, styles, translations and compiled frontend entrypoint are built into its signed ZIP. The core must contain no import, component source, template or feature-specific route for Connected Devices.
3. The ZIP entrypoint must expose a versioned Angular plugin contract and declare its Angular peer/runtime compatibility. Angular packages must be shared with the host as a singleton; shipping a second Angular runtime is not acceptable.
4. The host verifies package signature, manifest, compatibility, tenant installation and permissions before loading the module. The plugin receives only the declared host capabilities and context.
5. The host mounts the component in its own Angular view tree (no iframe), owns route/navigation registration, and destroys the component and unregisters routes on uninstall.
6. Because JavaScript modules cannot be reliably unloaded after evaluation, uninstall must invalidate the module URL/cache and force a controlled application reload before claiming that plugin code has disappeared from the active page.

## Implementation status (2026-11-26)

- Added the Native Federation v3 Angular 19 package contract: signed manifests declare `remoteEntry`, `remoteName`, `exposedModule`, and an explicit allowlist of remote files. Manifest validation rejects unsafe asset paths, malformed remote identifiers, missing allowlist entries, and mixed iframe/native declarations.
- Added the Angular 19 Native Federation host bootstrap and a separate Connected Devices remote project. The remote has its own bootstrap, shares Angular/RxJS as strict singletons, and exposes a generic `PluginComponent` contract. The component source, separate HTML template and component-scoped CSS now live under `plugins/connected-devices/frontend`; the former core component, static registration, and device-specific card/pairing selectors were removed from the core Design System bundle.
- The QR renderer used by Connected Devices is copied into the remote source and included in the signed ZIP. The remote receives a short-lived authorized asset base URL and preloads its QR asset while the grant is fresh. Bee Core still retains its own QR script for the independent MFA screen.
- The package builder collects the remote build output and includes the files in the signed ZIP. The marketplace runtime response issues a short-lived token bound to the active tenant session. The asset endpoint revalidates the session, membership, user, entitlement, installation, enablement and loaded package; the legacy public asset route rejects native federation packages.
- The shell tracks evaluated remotes and reloads after a loaded remote is disabled, uninstalled or upgraded. This is necessary because browser ESM modules cannot be reliably unloaded from the current JavaScript realm.
- Connected Devices backend and package metadata are aligned at `0.2.0`.
- **Not ready for deployment:** `apps/web/package-lock.json` still needs regeneration for the new exact-pinned federation dependencies. No builds, tests or CI have been run, as requested. The Angular project configuration and runtime integration remain unverified until the agreed VPS validation phase.
- The existing Nginx CSP has deliberately not been weakened. The final browser validation must confirm that `es-module-shims` and lazily injected import maps work under the current `script-src 'self'` policy; do not add `unsafe-inline` as a workaround.
- Documents and Files have not been intentionally modified.


## Build-system decision

Native Federation v3 with the Angular 19 adapter line is the selected implementation path for this prototype. It is not production-approved until the dependency lock is regenerated and the host/remote ZIP is validated on the VPS. The contract is lazy remote registration from an authorized ZIP URL, strict shared Angular singletons, and Angular `ViewContainerRef` mounting. A plain dynamic import is not used as a substitute for dependency sharing.

## Security boundary

A native Angular plugin runs in the same JavaScript realm and origin as Bee Core. It is **not isolated** like the current sandboxed iframe: once trusted plugin code is loaded, it can access browser capabilities available to same-origin code. Package signatures establish publisher integrity, not runtime sandboxing. Only trusted, reviewed publishers should be allowed; server-side tenant authorization and plugin API permissions remain mandatory.

## Scope of this spike

- Created on branch `refactor/native-angular-plugin-runtime`.
- Backend package/runtime contract and package builder were changed on this branch. Existing frontend behavior, Documents, Files, and `main` were not changed.
- No build or test is claimed as passing; the GitHub-connected inspection did not execute the repository toolchain.
- Next implementation step: add the Angular 19 federation host bootstrap and remote build target, then migrate Connected Devices out of the core bundle. No tests/builds are being run during this implementation phase; validation is deferred to the VPS as requested.
