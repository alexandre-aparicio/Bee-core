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

- Added `frontend.remoteEntry` to the signed package manifest contract, with validation that it is a safe `frontend/` path and is included in the asset allowlist. A package cannot declare both an iframe entrypoint and a native remote entry.
- The marketplace runtime endpoint now returns `transport: native-federation` and `remoteEntry` for packages using the new contract, while preserving the legacy iframe response for existing packages.
- The signed package asset endpoint permits the declared remote entry in addition to the explicit asset allowlist.
- The Connected Devices package builder now expects a separately built Native Federation output directory (`BEE_CONNECTED_DEVICES_FEDERATION_DIST`, default `artifacts/connected-devices-federation`) and includes all files under `frontend/` in the signed ZIP. It fails closed if `remoteEntry.json` is missing.
- Connected Devices package metadata is bumped to `0.2.0` for this new frontend contract.
- **Not implemented yet:** the Angular 19 federation host bootstrap/configuration, the separately compiled remote project, the typed remote component contract, removal of the static Connected Devices registration, and the native mount/uninstall lifecycle. Do not deploy or pull this branch yet.

## Build-system decision still required

The current Angular application builder does not provide a configured remote Angular plugin artifact. A production implementation must choose and test one supported compilation/loading strategy (for example, Native Federation with shared Angular singletons, or a separately compiled Angular plugin library plus an explicit host runtime contract). A plain dynamic import is not sufficient evidence of Angular compatibility, dependency sharing, or unload behavior.

## Security boundary

A native Angular plugin runs in the same JavaScript realm and origin as Bee Core. It is **not isolated** like the current sandboxed iframe: once trusted plugin code is loaded, it can access browser capabilities available to same-origin code. Package signatures establish publisher integrity, not runtime sandboxing. Only trusted, reviewed publishers should be allowed; server-side tenant authorization and plugin API permissions remain mandatory.

## Scope of this spike

- Created on branch `refactor/native-angular-plugin-runtime`.
- Backend package/runtime contract and package builder were changed on this branch. Existing frontend behavior, Documents, Files, and `main` were not changed.
- No build or test is claimed as passing; the GitHub-connected inspection did not execute the repository toolchain.
- Next implementation step: add the Angular 19 federation host bootstrap and remote build target, then migrate Connected Devices out of the core bundle. No tests/builds are being run during this implementation phase; validation is deferred to the VPS as requested.
