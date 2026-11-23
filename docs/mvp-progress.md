# Bee-Core MVP progress

Updated: 2026-11-23 — **Organization → Users** uses the same membership manager in Glass, Midnight and Paper for the Super Organization and all Tenants. Guest is a built-in restricted role (`plugins.read` only). The Super Organization migration creates a system organization, moves legacy platform superadmins into reserved `super_admin` memberships, suspends their previous tenant memberships, updates their active organization and revokes old sessions for re-authentication. Global platform routes authorize only an active `super_admin` membership in the Super Organization. The encrypted TOTP secret, one-time recovery codes, login MFA challenge and 15-minute privileged-action MFA freshness check are retained. API responses keep a temporary `platformRole` compatibility field for the existing Angular shell; the database identity source is the membership. Build, integration tests and browser QA are pending; this change must not be considered production-verified. Temporary-password user creation and email-delivered invitations remain future work.

## How progress is measured

The percentages below measure distinct product capabilities, not the number of passing workflows or PRs. Each capability is counted once. Re-running backend, Angular or Docker regression suites protects existing work but does not increase implementation progress.

- **MVP capability implementation: 92.15% (92% rounded).** Re-audited against the Docker-installable MVP 0.1 acceptance boundary, not the entire commercial SaaS roadmap. The earlier score incorrectly treated deferred commercial features (payment-provider checkout, arbitrary third-party archive distribution and remote Angular bundles) as incomplete MVP capabilities even though the current trusted, statically bundled plugin model already delivers the MVP workflows. This score counts implemented and tested MVP capabilities once; remaining production and SaaS work is reported separately below.
- **Release readiness: 72% (provisional; unchanged).** This is deliberately lower because production hardening, full tenant-route review, encrypted off-site backup operations, TLS/monitoring and some release gates remain incomplete.

## Capability breakdown (current `main`)

| Capability | Weight | Estimated completion | Evidence / remaining scope |
|---|---:|---|
| Core runtime, Fastify, plugin registry/lifecycle and event bus | 10% | 95% | Runtime, dependency-aware startup, lifecycle hooks and event bus are implemented; richer package runtime and process-level isolation remain. |
| MongoDB persistence and Docker foundation | 10% | 95% | MongoDB persistence, tenant indexes, production Compose, health checks, persistent volumes and restore drill are implemented; operational hardening remains. |
| Authentication and sessions | 10% | 93% | Login, JWT, refresh rotation/replay rejection, persisted sessions, logout, live membership/role revalidation and stale-role regression coverage; MFA, account recovery, verification and advanced rate limiting remain post-MVP hardening. |
| Companies, memberships and roles | 15% | 94% | Multi-company membership, active company switching, built-in/custom roles, owner-only role administration, invitations, permissions, quotas, audit and session revocation; owner transfer and exhaustive route audit remain. |
| Angular public/dashboard/auth UI | 10% | 92% | Mobile-first public/dashboard/auth shells, company switching, member management, marketplace, plugin outlet and lifecycle progress are implemented and exercised in browser/full-stack CI; broader business-plugin UX remains. |
| Template engine | 10% | 93% (legacy scope) | Existing tenant-scoped public/dashboard registry, package installation, preferences and SSE remain. The newly defined product model adds separate platform-corporate, tenant-public and dashboard scopes plus dashboard light/dark mode; these are not yet fully implemented. Arbitrary remote structural Angular bundles remain outside the trusted MVP model. |
| Marketplace and entitlements | 10% | 90% | Company-filtered catalog, Starter/Pro/Enterprise plans, trial, purchases, subscription webhooks, entitlement/dependency checks, quotas and dashboard controls are implemented; provider checkout, invoices and customer billing portal remain commercial SaaS work. |
| Plugin lifecycle and package ecosystem | 15% | 93% | Trusted manifests, strict dependency/path/duplicate validation, deterministic dependency ordering, durable install/update/uninstall jobs, lease renewal, stale-worker rejection, bounded retries, tenant-scoped status, Angular progress and migration compensation after lifecycle-hook failures; immutable third-party archives, signature verification and remote frontend registration remain. |
| Tenant isolation and security | 5% | 84% | Live server-resolved tenant context across auth, template and organization administration, TenantCollection, cross-company IDOR tests, private tenant files, scoped lifecycle jobs and ownership-mutation protection; exhaustive route, webhook and asynchronous-path audit remains. |
| Production operations and release packaging | 5% | 82% | Production Compose build/start/health, host-port isolation, Mongo/session persistence and automated MongoDB dump/isolated-restore sentinel round-trip; encrypted off-site backup retention, TLS, monitoring and final clean-install release gate remain. |

The weighted capability score is **92.15%** (92% rounded). The broader SaaS plugin-platform roadmap remains approximately **67%** because immutable third-party package distribution, cryptographic publisher trust, payment-provider integration, dynamic frontend registration and universal tenant-isolation review extend beyond the Docker-installable MVP. The score is an engineering estimate of distinct MVP capabilities, not test coverage or production readiness.

## Verified on `main`

- PR #1 — MongoDB migration.
- PR #3 — public/dashboard/auth UI foundation.
- PR #4 — Angular migration.
- PR #5 — full-stack CI foundation.
- PR #7 — production Docker Compose overlay and deployment guide.
- PR #8 — tenant cross-company IDOR mutation regression tests.
- PR #10 — tenant-scoped audit-log regression test.
- PR #17 — persisted custom company roles, tenant permission resolution, owner-only management, assignment and session revocation.
- PR #18 — tenant-scoped successful login/logout audit events.
- PR #19 — production Compose CI, port isolation, stack health and refresh-session persistence across MongoDB/API restarts.
- PR #20 — tenant-scoped audit events for invitations, custom roles, membership changes/suspension, plugin lifecycle and permission denials.
- PR #22 — private template SSE session and active-membership revalidation; post-merge backend/full-stack CI run `44765696476` and production Compose run `44765696509` passed on `15faa3b`.
- PR #23 — durable company-scoped installation jobs, active-job deduplication, lease recovery, bounded retries, tenant-scoped job status and Angular installation progress. Backend/MongoDB, Docker full-stack and Angular browser smoke checks passed before merge; post-merge backend/full-stack run `44767972917`, Angular run `44767972896` and production Compose run `44767972871` all passed on `67986b5`.
- PR #27 — durable asynchronous uninstall, lifecycle-operation conflict prevention, `uninstalling` state recovery, tenant-scoped job status, deduplicated requests, preserved company data and Angular progress. Pre-merge backend/full-stack and Angular browser checks passed on `b9f8136`; post-merge backend/full-stack run `44770367394`, production Compose run `44770367267` and Angular browser-smoke run `44770367382` all passed on `4ad792c`.
- PR #32 — automated MongoDB logical dump, isolated restore, sentinel verification and temporary-database cleanup. PR-head production Compose run `44777108094` and post-merge run `44777925729` passed.
- PR #33 — template/domain write authorization now uses the live tenant membership role; stale JWT `admin` claim regression test. Backend/auth and Docker full-stack checks passed on PR head `858d044`; post-merge CI and production Compose passed on main SHA `02e7766` (runs `44778714998` and `44778715071`).
- PR #34 — migration compensation after lifecycle-hook failures, reverse-order rollback and persisted rollback failures; plugin manifest validation for semantic dependency ranges, duplicate declarations and unsafe paths; lifecycle worker lease renewal and rejection of stale worker completion. Backend/MongoDB and Docker full-stack CI passed on PR head `cb511cad`; post-merge backend/full-stack CI (`44779902641`) and production Compose (`44779902679`) passed on `a87db5d`.
- PR #35 — organization routes now carry the live server-resolved `TenantContext` for permission checks; stale JWT `owner` claim cannot create company roles. Backend/auth and Docker full-stack CI passed on exact PR head `09237c13`; post-merge backend/full-stack CI (`44780741763`) and production Compose (`44780741842`) passed on exact main SHA `d69b09e`.

PR #20 passed backend typecheck/build/MongoDB auth tests and Docker Compose full-stack integration. The dedicated Angular workflow was correctly skipped because no Angular files changed; Angular was built and exercised within the full-stack workflow. Post-merge checks passed on `1c96e8100d2145f518a0232d300122c866551c1b`: backend and full-stack CI run `44764328710`, plus production Compose run `44764328866`.

PR #19's production Compose workflow also passed on its reviewed PR head, including the production overlay validation.

## Why progress appeared stuck

1. PRs #12, #13 and #14 were stacked on old security branches. Each later PR included earlier commits and old copies of the audit/role foundation already integrated by PRs #17 and #18. Comparing their heads directly with `main` showed 12 commits behind and duplicated foundation files. Merging them unchanged would reintroduce stale code.
2. PR #9 repeats deployment files/workflow already superseded by PR #19 and is marked dirty against `main`.
3. PR #6 repeats the original custom-role/audit foundation, now superseded by PR #17/#18, and is marked dirty.
4. Every PR reruns the same broad regression workflows. Those runs are valuable gates, but repeated green CI does not represent new product functionality.
5. The former progress percentage had no published weighting and described already implemented marketplace/install/template foundations as remaining work.

PR #20 selectively ported the unique audit functionality onto current `main`, rather than merging the stacked branches wholesale.

## Active next work

1. Complete package archive signature/digest verification and trusted publisher key management; migration compensation and worker lease recovery are now covered.
2. Complete tenant-isolation review across remaining protected routes, file/media paths, webhooks and background tasks; PRs #33 and #35 close stale-JWT authorization gaps in template and organization administration.
3. Implement immutable signed package archives, signature/digest verification and manifest-driven dynamic frontend registration.
4. Add payment-provider integration, checkout/subscription management and billing reconciliation.
5. Complete TLS, encrypted off-site backup retention/monitoring, production runbook and final clean-install release gate; MongoDB dump/restore mechanics are now covered by CI.
6. Build and validate the `hello-world` reference plugin against the final manifest and tenant lifecycle contract.
7. Tag `0.1.0` only after all release gates pass.

## Links

