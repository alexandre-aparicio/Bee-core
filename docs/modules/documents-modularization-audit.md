# Documents modularization audit

**Branch:** `feature/documents-full-decoupling`

## Current boundary

Documents is being migrated to a fully external signed ZIP plugin. The source remains
under `src/plugins/documents` only as the source used by the package builder; it is
not imported or registered by `src/index.ts`.

The package owns:
- Backend routes, handlers, service, repository, validators and storage adapter.
- File metadata in `tenant_document_files` and binaries under
  `BEE_DOCUMENTS_DIR` (default `/data/bee-documents`).
- Standalone frontend files under `src/plugins/documents/frontend`.

The package declares `auth` and `organizations` as its runtime dependencies. It
does not depend on Files. The Angular Documents component, API service and dedicated
translation catalog have been removed. The generic plugin outlet loads the signed
package frontend in an isolated iframe.

## Changes made on this branch

- Removed Documents from trusted/bundled plugin definitions and retired the legacy
  bundled package record at platform startup without deleting tenant data.
- Removed the Documents-specific Core configuration allowlist and config property.
- Documents reads its storage directory from `BEE_DOCUMENTS_DIR` with the existing
  persistent path as default.
- Removed the static Angular frontend registration and its source files.
- Updated the package builder to publish Documents ZIP `0.1.2`.
- Updated dashboard templates to render package frontends through the generic plugin
  outlet instead of a Documents-specific component path.
- Added package-build assertions for ZIP version, runtime dependencies, and absence
  of static Documents registration/configuration.

## Verification still required

No build, test suite, Angular production build, ZIP signing, browser test, VPS
deployment or live lifecycle test has been executed as part of these GitHub edits.
Before asking the user to test, verify package creation and signature, install and
restart, runtime load, tenant install/activation/disable/re-enable/uninstall, package
removal/reinstall, Files-independent upload/download/public delivery, and persistence
of all existing Documents data.

Do not run destructive cleanup. Do not merge to `main` until these checks pass.
