# Bee-Core Settings sections

**Base:** `main`

## Navigation and routes

Settings remains one expandable destination in the primary dashboard navigation. It contains eight role-filtered sections:

- General — `/dashboard/settings/general`
- Tenants — `/dashboard/settings/tenants`
- Roles & Permissions — `/dashboard/settings/roles-permissions`
- Platform Users — `/dashboard/settings/users`
- Plugins — `/dashboard/settings/plugins`
- Plans & Licensing — `/dashboard/settings/plans-licensing`
- Infrastructure — `/dashboard/settings/infrastructure`
- Localization — `/dashboard/settings/localization`

The legacy base URL `/dashboard/settings` resolves to General. The retired `/dashboard/settings/security` destination is no longer registered; stale direct navigation falls back to the dashboard.

## Section ownership

- **General:** platform identity, appearance and defaults.
- **Tenants:** existing platform tenant directory and management component; Super Administrator only.
- **Roles & Permissions:** global permission catalogue, system roles and tenant delegation boundaries.
- **Platform Users:** global user administration and company membership onboarding.
- **Plugins:** authenticated marketplace-backed catalogue and details view.
- **Plans & Licensing:** plan catalogue, pricing, subscriptions and license entitlements.
- **Infrastructure:** runtime/services, storage, queues, logs and backup operations.
- **Localization:** languages, regions, currencies, timezone and regional formats.

The standalone placeholder Security workspace was removed because it displayed unavailable policy fields without a Settings persistence API. This does not remove or weaken the existing authentication, MFA, session, authorization or audit implementations. Audit events remain in Activity; role and permission governance remains in Roles & Permissions.

For operational areas without persisted settings APIs, fields remain explicitly unavailable; no local-only form or fake save behavior is presented.

## Role visibility and scope

- Super Administrator: all eight sections, platform scope.
- Tenant owner/admin: General, Plugins and Localization, tenant scope.
- Tenant manager/member: Localization only.
- Existing server-side authorization remains authoritative; hiding a navigation entry does not grant backend access.
- Tenant directory remains separate from tenant-scoped General. Platform identity/default settings are not silently written to a tenant, or vice versa.

## Files

- `apps/web/src/app/app.component.ts` — canonical routes, role visibility and Settings navigation.
- `apps/web/src/app/settings/settings-workspace.component.ts` — shared Settings workspace and section content.
- `apps/web/src/app/templates/packages/{midnight,glass,paper}/pages/dashboard.component.ts` — shared Settings component mounted in all dashboard themes.
- `docs/platform-settings-navigation.md` and `docs/mvp-progress.md` — scope, implementation and limitations.

## Validation

Source-level review only. No build, browser tests, GitHub Actions or VPS validation were run. Angular compilation, route refresh behavior and role-specific navigation must be verified in the VPS environment.