- Repository: https://github.com/alexandre-aparicio/Bee-core
- PR #17: https://github.com/alexandre-aparicio/Bee-core/pull/17
- PR #18: https://github.com/alexandre-aparicio/Bee-core/pull/18
- PR #19: https://github.com/alexandre-aparicio/Bee-core/pull/19
- PR #20: https://github.com/alexandre-aparicio/Bee-core/pull/20
- PR #29: https://github.com/alexandre-aparicio/Bee-core/pull/29
- PR #30: https://github.com/alexandre-aparicio/Bee-core/pull/30
- PR #31: https://github.com/alexandre-aparicio/Bee-core/pull/31
- PR #32: https://github.com/alexandre-aparicio/Bee-core/pull/32
- PR #33: https://github.com/alexandre-aparicio/Bee-core/pull/33
- PR #34: https://github.com/alexandre-aparicio/Bee-core/pull/34
- PR #35: https://github.com/alexandre-aparicio/Bee-core/pull/35
- Actions: https://github.com/alexandre-aparicio/Bee-core/actions

- PR #29 — prevents tenant ownership mutation through MongoDB update operators, including operator-based and nested-path changes.
- PR #30 — durable tenant-scoped plugin update jobs, entitlement/permission rechecks, migration-aware updates, crash recovery around version switching, audit events and Angular update progress. Backend/full-stack and Angular checks passed before merge.
- PR #31 — deterministic transitive dependency-first ordering, rejection of missing dependencies and cycles, dependency entitlement/installation checks on install/update, and end-to-end marketplace update coverage. Pre-merge CI run `44774469128` passed; post-merge CI `44774847013` and production Compose `44774847047` passed on main SHA `4dce576`.
- PR #32 — automated MongoDB logical dump, isolated restore and sentinel verification in production Compose CI. PR-head run `44777108094` and post-merge main run `44777925729` passed on `b2cbc63`.


## Platform Superadministrator (PR #43 — merged into main)

Platform-wide superadministrator foundation is merged into `main` at `53a427c`. It is not included in the MVP capability completion percentages pending focused verification and acceptance review.

- Persisted bootstrap `platformRole: superadmin`, with existing bootstrap credentials preserved.
- Auth JWT/login/refresh profile carries the platform role.
- Separate platform-admin plugin validates dashboard client, JWT session, persisted active refresh session, enabled user and persisted superadmin role.
- Global company list/create/status endpoints and Angular panel are added.
- Integration test added for superadmin bootstrap, company create/list/activate/suspend and tenant-user denial.
- Validation at merge: backend TypeScript check and build passed; Angular CI passed; Docker Compose full-stack integration passed (API/plugin registry, Nginx proxy, auth and refresh rotation). Backend auth integration test job was still running at merge time and is pending follow-up verification.
- Details: `docs/platform-superadmin.md` and PR https://github.com/alexandre-aparicio/Bee-core/pull/43.
- Main merge commit: `53a427cfd4419d0fd658f7715553ed60e96684d5`.


## Dashboard navigation and Settings reorganization (in progress)

- Dashboard content is split into sections: Dashboard, Plugins, Organization, Activity, Settings, and Platform Administration.
- Platform Superadmin menu omits tenant Organization management and exposes platform/global company controls plus additional platform sections. Owners, admins, managers and members see reduced menu sets; members retain Organization to accept invitations.
- Menu visibility is a frontend convenience only; backend permission checks remain authoritative.
- Theme controls moved from the public footer to authenticated Settings routes: Dashboard Theme, Public Theme, and Branding. The theme manager accepts a target and filters the trusted package catalog.
- The color-token palette remains shared between public and dashboard surfaces in this first pass; independent palettes are a follow-up. Domain, integrations, security, and system pages are navigation placeholders only.
- Pending verification: Angular compile, browser smoke, and role-based navigation tests. This PR is not merged.


## Nginx Proxy Manager host-port integration (2026-11-20)

- Production Compose now binds only the Bee-Core web/Nginx container to host TCP port `3011` by default, configurable through `BEE_WEB_PORT`.
- Production API port bindings remain reset/disabled; the API is exposed only on the private Compose network at port `3000`. MongoDB remains unpublished.
- Updated `.env.production.example` and `docs/mvp-deployment.md` with the dedicated port and Nginx Proxy Manager forwarding instructions. Existing NPM continues to own public ports 80/443.
- GitHub main commits for this change: `7b44ba7` (Compose), `b0c37f5` (environment example), `cb838ae` (deployment guide).
- Not yet validated on the target VPS: confirm TCP 3011 is unused, run Compose config/startup, and test the NPM proxy host/TLS route. Do not count VPS deployment or end-to-end proxy validation as complete yet.


## Tenant subdomain routing (2026-11-20)

- Added a shared tenant-domain helper for normalized/validated slugs, reserved names and strict one-label subdomain parsing.
- Organizations startup now backfills slugs for legacy tenants and enforces a unique sparse slug index. Company creation accepts an explicit slug or derives one from the company name.
- Added unauthenticated `GET /public/tenant`: the configured base host resolves to the corporate site; a tenant subdomain resolves to a minimal public-safe tenant profile; unknown and suspended tenants return 404. Exact custom domains already stored in a tenant's `domains` array are also resolved.
- Host resolution uses Fastify's request hostname and does not trust arbitrary `X-Forwarded-Host`. The bundled web Nginx forwards the original `Host` header to Fastify.
- Platform superadmin company creation now accepts/displays a slug; Angular public UI resolves the current hostname and renders the tenant landing page with its name and tenant ID.
- Added unit coverage for slug normalization, reserved/invalid slugs and host parsing.
- Configured `PUBLIC_BASE_DOMAIN=beecore.beeprojects.net` in the production example and documented wildcard DNS, NPM proxying and wildcard TLS.
- Main commits for this implementation: `8fc084f`, `3251b23`, `a3a07e5`, `6d456f2`, `3f61dcc`, `7cd9028`, `87c053d`, `e3e9c7e`, `5eb1ed3`, `a7b70d3`.
- Validation status: source changes are integrated, but CI has not yet been confirmed for this exact set of commits and the live VPS/NPM/DNS path has not been exercised. Do not treat the tenant subdomain flow as deployment-verified until those checks pass.


## Template business model revision (2026-11-20)

The product model is now specified in `docs/template-business-model.md`.

- Three independent presentation surfaces are defined: global Bee-Core corporate website, each tenant's public website, and each tenant's authenticated dashboard.
- Only the platform superadministrator may select the corporate website template. Corporate content/navigation/page structure remain predefined and unchanged by template selection.
- Tenant public templates are independently installable/selectable. Their content is intended to be composed from explicitly public capabilities of that tenant's installed/enabled business plugins.
- Dashboard templates own fixed palettes; arbitrary color pickers and tenant-defined colors are not part of the product. Each dashboard template must support light and dark appearance modes.
- The template manager's color-picker/token-editing controls have been removed. Template selection, preview and trusted package install/uninstall remain.
- This is a partial implementation: the current runtime still has legacy `public`/`dashboard` scopes and custom-token persistence/API/SSE code. The platform-corporate versus tenant-public storage/authorization split, persisted dashboard appearance mode, plugin-driven public-site composition and safe legacy-token migration remain pending.
- The business model is documented separately from business-plugin entitlements and lifecycle. Template packages are presentation packages, not plugins.
- No tests, builds or CI workflows were run for this change, as explicitly requested. Do not interpret the UI/documentation update as validation of the remaining architecture.


## Template appearance modes (2026-11-21)

- Added Light/Dark controls to the public landing header and authenticated dashboard header.
- Added Light/Dark controls to the template manager for public and dashboard surfaces.
- The mode is stored per selected template and surface in browser local storage. Public website preferences are scoped by hostname; dashboard preferences are scoped by active company.
- Aurora, Midnight and Glass default to Dark. Editorial, Paper and Studio default to Light. Users can switch either mode for every template.
- Added a shared light palette treatment for the corporate landing and dashboard shell; template-specific colors remain controlled by the template rather than user-editable color pickers.
- Scope limitation: appearance mode is currently a browser-local preference, not yet synchronized through the backend across devices. The public landing mode is per hostname and dashboard mode per active company in that browser.
- No tests, builds or workflows were run for this change, per user instruction.


## Hola Mundo tenant plugin (2026-11-21)

- Added the trusted `hello-world` package to the tenant plugin catalog and included it in Starter, Pro and Enterprise plans.
- Added the statically bundled Angular component to the trusted frontend registry.
- Tenant owners/admins can activate/deactivate it through the existing marketplace lifecycle controls.
- Added platform-superadmin endpoints and company-list controls to manage the plugin independently for each tenant through durable install/uninstall jobs.
- Added a host-resolved public endpoint that returns only enabled plugin IDs; tenant landing navigation shows `Hola Mundo` and `/hello-world` renders its public page only while enabled.
- Added `docs/hello-world-plugin.md`.
- No tests, builds or GitHub workflows were run, per user instruction. The code has not been runtime-validated on the VPS.


### Tenant public plugin page and navigation
- The tenant public website now uses a full-viewport public-site shell instead of the centered authentication-card layout.
- The first enabled public plugin page is **Hola Mundo**. Its navigation item is rendered only when the tenant's public plugin list contains `hello-world`.
- Tenant public navigation uses the History API for the home and Hola Mundo links. Changing between these views updates the page content without reloading the document or recreating the shared site header/footer.
- Browser back/forward navigation updates the active tenant page as well.
- The tenant shell retains its public template layout class, Light/Dark control, and tenant-specific public appearance scope.
- No tests, builds, or GitHub Actions workflows were run for this change, as requested. Runtime verification remains pending after deployment.


## Template package source separation (2026-11-21)

