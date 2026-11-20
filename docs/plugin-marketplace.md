# Company plugin marketplace and entitlements

## Current model

Bee-Core keeps a trusted platform plugin catalog centrally in code and seeds its metadata into MongoDB:
- `plugin_catalog`: centrally published plugin metadata;
- `plugin_plans`: plan definitions (Starter, Pro, Enterprise);
- `tenant_subscriptions`: one current plan subscription per company;
- `plugin_purchases`: individual company add-on purchases;
- `tenant_plugin_installations`: per-company installed version and lifecycle state.

Each company's catalog is resolved independently. It contains plan-visible packages and purchasable add-ons, but installation is allowed only when the company has an included plan entitlement or an active purchase. A private/non-purchasable package is not exposed by the marketplace routes unless its visibility rules permit it.

The initial default is a 14-day Starter trial. Starter includes the system Files package. Pro and Enterprise include Files and Notes. Notes is an optional purchasable add-on for companies not on a plan that includes it.

## API

- `GET /marketplace/plugins`: packages visible to the active company, with `entitled` and `installed` state.
- `GET /marketplace/plugins/:pluginId`: details only when visible to that company.
- `GET /marketplace/plugins/:pluginId/versions`: trusted package version metadata when entitled.
- `GET /marketplace/entitlements`: current plan and effective package entitlements.
- `POST /marketplace/plugins/:pluginId/install`: checks role, plan/purchase entitlement and dependencies, then records install state and runs the trusted package install hook.
- `DELETE /marketplace/plugins/:pluginId/install`: checks management permission, prevents removal of system packages, runs the uninstall hook and preserves tenant data.

Installation states are company-scoped. The first implementation is synchronous and uses trusted code already compiled into the Bee-Core runtime. It does not download or execute arbitrary package code.

## Reference plugin: Notes

The `notes` plugin demonstrates the intended pattern:
- its routes are registered by the trusted runtime;
- every request validates the persisted session and active company membership;
- each query uses `TenantCollection`;
- access requires the company to be entitled and the plugin to be installed;
- role permissions distinguish read and write access;
- uninstall disables the routes but does not delete tenant notes.

## Important limitations before commercial launch

- Plan definitions and trusted package definitions are currently code-managed. A platform administration UI/API is not implemented.
- Purchase records are modeled and consumed by the resolver, but no payment provider, checkout, webhook signature verification or reconciliation is connected yet.
- Subscription changes, renewals, grace periods, billing invoices, taxes and cancellation workflows remain pending.
- Plugin artifacts are not yet built, signed and stored as immutable downloadable archives. The manifest validator defines the contract, but the current runtime packages are trusted compiled code.
- The installer is synchronous. Durable jobs, dependency graph resolution, migration checkpoints, rollback and crash recovery remain pending.
- Plan user/storage quotas are modeled but not yet enforced.
- The marketplace is an API foundation; the full company-facing marketplace and billing UI remains pending.

Do not treat the marketplace as production billing or arbitrary third-party plugin execution yet.
