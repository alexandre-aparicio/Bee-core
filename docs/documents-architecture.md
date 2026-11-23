# Documents — architecture

Documents is Bee-Core's shared document service. It is a plugin, not a business module and not embedded in Dashboard or Public. Dashboard and Public are clients.

## Boundaries

- Documents owns folders, logical document metadata, tags, publication/revocation, resource-level access checks and controlled delivery.
- Core owns users, sessions, tenants, Teams, role permissions, generic ACL evaluation, plugin lifecycle and entitlements.
- Files remains the binary-storage provider for the first iteration. Documents uses a dedicated adapter around it; the rest of Documents must not depend on Files collections or filesystem details. A later object-storage adapter must not change the Documents API.
- CRM, products, sales, subscriptions and licensing remain in their own plugins. Documents must never query their collections.

## Access classes

1. Private: dashboard session plus tenant permission.
2. Team-shared: Core resource ACL grants specific permissions to specific Teams on a folder or document. Installing Documents for a Team does not grant access to every resource.
3. Public: explicit publication with a high-entropy bearer URL. Unpublishing revokes it. Public access is read/download only.
4. Entitlement-protected: planned. Commerce/licensing must authorize the buyer and exact resource. Documents is not the source of truth for purchases.

Folder ACLs inherit to descendants. Explicit user deny must override grants. No explicit resource policy preserves tenant-level permission behavior. All private records are tenant-scoped.

## Public and paid downloads

Public pages can link to /api/public/documents/{publicId}; they never receive a storage path, storage key, tenant ID or internal ID. Documents verifies that the record is still published and streams the blob with attachment disposition, nosniff and no-store headers.

Paid-plugin flow: purchase -> commerce entitlement -> Public/customer area requests authorization for the exact document -> Documents streams -> expiry/revocation disables access. This is not implemented by public links or Team membership; a trusted entitlement contract is a separate phase.

## Initial API

- GET/POST /documents/folders
- GET/POST /documents
- PUT /documents/:documentId/publication
- GET /public/documents/:publicId

Dashboard IDs are session-bound references. Public IDs are independent random bearer references.

## Security invariants

- Every private query is tenant-scoped.
- Folder parents must belong to the same tenant; ancestry is cycle-checked and depth-limited.
- A document can only reference a blob owned by the same tenant.
- ACLs are evaluated on the resource and every ancestor folder.
- Nothing is public by default; publication is explicit and revocable.
- Public delivery exposes no internal identifiers or storage information.
- Files enforces upload MIME validation and quotas.
- Paid downloads remain disabled until a trusted entitlement provider exists.
- Add audit events, public download rate limits, malware scanning and version history in subsequent increments.

## Rollout

This foundation adds the independent plugin, folder/document metadata, Teams-compatible ACL checks and public delivery for already uploaded Files blobs. Follow-up work: Dashboard UI, ACL editor/effective-permission UI, version history, upload integration, audit/rate limits, entitlement contract, object-storage adapter and integration tests for tenant isolation, team grants/denies, folder inheritance, publication revocation and public delivery.

Documents is not a CRM attachment engine, product catalogue, ecommerce module, licensing database, website CMS or general-purpose authorization engine.
