# Control Horario 0.2.2: backend-only ZIP and VPS signing

Control Horario is a backend-only signed ZIP package. Its user interface is a native Angular component registered by `apps/web/src/app/time-tracking/time-tracking.frontend.ts`; it is not served from the ZIP and does not use an iframe. The native component remains untouched by the package cleanup. The ZIP carries the backend entrypoint, its complete relative-import module graph, the signed manifest and a README. It must not contain a `frontend/` directory, frontend entrypoint or frontend assets.

## VPS package publication

Package creation and signing remain owner-side VPS operations. GitHub Actions validates the repository build logic; it does not publish or sign the production ZIP.

From the Bee-Core checkout, after dependencies are installed, run:

```bash
npm run build:plugin-packages
```

The process requires these environment variables from the VPS secret/environment configuration:

- `BEE_PLUGIN_PUBLISHER_PRIVATE_KEY`: PKCS#8 PEM private key, used only to sign.
- `BEE_PLUGIN_PUBLISHER_PUBLIC_KEY`: matching SPKI PEM public key, used to validate the key pair and verify the signature immediately after signing.

The publisher accepts matching Ed25519 or RSA key pairs. It uses the EdDSA null-digest mode for Ed25519 and SHA-256 for RSA, matching the runtime ZIP verifier. It refuses missing, malformed, unsupported or mismatched keys. Each signature is verified before the ZIP is written. Key material is not a package asset and must never be copied into a ZIP or committed to the repository. Bee-Core verifies the signature with the public key configured on the server.

**Required owner action:** rebuild, sign and upload `time-tracking-0.2.2.zip` to the VPS package catalog, then run the normal tenant package update flow for existing installations. The update from 0.2.1 to 0.2.2 exercises the package upgrade path. Do not remove or recreate tenant installations, sessions, schedules, corrections or other tenant data.

## Package contract

The signed manifest declares:

- Package ID `time-tracking`, version `0.2.2`, automatic activation.
- Backend entrypoint `dist/backend/index.mjs`.
- Dependencies `auth` and `organizations`; required services `mongoDbName` and `sessionIdSecret`.
- API prefix `/time-tracking`, stored in `frontend.apiPrefixes` so the dynamic runtime dispatches requests to the backend-only package.
- The existing install migration `001_create_time_tracking_indexes` with its unchanged checksum.

The package builder intentionally omits the Control Horario Angular frontend source and its former standalone `index.html` / `main.js` files. The generated backend-only manifest retains an empty frontend route list for schema compatibility, with no frontend entrypoint or assets. The package test installs the generated signed ZIP and asserts that no `frontend/` directory is extracted.

## Migration and upgrade behavior

The install migration is immutable and tenant-scoped. Repeating an install at the same package version skips the already-applied migration. A package upgrade selects only migrations tagged for the `upgrade` phase; it does not rerun install migrations. CI tests both same-version idempotency and the upgrade-phase selection.

## Verification boundary

Repository tests and CI can validate package construction using ephemeral test keys, manifest contents, migration behavior and the native frontend registration. They cannot prove that the VPS secrets are configured correctly or that a ZIP has actually been produced, signed, uploaded and updated on the VPS. The owner must complete that operational check without printing either key. The native Angular frontend registration and `e2e/time-tracking.spec.ts` remain the UI implementation and browser regression coverage.