- Six first-party template packages now live under `apps/web/src/app/templates/packages/`: Aurora, Editorial, Studio, Midnight, Paper and Glass.
- Every package has its own manifest (including its Angular component key), fixed semantic palette, standalone Angular layout wrapper, package stylesheet, asset directory with a preview SVG, and package README.
- The package barrel exports the six manifests, all six palettes and all six layout components. The template engine imports its catalogue from that barrel.
- The public and dashboard page trees now select the matching registered layout component. The Glass dashboard branch is explicitly supported.
- Template-specific layout CSS has been removed from the global `apps/web/src/styles.css` and moved into the corresponding package stylesheet. Shared Light/Dark behavior is isolated in `templates/core/appearance-modes.css`; shared application foundation, navigation, page content and plugin slots remain in the core.
- The global stylesheet no longer contains the six template-specific layout selectors; the page shells and content composition remain shared and are projected into the package layout wrappers. Therefore this is a completed folder/source/style separation, but not yet six independently authored page compositions. A future step can move each public/dashboard page tree into its package if the templates must have completely different markup.
- Template packages remain trusted, statically compiled Angular components. Tenant installation enables a registered package; it is not arbitrary runtime code upload or dynamic execution.
- No tests, builds, GitHub Actions workflows or deployment checks were run, per explicit instruction. The changes are committed to `main`, but compile/runtime correctness has not been verified.


## Template build-source corrections (2026-11-21)

- Restored the explicit default selection in `template-engine.service.ts` (`aurora` for public and `midnight` for dashboard). The package-registry refactor had removed the constant while leaving its fallback references, causing the Angular TypeScript errors reported during the VPS image build.
- Repaired three orphaned CSS rules in `styles.css`: the template-manager responsive rule, the empty template-slot display rule, and the template-manager catalog layout selector. These were left behind by the prior CSS extraction and generated CSS parser warnings.
- These are source-level corrections only. No build, tests, or GitHub Actions workflows were run here. The user's next VPS build is still required to confirm the reported failures are resolved.
- The six packages are not yet 100% composition-independent: their page markup/navigation and plugin composition still live in `app.component.html`. Do not begin plugin package separation until public and dashboard page composition has been moved behind the template package boundaries and the shared core only supplies runtime context/contracts.


## Template page composition extraction (2026-11-21)

- Moved the tenant public and corporate public page markup into package-owned Angular page components for Aurora, Editorial and Studio under each package's `pages/public.component.ts`.
- Moved dashboard composition markup into package-owned Angular components for Midnight, Paper and Glass under each package's `pages/dashboard.component.ts`.
- The package-owned public components contain the tenant and corporate variants; package-owned dashboard components preserve the dashboard navigation, company switching, section routing, marketplace, plugin outlet, membership, audit, platform administration, template settings and registered slots.
- `app.component.html` now selects a package page component and keeps the core-level authentication/loading/tenant-resolution branches. Template package layout components still wrap the page compositions for package styles and appearance modes.
- Updated each template manifest's `componentId` to its package-owned page component.
- This completes the first source boundary extraction, not visual redesign: the six page components currently start from copied compositions and are independently editable, but have not yet been redesigned into distinct layouts. The core still selects components with explicit Angular branches; dynamic manifest-driven component rendering is not implemented.
- No build, tests, workflows or VPS runtime validation were run. Compilation and runtime behavior remain unverified.


## Distinct dashboard and tenant-public designs (2026-11-21)

- Redesigned the three tenant-public template compositions (Aurora, Editorial and Studio) with separate page structures and package-scoped component styles. Their tenant welcome and enabled `hello-world` plugin routes are preserved; the corporate landing fallback remains in each public component.
- Redesigned the three dashboard shells (Midnight, Paper and Glass) with different navigation/shell composition, responsive layout and visual treatments. The shared dashboard section content and actions are retained inside the package-owned shell, including plugin marketplace/outlet, organization members, audit log, appearance manager and platform admin access.
- This is a source-level implementation only. No build, test, GitHub workflow, or VPS runtime check was executed, so compilation and visual rendering are not verified.


## Template markup repair (2026-11-21)

- Replaced malformed Angular/HTML template strings in all six package-owned public/dashboard page components. Corrected unbalanced tag closures and broken control-flow/template nesting introduced by the earlier copy-and-edit step.
- Public tenant pages keep tenant name, Home/Hello World navigation (when enabled), theme toggle, and Hello World content. Corporate fallback remains, but is simplified to a clean valid structure rather than the copied marketing page markup.
- Dashboard page shells keep company switching, grouped navigation, theme toggle, and primary sections for dashboard, plugins/marketplace + outlet, organization, activity, appearance/template manager and platform admin. This repair simplifies some placeholder content and does not claim the former copied dashboard markup was preserved verbatim.
- Source changes only; no build, tests, workflows or VPS runtime validation were performed. Compilation remains unverified until the user runs the build.


## Angular build errors from tenant/dashboard templates (2026-11-21)

- Repaired the root `app.component.html` control-flow structure and formatted the template branches to remove the unclosed `@else` parser error.
- Removed the extra Angular block closure after the platform-admin condition in Midnight, Paper and Glass dashboard templates that caused NG5002.
- Removed imports from AppComponent that were no longer directly used after page composition moved to package components.
- Corrected the Editorial page component closing tag in the root template.
- The reported build warnings were likely cascading from template parse errors, but the build has not been rerun; warning cleanup and successful compilation are not yet confirmed.


## Dashboard CSS selector mismatches (2026-11-21)

- Reviewed Glass, Midnight and Paper dashboard package components after the user reported the header/sidebar styles were not applying correctly.
- Fixed the outer dashboard selector mismatch: `gd-dashboard` / `md-dashboard` / `pd-dashboard` now match the CSS root selectors (previously `glass-dashboard` / `midnight-dashboard` / `paper-dashboard`).
- Replaced stale header selectors (`gd-top` / `md-top` / `pd-top`) with selectors matching the actual `<header>` elements inside each main region.
- Added explicit header button and sidebar group-heading/logout styles to each package so they do not depend on the global dashboard class system.
- Source edits committed directly to `main`; source was fetched back to confirm selectors. No build, tests, workflows or VPS validation performed.


## Tenant public template CSS/markup alignment (2026-11-21)
- Reviewed Aurora, Editorial and Studio tenant-public page components after the report that changing the public template did not visibly change the page.
- Found the three tenant-public components had nearly identical page markup while their package styles targeted different, absent child structures (for example Editorial expected article/lead elements and Studio expected a card layout that were not rendered).
- Rebuilt tenant-public page composition and matching component-scoped styles for Aurora (dark atmospheric hero and accent orb), Editorial (typographic long-form layout), and Studio (split hero, graphic panel and feature cards). These are intentionally distinct page compositions rather than palette-only variations.
- Preserved tenant name, Home navigation, conditional Hello World link/page, theme toggle, and header/footer template slots. Corporate fallback remains in each component.
- Direct commits to main: Aurora `16dc9c6`, Editorial `3ad7b55`, Studio `ee44a06`.
- Source edits only. No build, tests, workflows, or VPS visual validation performed; verify the Angular compile and actual browser appearance after deployment.

## 2026-11-21 — Platform Administration company directory and login recovery

- Reworked Platform Administration into a company directory with card and list views.
- Moved company creation into a modal opened from the view toolbar.
- Added a vertical actions menu to each company: Disable and Message remain intentionally disabled; Manage opens `/dashboard/platform/:tenantId/manage`.
- Added a tenant management view with company identity, subdomain, member count, status, and the existing platform-level status / Hola Mundo controls.
- Restored login route priority in the root template and added dashboard session validation against `/api/auth/me`; missing or expired sessions are cleared and redirected to `/login`.
- Updated Midnight, Glass, and Paper dashboard templates to connect the company management route.
- Added Playwright coverage for the card/list switcher, disabled menu actions, tenant management navigation, company creation modal, and unauthenticated dashboard redirect.
- Validation status: source and E2E test changes committed on a feature branch; Angular build and Playwright suite have not been run in this environment.


## Session-bound resource ID migration (2026-11-21 — foundation only)

- Created the shared AES-256-GCM resource-reference codec in `src/core/session-id.ts`. References use a fresh nonce, carry a resource type, the issuing session ID and its expiry, and are cryptographically bound to a key derived from the server secret and session ID.
- Added convenience functions for tenant, plugin and user IDs, plus generic support for memberships, roles, invitations, files, notes and jobs.
- Added unit tests for cross-session rejection, per-call uniqueness, type substitution, tampering and expiry.
- Added `docs/session-resource-ids.md` with the contract and mandatory integration requirements.
- This is deliberately **not marked complete**: API route inputs/outputs, JWT claims, public endpoints, Angular state/routes and plugin interfaces have not yet been migrated. The codec must not be treated as active protection until those integrations and cross-tenant tests are complete.
- Changes are on branch `feature/session-bound-resource-ids`; no build, test run, CI result or deployment verification is claimed.

## Platform Settings navigation — Agent 2 (2026-11-21)

- Added a single expandable Settings group to the Midnight, Glass and Paper dashboard sidebars, with the eight requested destinations: General, Tenants, Plugins, Integrations, Plans & Licensing, Security, Infrastructure and Localization.
- Enforced one expanded navigation group at a time through a shared `expandedMenuId` state.
- Applied role-based visibility: platform Super Admin sees all eight sections; tenant owners/admins see tenant-appropriate General, Plugins, Integrations, Security and Localization; tenant managers and standard members see Localization only.
- Added role-aware settings route handling, section titles/descriptions and consistent configuration-workspace presentation.
- Documented scope and role matrix in `docs/platform-settings-navigation.md`.
- Presentation/navigation only: no new backend settings endpoints or permissions are implied.
- No tests, Angular build, GitHub Actions workflows or deployment checks were run, per request. Compilation and visual behavior remain unverified.
- All changes are isolated on `agent-2/platform-settings-navigation`; no changes were made to `main`. Agent 2 will request explicit approval before any integration into `main`.

## Session-bound resource IDs — continued integration (2026-11-21)

This entry supersedes the earlier audit's "remaining" bullets where the corresponding vertical slices are now implemented on the feature branch. It does not claim the overall migration is complete.

