# Documents — architecture

Documents is a tenant-facing Bee-Core plugin. It owns document-domain behavior; it is not embedded in Dashboard or Public. Those applications are host clients of the Documents API and authorized frontend route.

## Backend and domain boundaries

- Documents owns folders, logical document metadata, tags, publication/revocation, resource-level access checks and controlled delivery.
- Core owns users, sessions, tenants, Teams, role permissions, generic ACL evaluation, plugin lifecycle, package verification and entitlements.
- Files remains the binary-storage provider for the first iteration. Documents uses a dedicated adapter; it must not depend on Files collections or filesystem details. A later object-storage adapter must not change the Documents API.
- CRM, products, sales, subscriptions and licensing remain in their own plugins. Documents must never query their collections.

## Frontend architecture

The current Documents dashboard UI is still a statically registered Angular component. The target is the same **Native Federation remote architecture as Connected Devices**:

- Move the Documents Angular component, templates, styles, translations and plugin-owned assets into `plugins/documents/frontend`.
- Expose the plugin component through a Native Federation remote entry and package the compiled remote output with the signed Documents backend ZIP.
- Share Angular and framework dependencies as strict singletons from `apps/web/node_modules`; do not bundle a second Angular runtime.
- Let the generic Core plugin outlet validate the remote descriptor and remote-entry metadata, then mount the component in the host document.
- Keep routes and navigation in the verified Documents manifest. Core must not statically import the Documents component or add a Documents-specific branch to the outlet.

Native Federation executes in the host JavaScript realm; it is not a sandbox. Only the reviewed, signed first-party Documents package may use this transport. Backend authorization remains authoritative regardless of whether the menu or component is visible.

This frontend migration is planned, not complete. Do not remove the current host registration until the signed remote package is published, verified and successfully loaded in the target runtime.

## Access classes

1. **Private:** authenticated dashboard session plus tenant permission.
2. **Team-shared:** Core resource ACL grants specific permissions to specific Teams on a folder or document. Installing Documents for a Team does not grant access to every resource.
3. **Public:** explicit publication with a high-entropy bearer URL. Unpublishing revokes it. Public access is read/download only.
4. **Entitlement-protected:** future commerce/licensing integration must authorize the buyer and exact resource. Documents is not the source of truth for purchases.

Folder ACLs inherit to descendants. Explicit user deny overrides grants. Without an explicit resource policy, tenant-level permission behavior is preserved. All private records are tenant-scoped.

## Public and paid downloads

Public pages may link to `/api/public/documents/{publicId}`; they never receive a storage path, storage key, tenant ID or internal ID. Documents verifies that the record is still published and streams the blob with attachment disposition, nosniff and no-store headers.

Paid-plugin flow: purchase -> commerce entitlement -> Public/customer area requests authorization for the exact document -> Documents streams -> expiry/revocation disables access. This is not implemented by public links or Team membership; a trusted entitlement contract is a separate phase.

## API and compatibility

Existing API routes and payloads must remain compatible during the frontend migration:
- `GET/POST /documents/folders`
- `GET/POST /documents`
- `PUT /documents/:documentId/publication`
- `GET /public/documents/:publicId`

Dashboard IDs are session-bound references. Public IDs are independent random bearer references. Do not introduce client-selected tenant IDs.

## Security and data invariants

- Every private query is tenant-scoped.
- Folder parents belong to the same tenant; ancestry is cycle-checked and depth-limited.
- A document can reference only a blob owned by the same tenant.
- ACLs are evaluated on the resource and every ancestor folder.
- Nothing is public by default; publication is explicit and revocable.
- Public delivery exposes no internal identifiers or storage information.
- Files enforces upload MIME validation and quotas.
- Paid downloads remain disabled until a trusted entitlement provider exists.
- Package upgrade and frontend migration preserve document IDs, folder hierarchy, ACLs, publication state and blob references.

## Migration and acceptance

1. Build the Documents Native Federation remote using the host workspace's Angular dependencies.
2. Include remote entry, chunks and assets in the signed Documents ZIP and verify its manifest and signature.
3. Upload and install the package through the normal platform/tenant lifecycle.
4. Verify tenant navigation, asset-token authorization, remote loading and existing document workflows.
5. Remove the static Angular registration only after the remote is proven in browser tests and on the owner VPS.
6. Retire the legacy bundled backend fallback only after the signed ZIP is published, verified and loaded from persisted package storage.

Tests must cover tenant isolation, team grants/denies, folder inheritance, publication revocation, public delivery, asset authorization, remote loading and preservation across package upgrade. Documents is not a CRM attachment engine, product catalogue, ecommerce module, licensing database, website CMS or general-purpose authorization engine.
