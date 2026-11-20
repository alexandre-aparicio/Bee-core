# Company plugin marketplace and entitlements

## Current model

Bee-Core keeps the trusted plugin catalogue centrally and seeds its metadata into MongoDB:
- `plugin_catalog`: published plugin metadata;
- `plugin_plans`: Starter, Pro and Enterprise plan definitions;
- `tenant_subscriptions`: one current subscription per company;
- `plugin_purchases`: individual company add-on purchases;
- `tenant_plugin_installations`: installation state per company and plugin.

Each company receives its own filtered catalogue. Starter includes Private Files and can see Team Notes as a purchasable add-on, but cannot install or use Notes until an active purchase or an eligible plan is recorded. Pro and Enterprise include both Files and Notes. Other packages can be hidden from Starter entirely by leaving them out of its `visiblePluginIds`.

Companies without a subscription record receive a 14-day Starter trial on first marketplace access. Current plan definitions are code-managed defaults seeded into MongoDB, not yet editable through an administration UI.

## API

- `GET /marketplace/plugins`: only packages visible to the active company, including `entitled`, `purchasable` and `installed` state.
- `GET /marketplace/plugins/:pluginId`: details only when visible to that company.
- `GET /marketplace/plugins/:pluginId/versions`: trusted package version metadata when entitled.
- `GET /marketplace/entitlements`: current plan and effective plugin entitlements.
- `POST /marketplace/plugins/:pluginId/install`: checks company permission, visibility, entitlement, trusted package and dependencies before installing.
- `DELETE /marketplace/plugins/:pluginId/install`: checks management permission, prevents removal of system packages, runs the uninstall hook and preserves tenant data.
- `GET /billing/subscription`: current subscription and effective plan.

Installation state is company-scoped. The first implementation is synchronous and activates trusted code already compiled into the Bee-Core runtime. It does not download or execute arbitrary package code.

## Billing integration

`POST /billing/webhooks/entitlement` is the server-to-server integration boundary. Configure `BEE_BILLING_WEBHOOK_SECRET` and send it as a Bearer credential. The endpoint validates the secret using a constant-time comparison and supports:
- `subscription.updated`: update a company's plan, status and period end;
- `plugin.purchase`: grant an individual plugin purchase using a unique provider reference;
- `plugin.revoke`: revoke that purchase.

This is a webhook contract, not a complete billing product. Checkout, invoices, payment retries, refunds, taxes, customer portal and provider-specific reconciliation are not implemented yet.

## Reference plugin: Notes

The `notes` plugin demonstrates the intended pattern:
- its routes are registered by the trusted runtime;
- each request validates the persisted session and active company membership;
- each query uses `TenantCollection`;
- access requires the company to be entitled and the plugin to be installed;
- role permissions distinguish read and write access;
- uninstall or entitlement revocation disables access but does not delete company notes.

## Important limitations before commercial launch

- The catalogue and plan metadata are in MongoDB, but executable packages are currently trusted code bundled into the server build. Immutable downloadable package archives are not yet stored centrally.
- The business-plugin manifest validator defines a signed package contract, but signature/digest verification is not yet wired into package installation.
- Plan definitions and trusted package definitions are code-managed; a platform administration UI/API is pending.
- Purchase and subscription webhook events are implemented, but no payment provider or checkout integration is connected.
- The installer is synchronous. Durable jobs, migration checkpoints, version upgrades, rollback, crash recovery and full dependency graph resolution remain pending.
- Plan user/storage quotas are modeled but not yet enforced.
- A company-facing dashboard catalogue with install/uninstall controls is implemented and hides management actions from non-admin roles. Checkout, subscription management and payment-provider UI remain pending.
- Notes currently demonstrates backend APIs; tenant-specific Angular routes, menus and component registration remain pending.

Do not treat the marketplace as production billing or arbitrary third-party plugin execution yet.