Implemented on `feature/session-bound-ids-end-to-end`:
- JWT subject (`sub`) and tenant claim now both use typed, session-bound encrypted references. The tenant context resolver decrypts both only after loading the active persisted session and verifies the resulting user and tenant against that session.
- Removed acceptance of the legacy plaintext `tenantId` claim in `TenantClaims` / `resolveTenantContext`.
- Company switching now issues a masked user subject as well as a masked tenant reference. Logout resolves the subject from the session reference, including after refresh expiry rotation.
- Organization APIs mask company, user, role, invitation, membership and audit-event identifiers in responses and decode typed route/body references after session validation. Public tenant discovery exposes the public slug, not the MongoDB tenant ID.
- Platform Administration masks company, owner, plugin and lifecycle-job identifiers and rejects references issued to another session. Its Angular component now uses the plugin reference returned by the platform plugin catalog rather than sending the raw `hello-world` package ID.
- Angular company, member, invitation and marketplace flows continue treating returned IDs as opaque strings; marketplace UI behavior now identifies the Hello World package by its display name rather than comparing an opaque reference with the raw package slug.
- Marketplace masks tenant, plugin, dependency and lifecycle-job references; its routes decode plugin/job references within the authenticated session. The public installed-plugin list returns public package slugs only. Billing webhooks remain a separate authenticated server-to-server contract.
- Marketplace lifecycle-job responses now use an explicit public-field allowlist, excluding internal tenant/actor/worker data. Organization audit-event serialization masks known identifier fields nested inside metadata (including marketplace job IDs).
- File and note endpoints mask their resource IDs; note creator IDs are also masked. Tenant-scoped persistence continues to use internal IDs only.
- Updated authentication, organization, marketplace and platform-admin integration tests to use references issued for the relevant login session, including cross-session replay checks.
- Documented the deterministic per-session reference behavior: same resource/type/expiry yields the same reference within a session; a different session yields a different reference.

Validation items still pending after merge:
- Review every remaining plugin/API and browser boundary (including any dynamically registered plugin routes, event payloads, error metadata, and URL/query/body identifiers) for raw database IDs; the migration is not yet certified exhaustive.
- Add/finish focused coverage for session expiry/revocation, logout after refresh, malformed/tampered/wrong-type references, notes/files cross-session use, and all platform lifecycle operations.
- Run the full TypeScript build, unit/integration suites and CI. These have **not** been run from this environment; MongoDB-backed integration tests may require `MONGODB_TEST_URI`.
- Review the final diff for type errors and compatibility before marking PR #54 ready. No VPS deployment or production verification has been performed.

Current status at PR merge: the implementation is integrated in main for manual and automated validation. This does not mean the migration is certified or production-verified.


### Session-bound reference codec hardening (2026-11-21)

- Hardened the shared decoder against non-canonical Base64URL encodings, oversized references, malformed resource types, invalid session expiries and invalid decoded identifier payloads.
- Added a 1 KiB UTF-8 bound for internal identifiers and a 2 KiB bound for external references to prevent unbounded parsing work at API boundaries.
- Added unit cases for malformed/non-canonical and oversized references, plus empty and oversized identifiers.
- This is additional defensive validation, not evidence that the full test suite passes. GitHub Actions currently reports no workflow runs for the latest PR head; no local build/test runner or VPS validation has been executed in this session.


### Final review follow-up (2026-11-21)

- Reviewed the remaining core event bus, plugin manager/entitlement/job modules, audit log, auth SSE stream, files, notes, marketplace, organizations, Platform Admin and Angular audit/notes/plugin surfaces. Persistence-layer tenant/user/plugin/job IDs remain internal; the reviewed browser-facing routes serialize the resource references or public slugs. Template SSE payloads contain template selections/tokens rather than database identifiers; private stream tickets are single-use and revalidate the persisted session on heartbeat.
- Found and corrected a test-fixture mismatch: organization route IDs are opaque references, while direct MongoDB assertions must use the decoded internal tenant/resource IDs. Added a session-aware test helper and updated persistence assertions accordingly.
- Simplified `/auth/me` to reuse the already validated session context and avoid redundant session lookups/non-null assertions.
- This review is not a formal exhaustive proof for dynamically registered future plugin routes. Full backend/web build, unit/integration tests and VPS checks remain outstanding; no CI workflow run is associated with the latest head.


### Auth plugin secret-scope correction (2026-11-21)

- Final configuration-boundary review found that the plugin manager's auth allowlist omitted `jwtSecret`, while the auth plugin now requires that secret to sign and validate session-bound references. This would cause auth initialization to fail when mounted through the isolated plugin manager.
- Added `jwtSecret` only to the auth plugin's scoped configuration and added a plugin-manager regression assertion that auth receives it while the files plugin does not.
- This is a source-level correction; the regression test has not yet been executed. The latest PR head still has no associated GitHub Actions run, so this remains unverified until CI runs.

- Added an auth integration assertion that a previously issued company reference is rejected immediately after logout revokes its persisted session. This regression assertion is committed but remains unexecuted until CI runs.

### Invitation response reference test correction (2026-11-21)

- Final test review found one assertion comparing a company reference issued to the invitation creator's session with the reference returned to the invited user's separate session. Session-bound references must differ across sessions even when they represent the same tenant.
- Updated the integration test to decode the accepting user's returned company reference with that user's persisted session and compare the resulting internal tenant ID to the tenant created by the original session.
- This fixes the test's cross-session assumption and strengthens the intended isolation check. The MongoDB-backed test remains unexecuted; CI/build validation is still required.

### Dedicated session-reference secret isolation (2026-11-21)

- The final plugin-manager review found that the new ID codec is used by auth, organizations, marketplace, Platform Admin, files and notes, but the isolated plugin contexts did not receive a shared codec key. That would make those plugins fail initialization when mounted by the real plugin manager.
- Corrected the boundary by deriving a dedicated 256-bit `sessionIdSecret` from the root `JWT_SECRET` with HMAC-SHA256 and passing only that derived key to the six plugins that need to encode/decode resource references.
- The JWT signing secret is no longer included in any of those plugin-scoped configs. The plugins use the derived key; direct plugin tests retain a compatibility fallback to their explicitly supplied test secret.
- Updated plugin-manager regression assertions to verify that auth and files receive the same derived key and neither receives `jwtSecret`.
- This fixes a source-level initialization blocker. TypeScript, plugin-manager tests, MongoDB integration tests and GitHub Actions remain unexecuted; do not treat the change as validated until CI passes.


## Session-bound resource IDs — merged for validation (2026-11-21)

- PR #54 was merged into `main` at merge commit `af8736704d6fee4c120ec51b0f7c6310269f9e66`.
- The merge integrates session-bound opaque references across authentication, tenant context, organizations, Platform Administration, marketplace, files, notes, plugin configuration and the Angular clients.
- The plugin manager derives a dedicated `sessionIdSecret` from the root JWT secret and passes only that derived key to the six plugins that need the resource-reference codec; plugin-scoped configuration does not expose the JWT signing secret.
- The branch was synchronized with current `main` before merge. PR #54 is closed and merged.
- **Not yet validated:** no GitHub Actions workflow runs or combined status checks were reported for merge commit `af873670`. TypeScript checks, Angular build, unit/integration tests, Playwright, Docker and VPS manual validation remain pending.
- Next validation is to deploy/update the source on the VPS, run the build and tests there, exercise login/refresh/company switching/logout and cross-session/cross-tenant access, then fix any findings directly on `main`.
- Do not treat the merge as production deployment, successful compilation, passing tests, or complete security certification.


## First VPS build feedback after session-bound ID merge (2026-11-21)

- The user's first `docker compose up -d --build` after pulling main reached the backend TypeScript build and failed on two declarations: the auth plugin's tenant collection type omitted the already-used optional `slug` field, and Fastify's request type did not declare the platform-admin session context attached by its guard.
- Corrected the auth tenant collection type to include `slug?: string`.
- Added a Fastify module augmentation declaring the optional `platformSession` request property used by the platform-admin guard and handlers.
- Fix commits: `5730494` (auth tenant type) and `b37691f` (platform-admin request type).
- These are source-level TypeScript corrections. The user must pull the new commits and rerun the Docker build; successful backend/Angular builds and runtime behavior are not yet confirmed.

### Second VPS build feedback — platform-admin session narrowing (2026-11-21)

- The next VPS image build passed the previous `tenant.slug` and Fastify request declaration errors, then TypeScript reported that `request.platformSession` remains optional at call sites.
- Updated all platform-admin resource masking calls to use the session context only after the authorization guard succeeds (`req.platformSession!`). Each route returns immediately when the guard does not return an authenticated superadministrator; the guard assigns the session context before returning the user.
- Fix committed directly to `main`: `b5c6e3ee1b06823bfce646f464817c98b05efedd` (`fix(platform-admin): narrow authenticated session context`).
- Still unverified: the next full Docker build, container startup/health, automated tests, and VPS functional flows.


### VPS 414 URI-length issue — compact resource references (2026-11-21)

- The platform-admin company plugins request returned HTTP 414 when the encrypted company reference was embedded in the URL path.
- Replaced the verbose JSON reference payload with a compact binary payload containing version, resource type, expiry and UTF-8 resource ID. The session ID is bound through the per-session derived AES-256-GCM key rather than repeated inside the encrypted payload.
- New references use format version 2 and are URL-safe; old version-1 references are intentionally rejected and must be refreshed by reloading/re-authenticating after deployment.
- Added a regression assertion that a UUID tenant reference is under 128 characters.
- Commits: `36d8a91` (compact codec) and `353618b` (size regression test).
- Still pending: pull/rebuild on VPS, confirm the 414 is gone, and run the session isolation/expiry flows. This addresses reference size; it does not replace a full audit of every endpoint and response field.


### VPS third build feedback — restore compact codec declarations (2026-11-21)

- The next VPS Docker build exposed that the compact-codec edit had replaced the prior session-id.ts implementation without preserving its shared constants, key derivation helper and exported tenant/plugin/user convenience functions. TypeScript therefore reported missing symbols and missing exports in tenant context, auth and organizations.
- Restored the resource-type code map, supported-type set, 1 KiB ID / 2 KiB reference bounds, session-scoped HMAC key derivation and all six public convenience exports while retaining the compact version-2 AES-256-GCM reference format.
- Fix committed directly to main: b6768f6 (fix(security): restore session ID codec helpers).
- Not yet validated: no subsequent Docker build, TypeScript build, unit tests or VPS runtime check has been reported. The next build must be run against this commit; after a successful deploy, users must refresh/re-authenticate to obtain version-2 references.


## Platform tenant directory moved into Settings (2026-11-21)

