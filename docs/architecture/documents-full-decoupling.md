# Documents: external signed-plugin architecture

## Objective

Documents is distributed and executed only as a signed ZIP plugin. Bee-core must not
ship a built-in backend implementation, Angular component, Documents API client,
Documents-specific configuration allowlist, or Files dependency.

The platform shell may provide a generic navigation entry and generic plugin outlet;
the actual Documents UI and backend are owned by the signed package.

## Current implementation on this branch

- `src/index.ts` does not import or register `documentsPlugin`.
- Startup retires the legacy bundled platform-package record without deleting tenant
  installation history, metadata, or files.
- `TRUSTED_PLUGIN_PACKAGES` no longer treats Documents as a built-in package.
- The package builder creates Documents ZIP version `0.1.2`, including its backend
  module graph and the package-owned `frontend/index.html` and `frontend/main.js`.
- Documents declares only the Core runtime dependencies `auth` and `organizations`.
  It does not declare or call the Files plugin.
- Uploads, file metadata, integrity checks, downloads and public delivery are owned
  by Documents through `tenant_document_files` and its private storage adapter.
- The storage directory is selected by `BEE_DOCUMENTS_DIR`, defaulting to
  `/data/bee-documents`. This preserves the existing persistent storage location.
- The Angular Documents component, API service and module-specific Angular
  translation catalog have been removed.
- The Angular registry no longer registers Documents. The generic plugin outlet
  loads the signed package frontend in a sandboxed iframe and proxies only the API
  prefixes declared by its verified manifest. The bearer token remains in the host.
- The Core plugin manager exposes common non-secret runtime capabilities to plugins
  and no longer contains a Documents-specific configuration entry.
- Legacy bundled package retirement and ZIP replacement do not delete Documents
  collections or files.

## Data preservation

No cleanup or migration that deletes existing data is part of this branch. Existing
Documents collections, metadata and the `/data/bee-documents` volume must remain
untouched. Platform package removal may remove signed package code only after tenant
installations and pending lifecycle jobs have been cleared; it must preserve tenant
business data.

## Required verification before user testing

1. Build the Core backend and Angular frontend.
2. Build and sign Documents ZIP `0.1.2`; inspect its manifest, backend graph and
   frontend assets.
3. Install ZIP over the legacy Documents registry entry and confirm automatic restart.
4. Confirm runtime state is `loaded` and the package frontend opens in the iframe.
5. Install, activate, disable, re-enable and uninstall it for a tenant.
6. Confirm platform disable/re-enable does not remove tenant data.
7. Remove the platform ZIP only when no real tenant installation or pending lifecycle
   job blocks removal; reinstall it and confirm previous tenant data is still present.
8. Verify upload, listing, folder ACLs, sharing, download and public delivery with Files
   disabled or unavailable.
9. Run regression tests for tenant isolation, resource references, package lifecycle,
   restart persistence and data preservation.

No claim of full completion is made until these checks pass. Do not merge this branch
into `main` or run destructive data cleanup as part of this work.
