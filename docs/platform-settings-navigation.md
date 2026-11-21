# Bee-Core Settings sections

**Branch:** `feature/settings-sections`  
**Base:** `main` at `86d30a83b3f2e5b669465b01649d9589ef7d2ed7`

## Navigation and routes

Settings remains one expandable destination in the primary dashboard navigation. It contains exactly eight role-filtered sections:

- General — `/dashboard/settings/general`
- Tenants — `/dashboard/settings/tenants`
- Plugins — `/dashboard/settings/plugins`
- Integrations — `/dashboard/settings/integrations`
- Plans & Licensing — `/dashboard/settings/plans-licensing`
- Security — `/dashboard/settings/security`
- Infrastructure — `/dashboard/settings/infrastructure`
- Localization — `/dashboard/settings/localization`

The legacy base URL `/dashboard/settings` resolves to General. Plugins remains exclusively inside Settings; its existing detail route is retained for deep links.

## General

General contains exactly three cards:

1. **Platform Identity** — platform or active-tenant name, current host and corporate assets.
2. **Appearance** — reuses the existing template manager for dashboard/public themes and appearance modes.
3. **Platform Defaults** — default workspace landing, onboarding and workspace experience.

Appearance reuses the existing template manager only in tenant scope. The current template engine persists preferences per active tenant, so it is deliberately not exposed as a global platform control. Global appearance, identity and defaults remain informational/unavailable until a platform settings persistence API exists; the UI does not claim to save them.

## Section ownership

- **Tenants:** existing platform tenant directory and management component; Super Administrator only.
- **Plugins:** existing authenticated marketplace-backed catalogue and details view.
- **Integrations:** connector registry, global credentials, SMTP and notification channels.
- **Plans & Licensing:** plan catalogue, pricing, subscriptions and license entitlements.
- **Security:** authentication/session policies, governance, privacy and retention. Existing Activity audit log remains in Activity and is not duplicated.
- **Infrastructure:** runtime/services, storage, queues, logs and backup operations.
- **Localization:** languages, regions, currencies, timezone and regional formats.

For the last five operational areas, the current backend does not expose persisted settings APIs. Their fields are therefore shown as unavailable, with explicit backend dependency notes; no local-only form or fake save behavior is presented.

## Role visibility and scope

- Super Administrator: all eight sections, platform scope.
- Tenant owner/admin: General, Plugins, Integrations, Security and Localization, tenant scope.
- Tenant manager/member: Localization only.
- The existing server-side authorization remains authoritative; hiding a navigation entry does not grant backend access.
- Tenant directory remains separate from tenant-scoped General. Platform identity/default settings are not silently written to a tenant, or vice versa.

## Files

- `apps/web/src/app/app.component.ts` — canonical routes, base-route handling, role visibility and removal of duplicate main-navigation entries.
- `apps/web/src/app/settings/settings-workspace.component.ts` — shared Settings workspace and General cards.
- `apps/web/src/app/templates/packages/{midnight,glass,paper}/pages/dashboard.component.ts` — shared Settings component mounted in all dashboard themes.
- `docs/platform-settings-navigation.md` and `docs/mvp-progress.md` — scope, implementation and limitations.

## Validation

Source-level review only. No build, browser tests, GitHub Actions or VPS validation were run, as requested. Angular compilation, template rendering, route refresh behavior and role-specific access must be verified in the VPS environment.
