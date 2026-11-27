# Control Horario — package and frontend architecture

## Current state

Control Horario's backend is delivered as a signed ZIP package. Its Angular UI is still a statically registered host component at `apps/web/src/app/time-tracking/time-tracking.frontend.ts`. This is a transitional state, not the target architecture.

The target is the same **Native Federation remote architecture as Connected Devices**. The frontend migration will move the component, templates, styles, translations and assets into `plugins/time-tracking/frontend`, expose a component through `remoteEntry.json`, and include the compiled remote distribution in the signed Control Horario ZIP.

The remote must resolve Angular dependencies from `apps/web/node_modules` and share them as strict singletons. Do not install or package a second Angular runtime. The generic Core outlet will validate the authorized remote entry and mount the Angular component in the host document. No static Control Horario component import or module-specific loader branch should remain after migration.

Native Federation runs in the host JavaScript realm; it is not an iframe or an isolation sandbox. Only reviewed, signed first-party code may use this transport. Existing backend permissions and tenant checks remain authoritative.

## Backend package contract

Version 0.2.3 also publishes the typed `time-tracking.device-api` service. Connected-device integrations must call this business-owned contract instead of importing the repository or HTTP handlers. The separate `time-tracking-connected` package depends on both `time-tracking` and `connected-devices`; it does not own time-entry persistence or business rules.

The current package contract declares:
- Package ID `time-tracking`, version `0.2.3`.
- Backend entrypoint `dist/backend/index.mjs`.
- Dependencies `auth` and `organizations`; required services `mongoDbName` and `sessionIdSecret`.
- API prefix `/time-tracking`.
- Existing install migration `001_create_time_tracking_indexes` with its immutable checksum.
- The current activation policy as declared by its manifest; the frontend migration must not silently change it.

The backend ZIP currently omits a frontend directory and contains no Angular remote entrypoint. This will change only when the Native Federation build and package pipeline is implemented and tested.

## Package publication and signing

Package creation and signing are owner-side release operations. GitHub Actions validates the repository build logic; it does not publish or sign the production ZIP.

From the Bee-Core checkout, after dependencies are installed, run:

```bash
npm run build:plugin-packages
```

The process requires these environment variables from the release environment:
- `BEE_PLUGIN_PUBLISHER_PRIVATE_KEY`: PKCS#8 PEM private key, used only to sign.
- `BEE_PLUGIN_PUBLISHER_PUBLIC_KEY`: matching SPKI PEM public key, used to verify the key pair and signature.

The publisher accepts matching Ed25519 or RSA key pairs. Key material must never be copied into a ZIP or committed to the repository. Bee-Core verifies the signature with the configured public key.

## Upgrade and data preservation

The install migration is immutable and tenant-scoped. Repeating an install at the same package version skips an already-applied migration. A package upgrade selects only migrations tagged for the upgrade phase; it must not rerun install migrations.

Frontend migration must not recreate tenant installations or alter employee records, schedules, time entries, breaks, corrections, approvals, audit history or other existing tenant data. Preserve API routes, payloads, permissions and business behavior.

## Required migration and verification

1. Create the Native Federation remote project under `plugins/time-tracking/frontend`.
2. Expose the Angular component through `./Component` and configure strict singleton sharing with the host workspace.
3. Add a reproducible remote build to the package pipeline and include remote entry, chunks and assets in the signed ZIP.
4. Verify ZIP contents, manifest metadata, signature and remote-entry contract.
5. Load the remote through the generic outlet only after tenant entitlement, installation, activation and user permission checks.
6. Remove the static host registration only after browser and owner-VPS validation.
7. Keep existing backend package versioning/migration guarantees and test upgrade from the current installed version without data loss.

Acceptance tests cover package build/signature, remote loading, navigation, tenant isolation, role permissions, clock-in/out and other critical workflows, package upgrade and preservation of existing tenant data. A successful backend-only ZIP build does not mean the frontend migration is complete.