- Removed the separate Platform Administration sidebar destination for the superadministrator. Tenant administration is now accessed through Settings → Tenants.
- Reused the existing tenant/company directory component and its card/list toggle, creation modal, row/card actions and tenant management detail view; no second directory implementation was introduced.
- Updated Midnight, Glass and Paper dashboard templates so Settings → Tenants renders the directory instead of the generic settings placeholder. Other Settings sections retain their existing placeholder surfaces.
- Tenant detail URLs now live under `/dashboard/settings/tenants/:tenantId/manage`; returning from tenant detail returns to the Tenants directory. The obsolete `/dashboard/platform` navigation route was removed.
- Updated the Playwright smoke scenario to open Settings → Tenants and verify card/list switching, tenant management and tenant creation.
- Commits: `efee80f`, `5bd5194`, `946725c`, `703c962`, `c3097e6`, `17c0f66`, `ac5d0f0`.
- Source and test changes are integrated directly into main. Angular build, Playwright execution and VPS visual/functional validation have not yet been run; do not mark this UI flow verified until those checks pass.


## Plugin catalogue moved into Settings (2026-11-21)

- Removed the duplicate Plugins entry from the main workspace navigation for every role; plugin management is now accessed only through Settings → Plugins.
- Added a dedicated plugin management surface under Settings → Plugins in the Midnight, Glass and Paper dashboard templates; the existing workspace Plugins marketplace remains available separately.
- The Settings catalogue reuses the authenticated tenant-scoped marketplace API and displays plugin cards or a compact list.
- Added a disabled Upload control (future capability) and a vertical three-dot action menu per plugin. Install/Uninstall and Delete are visible but disabled; Details is the only enabled action.
- Details navigates to the session-masked plugin URL `/dashboard/plugins/:maskPluginId/details` and loads the authenticated plugin detail endpoint. The route is recognized on direct navigation/reload and returns to Settings → Plugins.
- No install, uninstall, delete or upload operation is exposed by this Settings UI.
- Added a Playwright smoke scenario for card/list switching, disabled Upload/Install/Uninstall/Delete controls, Details navigation and return to the catalogue.
- Source, route handling, E2E scenario and progress documentation are committed directly to main. Angular build, Playwright execution, API behavior and VPS visual validation remain pending.


## Settings sections implementation — feature/settings-sections (2026-11-21)

- Created `feature/settings-sections` from `main` at `86d30a8`; all work in this slice is isolated from main.
- Kept Settings as the only primary navigation entry and removed duplicate top-level theme, branding, domains and integration destinations. The eight role-filtered Settings destinations remain inside its submenu.
- Added canonical routes for General, Tenants, Plugins, Integrations, Plans & Licensing, Security, Infrastructure and Localization. The legacy `/dashboard/settings` URL resolves to General; Plans & Licensing now uses `/dashboard/settings/plans-licensing`.
- Replaced the generic settings placeholder in Midnight, Glass and Paper with a shared Settings workspace component.
- General now contains exactly Platform Identity, Appearance and Platform Defaults. Appearance reuses the existing template manager only for tenant scope; the template engine persists per active tenant and is deliberately not presented as a global platform control. Global appearance, identity and defaults clearly state that the required platform settings API is unavailable and do not simulate saving.
- Added distinct grouped field inventories for Integrations (connectors, global credentials, SMTP, notifications), Plans & Licensing (plans, pricing, subscriptions, licenses), Security (authentication, sessions, policy, privacy, retention), Infrastructure (runtime, storage, queues, logs, backups) and Localization (languages, regions, currencies and formats).
- Reused the existing tenant directory and plugin catalogue rather than duplicating either implementation. Existing Activity audit log remains in Activity; Security references policy/retention and does not create a second audit viewer.
- Preserved role visibility: Super Administrator sees all sections; tenant owners/admins see General, Plugins, Integrations, Security and Localization; tenant managers/members see Localization only. General and section workspaces identify platform versus active-tenant scope.
- Backend dependency: the current API has no persisted global/tenant Settings service for platform identity/defaults, integrations/SMTP, billing plans/subscriptions, security policy/retention, infrastructure operations or localization. Those controls are intentionally marked unavailable; there are no fake save buttons or claims of persistence.
- Added a Playwright smoke scenario covering the General three-card layout, the eight Super Administrator destinations, canonical route paths and the single Settings-only Plugins entry. The test source was not executed.
- Validation: no build, tests, GitHub Actions, workflows or VPS checks were run, per request. Angular compile and live role/route/rendering checks remain unverified.


## Notifications and messaging workspace — validation branch (2026-11-22)

- Continued only on `feature/notifications-menu-inbox`; `main` was re-read before reconciliation and remains unchanged at `c5cc9c5`.
- Reconciled the feature branch with the current main snapshot using a two-parent merge commit (`7f6faea`). The feature branch is now 30 commits ahead and 0 behind at that point; subsequent feature-only fixes and tests advance it further. The dashboard merge retained the current Settings work while applying the Notifications submenu and workspace.
- Integrated the notification bell, notification center and Messages preview into Midnight, Glass and Paper. Added the Nginx WebSocket proxy location `/api/realtime`.
- Backend notifications plugin stores records in MongoDB and scopes list/count/read/delete operations by the authenticated user and tenant. Realtime tickets are single-use, expire after 30 seconds, expired tickets are pruned, and the WebSocket handshake revalidates the persisted dashboard session, user, membership and tenant status.
- Hardened notification action routes against protocol-relative, whitespace and backslash-based external redirects. The notification bell now reports API/mutation errors rather than silently treating failed requests as successful.
- Added `test/notifications.integration.test.ts` covering authentication, tenant isolation, login notifications, safe/unsafe action routes, unread counts, idempotent read, cross-tenant mutation rejection, mark-all-read and realtime-ticket issuance.
- Messages is still a visual preview with sample conversations only. There is no messages API, persistent conversation store, delivery pipeline, SMTP sender, POP3/IMAP receiver or real-time message transport. The UI now labels this explicitly; it must not be treated as a working inbox.
- Validation state: GitHub PR #65 is open and currently reports `mergeable: true`; the branch is 0 commits behind main. GitHub Actions currently reports zero workflow runs and the commit has no status checks. The new integration test has been committed but has **not** been executed. No Angular build, backend test run, Playwright run, Docker build or VPS verification is claimed.
- Latest feature-branch commit before integration: `9e62dea`. PR #65 was squash-merged into `main` on 2026-11-22 as `e1212c7`; the pull request is closed. The remote feature branch still exists because branch deletion is not available through the current GitHub connection. VPS validation remains the next step; no build or test success is implied.

## VPS build feedback — notification center template syntax (2026-11-22)

