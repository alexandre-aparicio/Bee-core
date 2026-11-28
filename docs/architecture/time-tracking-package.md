# Control Horario — package and frontend architecture

## Current state

The backend TypeScript build and both Native Federation remotes (Connected Devices and Control Horario) have now compiled successfully in GitHub Actions on this branch. The signed ZIP was not produced: the repository Actions secret `BEE_PLUGIN_PUBLISHER_PRIVATE_KEY` is not configured. Do not use a temporary signing key for VPS installation because it would not match the server's trusted publisher key. No automated tests or VPS runtime validation have been run.

Control Horario's backend is delivered as a signed ZIP package. The Angular frontend now has a dedicated Native Federation remote scaffold under `plugins/time-tracking/frontend`; the static host registration has been removed. The previous host-side component source is retained temporarily as migration reference, but it is no longer registered or selected by the plugin outlet.

The target is the same **Native Federation remote architecture as Connected Devices**. The component, templates, styles and API adapter have been copied into `plugins/time-tracking/frontend`; the remote exposes `./Component`, has its own Angular build target, and is included in the signed-package build pipeline. The ZIP assembly and browser mount still require a successful end-to-end build and runtime verification.

The remote must resolve Angular dependencies from `apps/web/node_modules` and share them as strict singletons. Do not install or package a second Angular runtime. The generic Core outlet will validate the authorized remote entry and mount the Angular component in the host document. No static Control Horario component import or module-specific loader branch should remain after migration.

Native Federation runs in the host JavaScript realm; it is not an iframe or an isolation sandbox. Only reviewed, signed first-party code may use this transport. Existing backend permissions and tenant checks remain authoritative.

## Backend package contract

The current package contract declares:
- Package ID `time-tracking`, version `0.2.3` (frontend architecture migration).
- Backend entrypoint `dist/backend/index.mjs`.
- Dependencies `auth` and `organizations`; required services `mongoDbName` and `sessionIdSecret`.
- API prefix `/time-tracking`.
- Existing install migration `001_create_time_tracking_indexes` with its immutable checksum.
- The current activation policy as declared by its manifest; the frontend migration must not silently change it.

The package builder now expects `apps/web/dist/time-tracking-remote/browser/remoteEntry.json` and declares the remote name `timeTracking`, exposed module `./Component`, route `/dashboard/time-tracking`, and API prefix `/time-tracking`. The actual ZIP output remains unverified until the remote build and package-signing pipeline is run.

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

1. Build the Native Federation remote under `plugins/time-tracking/frontend` using the dedicated Angular target.
2. Verify strict singleton sharing with the host workspace and ensure no second Angular runtime is bundled.
3. Run the package pipeline and inspect ZIP contents, manifest metadata, signature and remote-entry contract.
4. Load the remote through the generic outlet only after tenant entitlement, installation, activation and user permission checks.
5. Verify the in-module navigation for My Day, Schedule, History and Requests.
6. Test the API prefix, tenant isolation, role permissions, clock-in/out, breaks, schedules and corrections.
7. Test upgrade from `0.2.2` to `0.2.3` without changing tenant data or rerunning the immutable install migration.

Acceptance tests cover package build/signature, remote loading, navigation, tenant isolation, role permissions, clock-in/out and other critical workflows, package upgrade and preservation of existing tenant data. A successful backend-only ZIP build does not mean the frontend migration is complete.
