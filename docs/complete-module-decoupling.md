# Package decoupling: four installable modules

## Scope

This work covers four installable packages:

1. **Connected Devices** — Native Federation reference implementation.
2. **Control Horario** — backend signed ZIP exists; Angular frontend migration is planned.
3. **Documents** — backend package migration is in progress; Angular frontend migration is planned.
4. **Hola Mundo** — minimal package used to demonstrate the generic lifecycle and legacy sandboxed HTML transport.

Private Files is shared platform infrastructure, not one of these tenant-installable modules. Team Notes is retired; historical tenant data and installation records are preserved. Authentication, organizations, teams, marketplace, platform administration, notifications, mail, localization and shared runtime services remain Core infrastructure.

## Target architecture

All four products use the common package lifecycle: build, sign, upload, verify, persist, register, grant/entitle, install, enable and load. Platform package availability does not automatically grant tenant access.

For first-party Angular business modules, the frontend target is **Native Federation**:
- The backend and frontend distribution are delivered in the versioned signed ZIP.
- The Angular remote is built separately under the plugin directory and exposes a component through `remoteEntry.json`.
- Angular dependencies are shared as strict singletons from the host workspace; no duplicate Angular runtime is packaged.
- The generic Core outlet validates the authorized remote descriptor and remote-entry metadata, then mounts the component in the same document.
- Verified manifest routes drive tenant navigation; Core has no module-specific component imports or branches.

Native Federation runs in the host JavaScript realm. It is for trusted, reviewed, signed first-party packages, not untrusted code isolation. The legacy sandboxed iframe transport remains available for isolated HTML/JavaScript packages such as the Hola Mundo demonstration. These are distinct transports and must not be conflated.

## Current implementation status in this branch

- **Connected Devices:** backend package is signed ZIP-only. Its Angular UI is a Native Federation remote in `plugins/connected-devices/frontend`. The remote exposes `./Component`; the host and remote share Angular dependencies as strict singletons. The generic outlet validates `remoteEntry.json`, obtains protected package assets and mounts the component in the host document. Connected Devices uses manual tenant activation.
- **Control Horario:** backend is delivered as a signed ZIP package. Its Angular UI is still a statically registered host component; moving it into a Native Federation remote is planned. Preserve its current API, activation policy, permissions, migrations and tenant data.
- **Documents:** backend ZIP packaging/migration is in progress and the legacy backend fallback is not yet retired. Its Angular UI is still statically registered; moving it into a Native Federation remote is planned. Preserve document ACLs, public publication/revocation, Files adapter behavior and tenant data.
- **Hola Mundo:** generic signed-ZIP lifecycle and sandboxed iframe frontend provide a minimal legacy HTML package example. It is not the reference for first-party Angular business modules.
- The device simulator remains a developer/test asset under `apps/web/src/assets/device-simulator`, not part of the production Connected Devices remote.

## Security and lifecycle invariants

1. **Verified artifacts only.** Verify signature, digest, manifest schema, compatibility, dependencies and safe paths before executing or serving package assets.
2. **Separate platform and tenant state.** Platform upload/registration does not grant tenant entitlement. Tenant entitlement/grant does not equal installation. Installation does not bypass enabled/activation state or user permissions.
3. **Tenant-scoped access.** Backend APIs, navigation, remote descriptors and protected assets must validate the authenticated user, active membership, tenant entitlement, installation, activation and applicable permissions.
4. **Manifest-driven dependencies.** Core services are host dependencies; business plugin dependencies are declared and versioned. Avoid implicit cross-plugin imports.
5. **Data preservation.** Upgrade, frontend migration, disablement, revocation and uninstall must preserve tenant records unless a separately reviewed destructive migration is explicitly approved.
6. **Fail closed.** Missing/invalid asset authorization, remote metadata, entitlement or installation must prevent loading. A hidden menu is not a security boundary.
7. **No static coupling.** Once migrated, backend bootstrap and Angular host registry must not statically import the module's entrypoint or component.

## Migration sequence

1. Keep Connected Devices as the working reference and resolve its remaining VPS protected-asset 404 before claiming operational completion.
2. Migrate Control Horario's Angular component, template, styles, translations and assets into `plugins/time-tracking/frontend`; add Native Federation build output to its signed ZIP.
3. Migrate Documents' Angular component, template, styles, translations and assets into `plugins/documents/frontend`; add Native Federation build output to its signed ZIP.
4. Remove each module's static host registration only after the remote package is built, uploaded, verified and loaded through the generic outlet.
5. Retire the Documents backend fallback only after its signed ZIP has been published, verified and loaded from persisted package storage.
6. Complete upload-to-runtime-to-authorized-use tests for each module, including tenant isolation, navigation, asset authorization, core workflows, upgrades and data preservation.
7. Validate all three Native Federation modules on the owner VPS before declaring the migration operationally complete.

## Acceptance tests

- Build signed package fixtures for Connected Devices, Control Horario, Documents and Hola Mundo.
- Verify signatures, digests, manifests, compatibility, dependencies and safe archive paths.
- Load backend entrypoints from persisted artifacts without static bootstrap imports.
- For each Native Federation module, build a remote with singleton Angular dependencies, package its remote entry/chunks/assets and load it via the generic outlet.
- Assert that unauthorized tenants cannot discover routes, obtain asset tokens, load remotes or invoke APIs.
- Assert that disabled/revoked packages fail closed while tenant data remains intact.
- Test module permissions and critical workflows, package upgrade behavior and restart persistence.
- Keep the Hola Mundo iframe bridge tests separate from Native Federation tests.
- Run backend tests, Angular production build, package tests and Playwright browser tests without skipping or weakening assertions.

## Explicitly out of scope

- Public third-party SDK/developer portal.
- Converting Private Files or all Core capabilities into tenant packages.
- Arbitrary untrusted JavaScript execution in the host realm.
- Rewriting business behavior unrelated to removing static coupling.
- Deleting tenant data as part of package or frontend migration.

## Completion rule

The architecture migration is complete only when Connected Devices, Documents and Control Horario are all loaded through signed packages and Native Federation, their static component registrations and obsolete backend fallbacks are retired where applicable, tenant authorization is enforced, existing data is preserved, and CI plus owner-VPS acceptance checks pass. Hola Mundo remains the isolated HTML/iframe demonstration.