- The user's Docker build reached Angular compilation but failed with TS1127, TS1136 and TS1160 in `apps/web/src/app/notifications/notification-center.component.ts`. The component's inline `template` and `styles` template literals contained literal backslashes before their opening and closing backticks (`\\``), making the TypeScript source invalid.
- Corrected the source by restoring actual TypeScript template-literal delimiters for both the notification-center HTML template and its inline CSS. The missing-export and dashboard `imports` diagnostics were downstream effects of this parse failure, not separate missing components.
- The same build reported three NG8107 optional-chain warnings in `platform-admin.component.ts`; they are warnings and are not the cause of this build failure. They are not changed in this fix.
- Fix is isolated on branch `fix/notification-center-template-literals` from main `bc603db3d91b104b8d1502cab4b4ad5c95986b3c`; no build or tests have been run by this environment. VPS rebuild is required to verify compilation.


## Tenant mail integration — PR #59 (refreshed against current main)

PR #59 has been integrated into `main` at `dc1e16e94f63965a807ca57771fdc6c2b5dc49cd`. The feature branch was refreshed onto the current `main` first; the integration preserves the current notifications, messages, Settings, authentication and security work. It adds tenant-scoped mailbox configuration and message storage, SMTP send, IMAP/POP3 retrieval, scheduled synchronization, role permissions and the dashboard workspace across Glass, Midnight and Paper templates. Existing current-main notifications, messages, Settings, authentication and security changes are preserved.

- Mailbox credentials use a dedicated AES-256-GCM key (`BEE_MAIL_ENCRYPTION_KEY`); production Compose and the production CI profile receive the key explicitly.
- Incoming IMAP/POP3 requires TLS. SMTP requires implicit TLS or STARTTLS on port 587; plaintext authentication paths are rejected.
- Owner/admin can manage mailboxes and send; manager can read/send; member is read-only. Server-side tenant context remains authoritative.
- MIME decoding, attachments, OAuth2, robust protocol parsing, IMAP UID cursor tracking, retries/queues and provider compatibility tests remain outstanding.
- Build, automated CI, live SMTP/IMAP/POP3 provider tests and a dedicated security review must pass before production use. No GitHub Actions runs or commit statuses were available for the refreshed PR head or merge commit at integration time. Do not treat this feature as validated until backend/Angular/Compose CI, live provider tests and security review pass.


## VPS build feedback — tenant mail request-body typing (2026-11-22)

- The user's Docker build reached the backend TypeScript compilation and failed in `src/plugins/mail/mail.plugin.ts` because Fastify request bodies for the create-account, update-account and send-mail handlers were inferred as `{}`. This produced missing-property diagnostics for mailbox fields and message fields, plus string-indexing errors in the account update handler.
- Added explicit request-body record types and local casts for those three handlers. The route handlers retain their existing runtime validation, tenant checks, permissions and persistence behavior; this change only makes the unvalidated incoming JSON shape explicit to TypeScript.
- Fix committed on `fix/mail-plugin-request-body-types`. No local build, tests, Docker build or VPS verification were run from this GitHub-only environment. A successful CI run and a fresh VPS `docker compose up -d --build` are still required before considering the compile failure resolved.


## VPS build feedback — mail workspace escaped newline (2026-11-22)

- The user's Docker build reached Angular compilation and failed with TS1127, TS1434 and TS7008 in `apps/web/src/app/mail/mail-workspace.component.ts` at line 29. The `startAdd()` method was followed by the two literal characters `\\n` instead of a real source newline, so TypeScript parsed `n async testAccount()` as invalid class-member syntax.
- Replaced that literal escape sequence with an actual line break before `async testAccount()`. No runtime behavior was changed.
- The three NG8107 diagnostics in `platform-admin.component.ts` are warnings only and are not the cause of this build failure; they are left unchanged.
- This correction is isolated on `fix/mail-workspace-literal-newline`. No Angular build, tests, Docker build or VPS verification were run here; the user's next rebuild is required to confirm the fix.

## Frontend dependency security hardening (2026-11-22)

Work is tracked on `security/hardening-92`, which was fast-forwarded to the then-current `main` before these branch-only changes. Added `npm run audit:production` in `apps/web/package.json` and documented the remediation acceptance gate in `docs/security-hardening.md`. This is process hardening only: Angular remains pinned to 19.2.15 and the lockfile has not been regenerated. No npm audit, production build, Playwright run or browser verification has been executed in this environment. Therefore the frontend dependency-security item remains **open** and is not counted as completed progress.


## Superadmin Settings navigation fix (2026-11-22)

- Updated the superadmin navigation allow-list in `apps/web/src/app/app.component.ts` to include the existing `settings` menu entry. The previous filter explicitly removed Settings even though `settingsNavigationItems` already grants superadmins all eight Settings sections.
- The change is limited to frontend menu visibility; it does not broaden backend authorization or change the permissions of other roles.
- Based on current `main` commit `881138bef1c377c71d22f4d7105bfe0d38acdb53`. No Angular build, automated tests, browser verification or VPS deployment test was run in this GitHub-only environment.


## Angular production HTML and strict CSP compatibility (2026-11-22)

- The deployed public document contained a generated stylesheet link with `media="print" onload="this.media='all'"`. The inline `onload` handler was blocked by the existing strict `script-src 'self'` policy; the browser DOM inspection identified this exact element.
- Updated `apps/web/angular.json` production optimization to keep script/style/font optimization enabled while setting `styles.inlineCritical: false`. This disables Angular's critical-CSS inlining transformation that generated the inline event handler; stylesheets remain external same-origin assets and load normally without an inline handler.
- The fix is committed directly to `main` at `7eeeaca67c2d88a55149212defb5e6c4c65e07d3`. The build and deployed HTML have not yet been verified in this GitHub-only environment. Rebuild the web image and confirm the served HTML has no `onload` attribute before considering the CSP console error resolved.



## GitHub Actions test workflows removed (2026-11-22)

- Removed all four workflow files from the default `main` branch: `.github/workflows/ci.yml`, `docker-prod-profile.yml`, `frontend-security-migration.yml` and `web-ci.yml`. The `.github/workflows` directory is therefore empty/absent on `main`; pushes and pull requests targeting the default branch will no longer trigger these repository workflows.
- Also removed all five workflow files (`ci.yml`, `docker-prod-profile.yml`, `frontend-security-migration.yml`, `web-ci.yml` and `container-security.yml`) from the active PR #84 branch `security/container-hardening-evidence-93`; neither the default branch nor that active PR branch retains workflow YAML.
- The application test files, test scripts, type-check/build commands and security checks in the source repository were deliberately retained. They can still be run manually on the VPS; this change disables GitHub Actions automation, not the tests themselves.
- The currently running GitHub Actions run #45011257135 was still in progress when inspected. The available GitHub connection does not expose a cancel-run action, so this change does not claim that the already-started run was cancelled. It may finish; removal prevents subsequent runs from those deleted workflow definitions.
- No tests, builds or deployments were executed as part of this workflow cleanup. Historical completed/failed/cancelled runs remain visible in GitHub Actions history; deleting workflow YAML does not erase past runs.
- Commits: main workflow deletions `87e2d21`, `33bd008`, `ef4f655`, `344ce00`; PR #84 branch workflow deletion `7f9693d`.


## Proposed capability — Connected Devices (2026-11-22)

- Added the future Connected Devices capability specification in [docs/connected-devices.md](connected-devices.md), covering QR pairing, tenant-scoped device registry, explicit approval, revocable credentials, least-privilege capability scopes, companion applications, realtime events, opt-in location, mobile POS/handheld workflows, and phased acceptance criteria.
- Linked the specification from the README and the SaaS/plugin platform roadmap.
- This is a product/architecture proposal only. No device service, QR pairing flow, mobile app, location tracking, POS device integration, API, or UI has been implemented or verified.
- It is explicitly excluded from MVP implementation and release-readiness percentages until scope is approved, implemented, and tested.

## VPS build feedback — Super Organization MongoDB typing (2026-11-23)

- The VPS backend image build failed in `src/plugins/platform-admin/platform-admin.plugin.ts` during TypeScript compilation. The Super Organization bootstrap assigned a plain insert document to a variable inferred from `findOne()` as `WithId<Company> | null`, which incorrectly required MongoDB's generated `_id`; the code also used that nullable lookup result without an explicit existence guard.
- Corrected bootstrap to keep the new organization as a plain `Company` insert document, insert it, re-read the persisted MongoDB record, and fail explicitly if initialization still returns no organization.
- Expanded the platform-admin membership status type to include the persisted `invited` and `suspended` states used by the migration and membership lifecycle.
- Fix is isolated on branch `fix/super-organization-mongodb-types`. No build, tests or CI were run here. Rebuild on the VPS is required to confirm the TypeScript diagnostics are resolved; subsequent runtime migration and MFA flows remain unverified.


## Core permission catalogue and Organization role editor — feat/core-permission-catalog (2026-11-23)

- Added a canonical backend permission catalogue for current Core authorization keys: Organization members, Plugins, Billing, Files, Notes and Mail.
- Preserved existing permission keys so current backend guards and persisted custom-role records remain compatible.
- Custom roles can select every registered current Core permission, including mail, billing and management capabilities previously excluded by the custom-role allow-list.
- Unregistered keys such as platform.super_admin and tenants.manage remain rejected. Platform-global super-admin authority is outside the tenant-customizable catalogue.
- Added a dedicated Organization → Roles & Permissions workspace to Glass, Midnight and Paper. Role editing is removed from Users; Users retains invitation and membership workflows.
- The editor groups permissions by module, explains each action, and marks protected/sensitive operations. Protected capabilities are visible but disabled for custom roles. Backend validation remains authoritative, and custom-role administration remains owner-only.
- Added regression coverage for catalogue uniqueness, built-in role coverage and rejection of unregistered privilege keys.
- This first pass includes only permissions backed by current Core authorization checks. It does not invent Teams/Company CRUD permissions or claim record-level scopes (own, team, assigned) are implemented.
- Validation: no tests, TypeScript build, Angular build, Docker build or VPS runtime validation have been executed here. Run backend npm test/build and Angular production build before deployment.


## Platform and tenant Roles & Permissions — 2026-11-23

- Added Settings → Roles & Permissions for the Super Admin, exposing the canonical Core permission catalogue, protected system-role boundaries and the global tenant-delegation policy.
- Added authenticated platform endpoints to read/update the tenant-delegable permission set. Only capabilities marked delegable by the Core catalogue can be enabled; protected operations cannot be promoted into tenant custom roles.
- Tenant role creation and updates now validate against the current platform policy. Runtime permission resolution filters custom-role permissions against that policy as well.
- Revoking a capability globally removes it from persisted tenant custom-role records and prevents stale assignments from authorizing requests.
- Company → Roles & Permissions remains scoped to the active tenant. Company → Users continues to manage invitations and memberships; Settings → Platform Users retains platform-wide user administration.
- No tests, TypeScript builds, Angular builds, Docker builds or VPS runtime checks were executed for this extension. Treat validation as pending.


## Core permission governance — PR #101 follow-up

- The permission catalogue in `src/core/permission-catalog.ts` is the single source of truth for the tenant role editor. The Organization → Roles & Permissions API returns catalogue definitions plus the current platform delegation allow-list; Angular no longer maintains a second hard-coded permission list.
- Organization → Users remains focused on invitations and membership assignment. Obsolete custom-role editor state and handlers were removed from the Users component; role editing stays in Organization → Roles & Permissions.
- Custom-role create and update endpoints validate grants against the live platform delegation policy. Tenant session permission resolution and administrative route checks also use the current policy.
- Revoking a capability removes it from effective custom-role permissions immediately without invalidating the entire membership/session. Persisted role grants are also cleaned up by the platform policy update operation.
- Regression coverage added for live policy filtering. Tests and builds have not been executed in this change; VPS validation remains required.
- Current catalogue describes only capabilities registered by the existing Core modules. It does not invent CRUD operations for modules whose backend operations do not exist. Record-level scopes (own/team/assigned/all), tenant-specific system-role overrides and a full ABAC policy engine remain deliberately deferred until the relevant resource ownership and team data contracts exist.


## Angular dashboard template build fix — 2026-11-23

- Fixed an extra Angular control-flow closing brace immediately after the Organization → Roles & Permissions component in the Glass, Midnight and Paper dashboard templates.
- The VPS production build identified the same `NG5002: Unexpected closing block` error in all three template files. This change removes only the redundant closing brace and preserves the surrounding section conditions.
- The backend image build completed in the reported Docker run; the web image failed at Angular template compilation. Re-run the full Docker build on the VPS to verify the correction. No successful Angular or Docker build is claimed yet.


## Platform Roles & Permissions visual consistency and Settings navigation — 2026-11-23

- Removed the Settings → Integrations destination from the Super Administrator global Settings navigation. Global connectors, credentials, SMTP and notification-channel management do not belong in this Settings workspace; the unrelated standalone Integrations destination is unchanged.
- Removed the obsolete Settings Integrations route mapping, tenant owner/admin allow-list entry and placeholder definition. An invalid/legacy Settings section now falls back to the existing Security definition rather than rendering an unrelated integrations inventory.
- Reworked Settings → Roles & Permissions to inherit the active dashboard template's foreground and use the same restrained translucent panel/border treatment as the other Settings sections. Removed forced dark text and white surface fallbacks that made the page unreadable in Midnight and visually inconsistent in Glass/Paper.
- Matched the section heading to the other Settings pages with the GLOBAL PLATFORM eyebrow, page title and Platform-wide scope indicator. The component is shared by Glass, Midnight and Paper, so the same theme-aware treatment applies to all three.
- Updated the Settings navigation Playwright smoke scenario from eight to seven Super Administrator destinations and removed the Integrations navigation assertion.
- Validation: no tests, Angular build, Docker build or VPS runtime checks have been executed for this change. Verify all three dashboard templates on the VPS, including Midnight dark mode, before considering the visual correction complete.


## Fix duplicated Security workspace above Roles & Permissions (2026-11-23)

- Restored the Settings → Security destination and its existing placeholder definition; the previous change had removed it based on a misreading of the reported screen.
- Fixed the shared Glass, Midnight and Paper dashboard templates so `settings-roles` is excluded from the generic `settings-*` workspace renderer.
- The platform Roles & Permissions component now renders on its own without the unrelated Security workspace appearing above it. Security navigation and backend authentication/authorization remain unchanged.
- Validation: no Angular build, tests, browser checks or VPS runtime checks have been executed. Verify Settings → Security still opens its workspace and Settings → Roles & Permissions shows only its intended component in all three dashboard templates.

## Platform permission catalogue four-column layout (2026-11-23)

- Updated the shared platform Roles & Permissions component so each permission group (for example, Organization) displays its permission cards in a four-column grid on desktop.
- Group headings span the full grid width. Permission cards retain their labels, descriptions, permission keys, protected-state text and existing toggle behavior.
- The grid reduces to two columns on medium screens and one column on narrow mobile screens to preserve readability.
- No permission catalogue, authorization, persistence or API behavior was changed.
- Validation: no Angular build, tests, browser checks or VPS runtime checks have been executed. Verify the layout in Glass, Midnight and Paper after rebuilding on the VPS.


## Organization role presets and deny-only restrictions (2026-11-23)

- Made built-in organization role permissions explicit in source-controlled Core defaults: `super_admin`, `owner`, `admin`, `manager`, `member` and `guest`. The Guest default remains only `plugins.read`; Owner and Super Admin remain protected identities.
- The Organization → Roles & Permissions API now returns the built-in role definitions for the active organization, including the Super Organization's protected `super_admin` role. These defaults do not depend on MongoDB seed rows, so a clean database receives the same role definitions on first startup.
- Added custom role modes: `grant` for existing custom permission bundles and `restriction` for deny-only overlays. Restriction roles may deny any registered Core permission, including otherwise protected capabilities; they cannot grant permissions.
- Memberships can retain a built-in primary role and carry multiple additional restriction-role IDs. Effective permissions are the primary role's grants minus the union of all assigned restrictions. Explicit denials win; unassigned permissions remain denied by default.
- Owner and `super_admin` memberships cannot receive restriction roles. Restriction roles cannot be assigned as primary custom roles. Role deletion and mode changes are blocked while memberships still reference the role.
- Organization → Users can assign and remove additional restriction roles for eligible members. The Super Admin can appoint the single Super Organization Owner when none exists; ownership transfer remains a separate protected workflow. Role changes revoke that member's active sessions so the next session resolves the new effective permissions.
- Member invitation and direct addition of existing accounts are gated by `members.invite`; role changes and suspension remain gated by `members.manage`. The Users UI reads the effective permission set before showing management and invitation actions.
- The active-company permission endpoint and organization authorization guards now use the same fully resolved permission set, preventing UI/API discrepancies.
- Global platform revocation only prunes grant-role permissions; it does not erase deny rules.
- Added unit and MongoDB integration regression coverage for deny precedence, protected capability denials, built-in role defaults and effective membership permissions.
- Bootstrap behavior remains code-driven: the Super Organization and bootstrap Super Admin membership are initialized by the existing idempotent startup flow; built-in role definitions and global delegation defaults are source-controlled fallbacks rather than manually created database records.
- Validation: no tests, TypeScript build, Angular build, Docker build, CI or VPS runtime validation have been executed for this change. Validate on the VPS, including a clean-database bootstrap and a Super Organization Admin assigned a restriction role.


## Fix organization restriction role TypeScript build (2026-11-23)

- Corrected two unreachable `nextRole === "super_admin"` comparisons in membership restriction handling. The route rejects existing `super_admin` memberships before this code and its assignable role input excludes `super_admin`; TypeScript therefore correctly narrows `nextRole` to the assignable membership roles.
- Kept the protected-role behavior intact: Super Admin memberships remain blocked from modification by the earlier guard, and Owner memberships cannot receive restriction roles.
- This resolves the exact TS2367 errors reported by the VPS Docker build at `organizations.plugin.ts:321` and `:324` without weakening authorization.
- Validation: change is based on the exact VPS compiler diagnostics. No TypeScript build, tests, Angular build, Docker build or CI have been run by the assistant; rerun `docker compose up -d --build` on the VPS.


## Organization invitation links and self-service acceptance (2026-11-23)

- Organization → Users now turns the one-time invitation token into a direct browser link (/invite/accept#token=...) and provides a Copy invitation link action. The token stays in the URL fragment and is submitted to the API in request bodies, avoiding exposure in ordinary HTTP request paths and Referer headers.
- Added a public invitation preview that validates token state and shows the invited email, organization, assigned primary role, optional restrictions and expiry without revealing password/account data.
- Added invitation-based account registration. New users set a password (minimum 12 characters); the backend creates the account and active organization membership using only the invitation's stored organization and role data, then consumes the token. Existing accounts sign in and accept through the authenticated invitation endpoint.
- Invitations now retain optional primary custom grant roles and additional deny-only restriction roles. Both are validated against custom roles belonging to the active organization; only eligible organization owners / Super Organization super admins may assign them. Acceptance applies the same role/restriction assignment for existing and newly registered users.
- No SMTP, email delivery provider, background mail job or external email dependency is required. Administrators can copy the link and share it manually.
- Security behavior: random 256-bit URL-safe token, SHA-256 token hash at rest, seven-day expiry, one-time conditional consumption, invitation email matching, organization availability checks, duplicate-account handling and compensation if membership creation fails. The invitation link token is displayed only immediately after creation.
- Validation: no TypeScript build, Angular build, tests, Docker build, browser test or VPS runtime check has been executed for this branch. Validate new-account registration, existing-account acceptance, expired/cancelled/replayed links, custom grant roles, multiple restrictions and clean-database bootstrap on the VPS.

## Organization Roles & Permissions tabbed workspace (2026-11-23)

- Reorganized Organization → Roles & Permissions into three numbered tabs using the same restrained underline-tab pattern as Settings → General: System Roles, Available Permissions and Custom Roles.
- System Roles presents the built-in organization roles as responsive cards with scope-safe descriptions, protection state and their existing baseline permission keys.
- Available Permissions presents the live Core permission catalogue grouped into resource cards, with descriptions, action/key details and a distinction between globally grantable capabilities and restriction-only/protected capabilities.
- Custom Roles consolidates the existing custom-role list and editor. It retains grant and deny-only restriction modes, permission selection, owner/Super Admin management checks, and existing create/update/delete API operations.
- Applied theme-token-based surfaces, borders, foregrounds and accent styling so the shared component remains consistent across Glass, Midnight and Paper. Responsive layouts collapse cards and editor columns on narrower screens.
- No backend routes, permission keys, role defaults, delegation policy, membership assignments or authorization behavior were changed.
- Validation: no Angular build, tests, browser checks or VPS runtime validation have been executed. Verify tab navigation, role CRUD, permission-policy states and all three dashboard themes on the VPS.

## Organization members role display correction (2026-11-23)

- Fixes the empty Role cell for Admin members when viewed by another Admin: the role selector is intentionally hidden for peer administrators, but the fallback label was also missing. The read-only role label now appears in that case.
- Removes the masked user resource ID from the member table; the email is the visible member identity, avoiding the opaque token-like ID shown below the email.
- Keeps the restriction that an Admin cannot change another Admin's role; Owner and Super Admin protections remain unchanged.
- Validation: no build, tests, browser checks, CI, or VPS validation performed.


## Organization invitation cards and revoke action (2026-11-23)

- Removed the redundant token input from Organization → Users; invitation acceptance is handled through the generated invitation link flow.
- Replaced the invitation list with a responsive card grid (five columns on wide desktop, collapsing for tablet/mobile).
- Added a vertical three-dot action menu per invitation. Placeholder actions remain disabled; Revoke invitation uses the existing cancellation endpoint.
- Revoked invitations are labeled **revoked** in the status badge, replacing the prior cancelled wording; accepted, pending and expired states remain distinct.
- Validation: no build, tests, browser checks, CI or VPS runtime validation performed.


## Platform Admin tenant detail tabs (2026-11-23)
- Reworked the tenant detail view into Settings-style tabs (`General`, `Users`, `Plugins`) using existing theme variables and platform-admin component styling; the summary cards remain visible above the tabs.
- Added a platform endpoint to enumerate a tenant's memberships and their user email, role and status (including invited/suspended memberships), without exposing raw IDs in the UI.
- Expanded the tenant plugins endpoint to list trusted plugin catalogue entries with installed lifecycle status, version, system flag and description; UI activation controls are limited to non-system plugins.
- The General tab retains the real tenant identity and platform suspension/activation control. No speculative configuration fields were added because tenant configuration APIs are not available yet.
- Validation: no build, tests, browser, CI or VPS runtime validation performed.


## Notifications → Email submenu persistence fix (2026-11-23)
- Fixed sidebar submenu state so selecting Notifications → Email keeps the Notifications submenu expanded, both when navigating in-app and when loading/reloading the `/dashboard/mail` route or using browser history.
- The navigation state now treats `mail` as a child of Notifications consistently with `notifications` and `messages`.
- This is a small frontend state fix; no mail functionality or routing behavior changed.
- Validation: source-level checks only; no Angular build, browser tests, CI or VPS runtime validation performed.


## Organization members action menu and membership reactivation (2026-11-23)
- Replaced the inline Suspend button in Organization → Users with a vertical three-dot action menu, matching the existing invitation menu pattern.
- The menu includes disabled placeholder actions (Edit member and Reset password), plus Suspend for active members and Activate for suspended members.
- Added an authenticated membership-status PATCH endpoint scoped to the active organization. It enforces organization-admin access, protected Owner/Super Admin boundaries, peer-Admin restrictions, status validation, and revokes active refresh sessions when suspending or reactivating.
- Added `member.activated` to the tenant audit-action catalogue.
- Validation: source-level implementation only; no TypeScript build, tests, browser smoke checks, Docker build or VPS runtime validation executed.

## Tenant teams and resource-level authorization (PR)

- Adds tenant-owned teams with optional parent teams and membership restricted to active tenant memberships.
- Adds explicit team-to-plugin assignments, accepted only for plugins installed in the active tenant; installation does not automatically expose every team.
- Adds resource policies with team grants and individual user exceptions. Explicit user denials override grants from every team; tenant permission checks remain mandatory. An empty saved policy denies all resource-level access; deleting the policy explicitly restores the plugin's tenant-level default. Team, membership, application-assignment and resource-policy mutations are tenant-audited.
- Integrates resource ACL decisions into private Files listing, download and deletion. Plugins can use the shared evaluator and pass typed ancestor resource references so folder-level grants and restrictions cascade to descendant files and folders.
- Cross-tenant team sharing is not supported; external collaboration must be an explicit future capability.
- Validation: not executed; backend typecheck/tests and Angular production build remain required before merge.


## Organization → Company profile workspace (2026-11-23)

- Added a tenant-scoped Company profile screen to Organization → Company, using the shared settings-page layout and theme tokens so it renders across Glass, Midnight and Paper.
- Company profile fields: editable company display name, legal name, tax/VAT identifier, business email and phone, website, industry, company description, address lines, city, region, postal code and country.
- Persisted tenant-specific profile data on the existing tenant record through authenticated GET/PATCH `/companies/:companyId/profile`. Read access requires `members.read`; editing requires `members.manage`. Backend trims and length-limits fields, validates email and HTTP(S) website URLs, and scopes writes to the active organization.
- Members without Owner/Admin editing authority see a read-only profile. Added English and Spanish catalog labels.
- Configuration overlap reviewed: platform identity/branding and themes remain in Settings → General/Appearance; localization remains in Settings → Localization. Company profile does not duplicate those settings.
- Validation: source changes only. No Angular build, backend typecheck, tests, browser checks, Docker/CI or VPS validation executed.


## Company profile frontend build correction — 2026-11-23
- Fixed a literal escaped `\\n` accidentally inserted between the constructor and `canEdit` getter in `organization-company.component.ts`; it is now a real TypeScript line break.
- Based on the Angular compiler diagnostics from the VPS Docker build after PR #117 was pulled. This addresses the reported TS1127/TS1434/TS7008 source error.
- Validation: source-level correction only. Angular/Docker rebuild and VPS verification remain pending.


## Organization → Company profile translations audit (2026-11-23)

- Audited every translation key used by the Company profile component against the Organization English and Spanish catalogs. The visible profile labels, field labels, loading/saving/success/read-only notices were already present in both languages.
- Added missing localized fallback error messages for loading and saving the Company profile, and replaced the component's hard-coded English fallback strings with the translation keys.
- API-provided error details remain displayed as received when present; only local fallback messages are translated.
- Validation: source/catalog audit only; no Angular build, browser locale test or Docker/VPS runtime check executed.


## i18n runtime namespace activation fix (2026-11-23)

- Root cause of the Company/Organization page rendering translation keys instead of labels: the organization catalog was registered but not active in the i18n service's initial active namespace set. The namespace only became active after setInstalledModules() ran.
- Activated the built-in Organization namespace (and other already-registered built-in catalogs) during service initialization, so labels translate before module activation/plugin loading.
- Validation: source-level change only. Angular build, browser locale switch, and Docker runtime verification remain pending.

## Documents workspace cards/table and file metadata (PR #127 — merged 2026-11-23)

- Added Cards and Table presentation modes for the same tenant-scoped folders and documents, with the compact view switcher immediately before the Upload text file action. The selected view is indicated accessibly with button names, tooltips and `aria-pressed`.
- Restored the vertical three-dot (⋮) folder action and added matching document action menus in both views. Document actions include Document details and Download; folder sharing actions remain permission-gated.
- Added a document details dialog showing document title, original filename, uploader email, upload timestamp, record creation/update timestamps, MIME type, file size, visibility, description and tags when available.
- Extended the Documents API presenter to enrich responses using tenant-scoped stored-file metadata and the uploader account record. Existing tenant scoping, resource access checks and authenticated download route are retained.
- Updated the global Bee-Core design system and Midnight style guide with collection view-switcher placement and vertical-ellipsis conventions.
- Corrected three literal escaped newline sequences in the Angular component before merge; verified the component file no longer contains those accidental sequences.
- PR #127 was squash-merged into `main` at `6e2cd04f7fa5f845c04b3adcf46d3293a7c79874`.
- Validation status: source-level checks only. No TypeScript/Angular build, tests, CI, browser/responsive checks or VPS runtime verification were run. The Documents feature must not be considered build- or production-verified until those checks pass.


## Documents Light-mode surface correction (2026-11-23)
- Corrected a token mismatch in Documents: the dashboard canvas switched to Light while feature-local `--panel`, `--bg`, `--muted` and `--border` still resolved to Midnight dark values. Added component-scoped Light tokens keyed to the Midnight host mode.
- Harmonized folder/document cards and hover, overflow menus, share/detail dialogs, share tabs, search suggestions, chips, hints, empty state and table surface. Primary actions and selected view controls now retain readable white text over the accent background.
- Styles remain scoped to Documents; Midnight Dark and unrelated dashboard features are not intentionally altered.
- Validation: source/documentation review only. No Angular build, tests, browser visual/responsive QA, CI or VPS runtime verification executed. Check Cards/Table and all open menus/dialogs in both Light and Dark after deploy.


## Documents modular API refactor — phases 1–4 underway (2026-11-23)
- Started a dedicated refactor branch from the verified latest `main` commit (`eb593928736899043ec997795baf19eae323abbf`); no changes are merged to `main`.
- Completed phase 1 source inventory and documented the current API contract, plugin/Core/Files responsibilities, frontend transport coupling, security invariants and target separation in `docs/modules/documents-modularization-audit.md`.
- Source review confirms the backend is already an isolated Bee plugin registered into the existing API runtime. The remaining backend coupling is internal: the plugin initializer currently bundles route handlers, domain logic, persistence and presenters. The Angular component still owns raw HTTP transport and endpoint strings.
- Phases 2–4 are next: extract backend routes/domain helpers into module-owned files, add typed frontend Documents API service/contracts, and formalize the module/Core/Files/permission boundary while preserving existing paths and UX.
- Phase 5 is intentionally deferred until after you authorize merging to `main`. No builds, tests, browser QA, API smoke checks, Docker build or VPS runtime verification have been executed.


## Documents modular API refactor — phases 1–4 source work (2026-11-23)
- Phase 1 complete: audited module ownership, current endpoint contract, frontend transport coupling, security/tenant invariants and migration target. See `docs/modules/documents-modularization-audit.md`.
- Phase 2 progress: created `src/plugins/documents/documents.routes.ts` as a module-owned route contract and switched existing Fastify registrations to those route constants. Documents routes continue to register within the existing isolated plugin/API runtime; there is no duplicate API server or new prefix. **The route handler bodies are still in `documents.plugin.ts`; extracting handler/controller/domain layers is not yet complete.**
- Phase 3 progress: introduced `DocumentsApiService` with typed DTO declarations, centralized API base, URL builders for folder/document location, sharing, search and Files upload, and request transport. Component now uses the service for all 11 network dispatches; no direct fetch calls remain in the component. **Response parsing, operation orchestration, UI error handling and download-blob presentation still live in the component and are candidates for further extraction.**
- Phase 4 documentation complete: `docs/modules/documents-module-boundary.md` formalizes module-owned domain/API/permissions vs Core auth, tenant context, shared ACL, plugin lifecycle and Files infrastructure, and lists security invariants that must be retained.
- No merge to `main`. The branch is a review checkpoint; phases 2 and 3 are partially completed rather than claimed fully decoupled. No Angular/API builds, tests, browser, Docker/CI or VPS validation has been performed. Phase 5 remains reserved for after merge approval.


## Documents refactor — phases 2 and 3 implemented on branch (2026-11-23)
- **Phase 2 backend source separation implemented:** `documents.plugin.ts` now performs bootstrap only; the module route contract is in `documents.routes.ts`; 12 handler registrations are in `documents.controller.ts`; tenant/auth/resource access and presentation helpers are in `documents.service.ts`; Mongo collections/indexes and tenant-scoped collection wrappers are centralized in `documents.repository.ts`; sanitization, public ID validation and tag normalization are in `documents.validators.ts`. Existing route paths and plugin runtime remain in place. The controller no longer calls `db.collection()`; repository is the persistence boundary. It still uses Core shared permission/resource-access evaluators as expected.
- **Phase 3 frontend API separation implemented at source level:** `DocumentsApiService` owns typed DTOs, route paths and URL builders, auth headers, HTTP dispatch, JSON parsing and error normalization, folder/document operations, share calls, upload and download API response. The Angular component has no direct `fetch()`, endpoint literals, API URL construction, `.json()` response parsing, or API request setup. Component retains view state, event handlers and browser-specific blob download presentation.
- Phase 4 architecture documentation updated to match actual layers and dependency boundaries.
- Branch remains unmerged; PR #132 is still draft pending final source review. No TypeScript/Angular build, tests, browser interaction, API smoke test, Docker/CI or VPS runtime verification has been executed. Phase 5 is still explicitly deferred until after merge approval.


## Documents backend controller/handler split completed (2026-11-23)
- Further reduced `documents.controller.ts` to route mounting only. The 12 endpoint callbacks have been moved into module-owned `documents.handlers.ts`; controller now mounts route constants against the handler factory.
- Phase 2 structure now comprises plugin bootstrap → routes contract → controller → handlers → service helpers → repository → validators, with Core shared auth/ACL/Files capabilities injected.
- **Important verification caveat:** extraction was reviewed by source and route count checks only. No TypeScript parsing/compile or runtime tests were available; therefore this means architectural source separation, not verified functional completion.
