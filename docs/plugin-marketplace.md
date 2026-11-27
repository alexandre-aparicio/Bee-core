# Company plugin marketplace and entitlements

## Current model

Bee-Core keeps the trusted plugin catalogue centrally and seeds its metadata into MongoDB:
- `plugin_catalog`: published plugin metadata;
- `plugin_plans`: Starter, Pro and Enterprise plan definitions;
- `tenant_subscriptions`: one current subscription per company;
- `plugin_purchases`: individual company add-on purchases;
- `tenant_plugin_installations`: installation state per company and plugin;
- `plugin_install_jobs`: durable, tenant-scoped installation jobs with active-job deduplication, attempts, worker lease, status, result and error metadata.

Each company receives its own filtered catalogue. Starter includes Private Files; Documents is provisioned with its Files dependency. Other packages are visible only when listed in the effective plan or granted through an active purchase/manual entitlement. Signed package manifests distinguish platform/runtime `dependencies` from company-level `tenantDependencies`. The platform installer validates runtime dependencies before publishing a package; it writes `tenantDependencies` into the Marketplace dependency graph. Marketplace install requests, activation and the durable install worker all require every transitive tenant dependency to be entitled, installed and enabled. A missing dependency blocks installation with HTTP 409; dependencies are never silently installed as a side effect. Team Notes has been retired: it is excluded from all plans and catalogues, and its previous tenant data and installation/migration history are retained without restoring runtime access.

Companies without a subscription record receive a 14-day Starter trial on first marketplace access. Current plan definitions are code-managed defaults seeded into MongoDB, not yet editable through an administration UI.

## API

- `GET /marketplace/plugins`: only packages visible to the active company, including `entitled`, `purchasable` and `installed` state.
- `GET /marketplace/plugins/:pluginId`: details only when visible to that company.
- `GET /marketplace/plugins/:pluginId/versions`: trusted package version metadata when entitled.
- `GET /marketplace/entitlements`: current plan and effective plugin entitlements.
- `POST /marketplace/plugins/:pluginId/install`: checks company permission, visibility, entitlement, trusted package and all transitive `tenantDependencies` (each must be entitled, installed and enabled), then enqueues a durable install job and returns HTTP `202` with `jobId` and `statusUrl`.
- `GET /marketplace/install-jobs/:jobId`: returns status only when the job belongs to the active company.
- `DELETE /marketplace/plugins/:pluginId/install`: checks management permission, prevents removal of system packages and dependencies in use, then enqueues a durable uninstall job and returns HTTP `202` with `jobId` and `statusUrl`.
- `GET /billing/subscription`: current subscription and effective plan.

Installation state and lifecycle jobs are company-scoped. The worker activates or uninstalls only trusted code already compiled into the Bee-Core runtime; it does not download or execute arbitrary package code. MongoDB job records survive API restarts, concurrent requests for the same company/plugin and action share one active job, worker claims use expiring leases that are renewed while long-running jobs execute; expired workers cannot renew, complete or fail a job after losing ownership. Failed jobs retry up to three attempts with backoff. Plugin migrations are checksum-immutable and tenant-scoped. If a later migration fails, completed migrations are compensated in reverse order; if a post-migration install/update hook fails, migrations applied during that lifecycle attempt are also compensated. Missing or failing rollback handlers are persisted as `rollback_failed` for operator recovery. Update hooks receive the previous installed version. The Angular marketplace waits for install, update and uninstall job results and displays progress. Uninstall transitions through `uninstalling` and returns to `installed` if the hook fails; successful uninstall preserves tenant business data.

## Billing integration

`POST /billing/webhooks/entitlement` is the server-to-server integration boundary. Configure `BEE_BILLING_WEBHOOK_SECRET` and send it as a Bearer credential. The endpoint validates the secret using a constant-time comparison and supports:
- `subscription.updated`: update a company's plan, status and period end;
- `plugin.purchase`: grant an individual plugin purchase using a unique provider reference;
- `plugin.revoke`: revoke that purchase.

Webhook event handling is idempotent for an unchanged subscription or purchase state. A provider reference is bound to the plugin recorded by its first purchase event; a later grant or revoke naming a different plugin is rejected with HTTP 409. Purchase references are length/control-character validated. Subscription changes and actual plugin entitlement grants/revocations append tenant audit events using the system actor `billing-webhook`; duplicate no-op deliveries do not create duplicate transition events. Compare-and-set updates make concurrent duplicate subscription, purchase and revocation deliveries idempotent: only the winning state transition emits an audit event, a matching concurrent delivery becomes a no-op, and a conflicting state change returns HTTP 409 for provider retry.

The current webhook credential is a shared static Bearer secret with constant-time comparison. Provider-specific signed payload verification, timestamp/replay-window validation, provider event-ID deduplication and payment reconciliation are not implemented; treat this as a trusted integration boundary, not a hardened public billing endpoint.

This is a webhook contract, not a complete billing product. Checkout, invoices, payment retries, refunds, taxes, customer portal and provider-specific reconciliation are not implemented yet.

## Retired package history

Team Notes is no longer a product package. Startup permanently marks its platform package and catalogue record as deprecated, including a previous ZIP replacement. Tenant-owned rows, installation records and migration history are retained; the retired package is not restored to tenant catalogues or runtime access.

## Important limitations before commercial launch

- The catalogue and plan metadata are in MongoDB, but executable packages are currently trusted code bundled into the server build. Immutable downloadable package archives are not yet stored centrally.
- The business-plugin manifest validator enforces semantic version dependency ranges, unique dependency/permission/collection/migration/route declarations and safe backend/frontend/storage paths. The manifest contains digest/signature metadata, but cryptographic signature/digest verification is not yet wired into package installation.
- Plan definitions and trusted package definitions are code-managed; a platform administration UI/API is pending.
- Purchase and subscription webhook events are implemented, but no payment provider or checkout integration is connected.
- Install and uninstall jobs are durable and recover expired worker leases. Version upgrades, rollback, immutable package archive verification and full dependency graph resolution remain pending.
- Plan user and storage quotas are enforced for new operations: invitations/direct membership additions reserve the company user allowance, and file uploads reserve storage atomically per company. A downgrade does not automatically suspend existing members or delete files; it blocks new additions/uploads that exceed the new allowance.
- A company-facing dashboard catalogue with install/uninstall controls is implemented and hides management actions from non-admin roles. Checkout, subscription management and payment-provider UI remain pending.
- The frontend registry currently contains statically bundled trusted components; loading component code/routes from signed package archives remains pending.

Do not treat the marketplace as production billing or arbitrary third-party plugin execution yet.
