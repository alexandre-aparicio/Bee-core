# ADR: Native Angular plugin loading for Bee Core

- Status: **Accepted for prototype; not production-approved**
- Date: 2026-11-26
- Scope: Angular web host and signed ZIP frontend packages
- Explicit constraint: no iframe; plugin components must mount in the host Angular view tree.

## Context

Bee Core's web application is Angular 19.2.15 and uses the Angular application builder. Connected Devices is currently statically imported by `plugin-frontend-registrations.ts`; its lazy import only creates a lazy chunk inside the core web build. The Connected Devices signed ZIP currently contains backend code only.

The host already mounts locally compiled Angular components using `ViewContainerRef.createComponent`. The current ZIP frontend fallback creates a sandboxed iframe, which is not acceptable for the requested native Angular plugin architecture.

## Decision

Prototype **Native Federation with the Angular 19 adapter line** as the remote-module transport and shared-dependency mechanism.

The runtime flow is:

1. Initialise federation before Angular bootstrap so the import map exists before Angular packages are evaluated.
2. Keep Angular 19.2.15, the application shell, router, design system, authentication and the plugin host in Bee Core.
3. Build each native Angular frontend as a remote that exposes a typed Angular component contract. Angular framework packages and RxJS must be shared as strict singletons; a plugin must not ship a second Angular runtime.
4. Include the remote entry, exposed component chunks, shared-dependency metadata and plugin-owned static assets in the signed ZIP.
5. After the tenant's installed/enabled package catalogue is fetched, the host obtains a server-authorized immutable remote-entry URL and uses Native Federation's lazy-registration form of `loadRemoteModule` to load the exposed component.
6. Validate the package ID, version, signature, tenant entitlement, enabled state, manifest contract and frontend asset allowlist on the server before returning remote artifacts.
7. Mount the exported Angular component with `ViewContainerRef.createComponent` in the existing host view container. Supply only the documented context/capabilities as component inputs or host services.
8. On disable/uninstall, destroy the component refs, remove navigation/route registrations and invalidate the plugin's frontend runtime record. Because evaluated ESM modules cannot be reliably unloaded from a live JavaScript realm, perform a controlled application reload before claiming the plugin code has left the active page.

Native Federation is preferred over hand-written dynamic imports because its Angular adapter explicitly supports lazy registration by a `remoteEntry` URL and shared singleton dependencies. This is a prototype decision, not a claim that the current repository is already federated.

## Compatibility and references

- The checked-in web package pins Angular packages and Angular CLI/build to 19.2.15.
- The Native Federation Angular adapter is versioned by Angular major. Prototype against the 19.x adapter line; pin an exact tested release and lock it in `apps/web/package-lock.json`. Do not install an unpinned `latest` release.
- The adapter wraps Angular's application builder and provides the host/remote build integration. The host bootstrap must be split so federation initialisation runs before importing the Angular bootstrap.
- The runtime supports lazy remote registration using an options object with `remoteEntry`, `remoteName`, and `exposedModule`. This directly matches a plugin catalogue whose installed modules are only known after authentication.

References:
- Native Federation Angular v3 getting started: https://native-federation.com/docs/v3/angular-adapter/getting-started/
- Native Federation `loadRemoteModule` and lazy registration: https://native-federation.com/docs/v3/runtime/load-remote-module/
- Native Federation adapter overview: https://native-federation.com/docs/v3/angular-adapter/

## Consequences

### Positive
- Connected Devices component source, template, logic, styles and route metadata can live in its own package and no longer be statically imported by the core build.
- The remote component is an Angular component mounted in the host Angular view tree, not an iframe or isolated DOM application.
- Shared Angular dependencies are governed by a federation runtime rather than copied into each plugin bundle.
- The same mechanism can later support other genuinely independent Angular plugin frontends.

### Constraints and risks
- A same-realm Angular plugin is trusted code, not a security sandbox. Signatures verify publisher integrity, not runtime isolation. Only reviewed/trusted publishers may install native frontends.
- Server-side authorization must guard every remote-entry and asset request; URLs must be immutable and version-specific.
- A loaded ESM module cannot be forcibly unloaded. Uninstall must destroy mounts and force a page reload to guarantee no live references remain.
- Angular major/minor compatibility must be enforced at install/load time. Strict singleton sharing should reject incompatible remotes rather than silently loading another Angular runtime.
- The federation adapter changes the web build pipeline. Existing template, browser, smoke, Documents, Files and time-tracking tests must stay green before this is merged.

## Prototype acceptance criteria

- [ ] Angular host initialises federation before bootstrap.
- [ ] A minimal remote component loads from a signed package URL and mounts in the host Angular view tree.
- [ ] Browser confirms only one Angular runtime instance is used.
- [ ] The host core build contains no Connected Devices component/template/feature chunk or static import.
- [ ] Connected Devices ZIP contains its federation remote entry, component chunks and all plugin-owned assets.
- [ ] Tenant/entitlement/enablement and signature checks protect remote entry and every asset.
- [ ] Disable/uninstall destroys the component, unregisters navigation, and requires a controlled reload.
- [ ] Production build, backend tests, browser tests and existing Documents/Files flows pass.

Until every criterion is verified in CI, Connected Devices must remain on its current implementation and this ADR must remain marked prototype-only.
