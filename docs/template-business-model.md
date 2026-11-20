# Bee-Core template and website business model

Status: product decision and target architecture, 2026-11-20  
Implementation baseline: `main` before this specification. This document distinguishes current foundations from work still required.

## Product structure

Bee-Core has three independent presentation surfaces. They must not share ownership or configuration accidentally.

| Surface | Owner | Selection authority | Content source |
|---|---|---|---|
| Platform corporate website | Bee-Core platform | Platform superadministrator only | Predefined platform pages and content shipped/managed by Bee-Core |
| Tenant public website | Individual tenant/company | Tenant owner/admin, subject to platform policy | Tenant profile plus capabilities contributed by that tenant's installed plugins |
| Tenant dashboard | Individual tenant/company | Tenant owner/admin, subject to platform policy | Core dashboard plus enabled plugin navigation, routes, widgets and actions |

A template package changes presentation and layout. A business plugin adds business capabilities and content. They are separate product types, catalogs, installation records and lifecycle concerns.

## 1. Dashboard templates

- A company selects and installs one dashboard template at a time.
- Every dashboard template defines its own fixed, reviewed design system: colors, typography, spacing, surfaces, borders, component treatment and responsive behavior.
- Arbitrary color pickers, free-form hex values, CSS token editors and tenant-defined palettes are not part of the product.
- Each dashboard template supports at least two appearance modes: `light` and `dark`. The mode changes the template's predefined token set; it does not let a user invent a palette.
- Appearance mode is a tenant dashboard preference and is independent of template selection. Switching templates preserves the selected mode where the new template supports it; otherwise it falls back to that template's documented default.
- The dashboard shell remains responsible for global navigation, company context, account controls and plugin outlets. Plugins contribute approved routes, navigation items and components through registered slots; they do not replace the shell.
- A template must declare supported modes, default mode, target surface, version, layout key, slots and compatibility.

## 2. Bee-Core corporate website

- The canonical platform website is served on the configured base host, currently `beecore.beeprojects.net`.
- The platform superadministrator can install, preview and select a platform website template.
- The selection is global to the Bee-Core platform; tenant administrators cannot change it.
- The current corporate page structure, copy, navigation, calls to action and platform-owned content remain predefined. Selecting a template changes the visual presentation, not the business content or page inventory.
- Corporate content editing/CMS functionality is explicitly outside this template-selection feature.
- Platform template settings must be stored separately from tenant `template_preferences`; a tenant must never be able to overwrite the platform's website selection.

## 3. Tenant public websites

- Each tenant's public site is resolved by its assigned subdomain or verified custom domain.
- Tenant website template installation and selection are independent of the dashboard template.
- The tenant website is assembled from a stable public shell and the public capabilities of plugins installed and enabled for that tenant.
- Plugins may contribute only through declared, reviewed public slots/capabilities (for example: hero, about, services, catalog, booking/contact, testimonials or footer). The actual slot contract must be versioned and validated; these examples are not a promise that every slot already exists.
- The public renderer must not expose private dashboard components, internal IDs, member data, secrets, tenant settings or plugin data that is not explicitly public.
- Installing/enabling a plugin may add its public section, page or route. Suspending/uninstalling a plugin removes its public contribution while preserving tenant business data according to the plugin lifecycle policy.
- If a tenant has no public-capable plugins, render the selected template's neutral tenant landing/empty state with safe tenant identity details; do not invent business content.
- Tenant admins control their tenant's website template and plugin capabilities, not the Bee-Core corporate website.

## Template package lifecycle and safety

- Templates are installable, versioned presentation packages. Business plugins remain independently installable products with their own entitlements, permissions, migrations, data and lifecycle.
- The MVP may ship trusted templates compiled into the Angular application. A catalog entry is not permission to execute arbitrary uploaded JavaScript, HTML or Angular bundles.
- Template installation must validate package ID, target surface, version/runtime compatibility and tenant/platform scope.
- Only one active template per surface and scope is allowed. A template cannot be uninstalled while active; switch first, then uninstall.
- Preview is non-persistent. Apply/publish persists the selection and broadcasts the update only to the relevant scope.
- Platform events/settings are platform-scoped. Tenant events/settings are tenant-scoped and must revalidate the current session and membership.
- Template selection, appearance mode and installed package state must never cross tenant boundaries.

## Target preference model

The target logical model is:

```ts
type DashboardAppearanceMode = 'light' | 'dark';

interface PlatformTemplateSettings {
  websiteTemplateId: string;
  version: number;
}

interface TenantTemplatePreferences {
  tenantId: string;
  dashboardTemplateId: string;
  dashboardAppearanceMode: DashboardAppearanceMode;
  tenantWebsiteTemplateId: string;
  installedTemplateIds: string[];
  version: number;
}
```

This is the target contract, not a claim that the current MongoDB schema/API already implements every field. Existing `public` / `dashboard` preference fields require a deliberate migration: legacy tenant `public` becomes `tenantWebsiteTemplateId`, and legacy `dashboard` becomes `dashboardTemplateId`. The platform corporate selection must be introduced in a separate platform-owned record and must not be inferred from any tenant's legacy preference.

Legacy custom theme-token storage and endpoints are transitional compatibility only. The product UI must not expose arbitrary color editing. Once all clients have migrated to template-owned palettes and appearance modes, remove token writes, token restoration, token SSE payloads and obsolete MongoDB fields through a versioned migration.

## Acceptance criteria

1. A tenant admin can install, preview, apply and uninstall an eligible dashboard template.
2. Every dashboard template offers light and dark modes using only its own fixed palettes; there is no color picker or custom CSS/token editor.
3. Dashboard template and appearance mode persist per tenant and update only that tenant's connected clients.
4. A platform superadmin can select the corporate website template globally; tenant admins cannot read/write that setting.
5. The corporate site keeps its existing predefined content regardless of the selected template.
6. Each tenant can independently install/select a public website template.
7. Tenant public sections are composed only from that tenant's installed/enabled plugins that explicitly declare public contributions.
8. Public output is allowlisted and tenant-scoped; private plugin routes/data never leak into the public site.
9. Template packages remain separate from business plugins, plans and plugin entitlements.
10. Migrations preserve existing tenant template selections and never promote a tenant selection into the global platform setting.

## Current implementation versus target

Already present in the repository before this specification:
- Angular template registry with `public` and `dashboard` targets.
- Built-in Aurora/Editorial public and Midnight/Paper dashboard entries.
- Trusted compiled Studio and Glass package entries and tenant install/uninstall APIs.
- Tenant-scoped template preferences, host-resolved public template snapshots and scoped template SSE.
- Public/dashboard slot registry for trusted compiled Angular plugin contributions.
- Platform superadministrator foundation and hostname-based tenant public landing resolution.

Still required to fulfil this business model:
- Split the current generic `public` target into platform-corporate and tenant-public scopes, with separate storage, authorization, catalog filtering and event channels.
- Move corporate template selection into platform-superadmin controls only.
- Make tenant public composition driven by explicit public capabilities of installed/enabled plugins.
- Add persisted per-tenant dashboard `light`/`dark` appearance mode and define the mode contract for every dashboard template.
- Remove legacy custom token editing and then retire its API/storage/SSE fields with a safe migration.
- Complete public-data allowlisting and cross-tenant/public-renderer security review.
- Add real structural layouts for each package only through trusted, versioned Angular code; the current installer primarily installs metadata/styles and does not dynamically download arbitrary layouts.

No test or CI result is implied by this specification.
