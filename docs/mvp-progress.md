# Bee-Core MVP progress

Updated: 2026-11-20 — repository main now includes tenant subdomain routing through `fd19a01021d3a04433f650af491bcfb439a8a5db`. Template business-model clarification and removal of the color-picker UI are being recorded in subsequent commits. No tests or CI were run for the latest template changes, per user instruction.

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

- Created the shared AES-256-GCM resource-reference codec in `src/core/session-id.ts`. References use a keyed HMAC-derived 96-bit GCM nonce, carry a resource type, the issuing session ID and its expiry, and are cryptographically bound to a key derived from the server secret and session ID. Identical resource/type/expiry inputs are stable within a session; references differ across sessions.
- Added convenience functions for tenant, plugin and user IDs, plus generic support for memberships, roles, invitations, files, notes and jobs.
- Added unit tests for cross-session rejection, same-session stability, type substitution, tampering and expiry.
- Added `docs/session-resource-ids.md` with the contract and mandatory integration requirements.
- This is deliberately **not marked complete**: API route inputs/outputs, JWT claims, public endpoints, Angular state/routes and plugin interfaces have not yet been migrated. The codec must not be treated as active protection until those integrations and cross-tenant tests are complete.
- Changes are on branch `feature/session-bound-resource-ids`; no build, test run, CI result or deployment verification is claimed.


## Session-bound resource IDs — auth integration attempt (2026-11-21)

- Added an initial authentication-path integration on `feature/session-bound-ids-end-to-end`: newly issued JWTs carry an AES-GCM `tenantRef` rather than a plaintext `tenantId`; the reference is bound to the persisted refresh-session ID and expiry.
- Login responses now return session-bound user and tenant references. Refresh rotates the token and issues a new reference using the persisted session expiry. The tenant context resolver decrypts and compares the reference with the session's tenant before loading membership and company status.
- This is **not an end-to-end migration** and is not merged to main. Other organization, Platform Administration, marketplace/plugin, public tenant, API request/response, SSE, and Angular contracts still require migration. Some existing clients expect stable raw IDs, so deploying this branch before those contracts are migrated may break navigation and API calls.
- No build, unit tests, integration tests, CI, or VPS validation were run. Do not deploy this branch as a complete security release.
## Session-bound resource IDs — end-to-end audit (2026-11-21)

The session-bound AES-256-GCM reference codec from PR #52 is a foundation, not yet an application-wide migration. PR #54's authentication slice was audited against the organization, platform administration, marketplace, file, note and Angular surfaces. It is intentionally not merge-ready.

Confirmed remaining exposure and compatibility work:

- organizations.plugin.ts: public tenant discovery returns the real tenant ID; company, role, invitation and membership routes still accept and return real tenant/user/resource IDs. These routes must resolve typed references against the caller's persisted session before querying, and serialize every returned identifier.
- platform-admin.plugin.ts: global company listing/creation, owner responses and tenant/plugin lifecycle routes still expose or accept real company, user, plugin and job IDs. Platform-admin references need the same session binding while preserving explicit cross-tenant authorization.
- marketplace.plugin.ts: plugin routes and responses expose plugin IDs, tenant IDs and lifecycle job IDs; public tenant plugin discovery also returns real IDs. Webhook/provider identifiers are a separate trusted server-to-server contract and must not be blindly masked as browser references.
- files.plugin.ts and notes.plugin.ts: file/note identifiers in route parameters and response payloads have not been migrated.
- auth.plugin.ts: public tenant/template discovery and template SSE/ticket flows require separate review; the current auth slice is not a complete output-boundary sanitizer.
- Angular: company/member, platform-admin and marketplace components currently display and send IDs as route identifiers. They must treat opaque references as opaque strings, and the matching backend endpoints must be migrated atomically. The present auth-only response change is not compatible with the existing route handlers.
- tenant-context.ts still accepts the legacy plaintext tenantId JWT claim and reads the secret from process environment. Final migration must remove the legacy claim and inject the same configured key through a single dependency path only after all token issuers/consumers have migrated.

Security invariants for completion:

1. Every browser-visible resource reference is authenticated-encrypted, typed, session-bound and expires no later than the persisted session.
2. All incoming references are decoded only after JWT verification and persisted-session lookup; type, session, expiry and tenant scope are checked before database access.
3. All outgoing JSON, errors, URLs, pagination cursors, SSE payloads/tickets and Angular navigation state are audited for raw database IDs.
4. Platform superadministrator cross-tenant operations remain explicitly authorized; masking is not authorization and must not weaken tenant scoping.
5. Server-to-server webhooks and internal events retain their documented internal contract unless a browser boundary is crossed.
6. Tests cover two sessions for one user, expiry/revocation, tampering, wrong resource type, cross-tenant IDOR, login/refresh/me, platform administration, organization CRUD, marketplace jobs, files, notes and SSE.

Validation status: no build, automated test suite, CI workflow or VPS deployment was run for this audit. Do not merge PR #54 or describe the migration as complete until the API and Angular contract migration above is implemented and validated.
### Additional resource-boundary slice — files and notes (2026-11-21)

- TenantContext now carries the persisted session expiry so resource codecs can enforce the same session lifetime at API boundaries.
- Files API now returns session-bound opaque file references and decodes them before tenant-scoped download/delete lookups. Invalid, expired, wrong-session and wrong-type references resolve as not found.
- Notes API now returns allowlisted note fields, masks note IDs and creator user IDs, and decodes note route references before tenant-scoped reads/updates/deletes. Internal tenantId is no longer serialized in note payloads.
- Files integration coverage now asserts opaque file IDs and rejects use of a file reference from a second session belonging to the same user.

Still outstanding: organizations and Platform Administration routes, marketplace plugin/job references, public discovery contracts, auth template/SSE boundaries, remaining Angular contract migration, notes integration coverage, complete test/build/CI validation. This is a partial vertical slice, not an end-to-end completion.

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

Remaining before merge:
- Review every remaining plugin/API and browser boundary (including any dynamically registered plugin routes, event payloads, error metadata, and URL/query/body identifiers) for raw database IDs; the migration is not yet certified exhaustive.
- Add/finish focused coverage for session expiry/revocation, logout after refresh, malformed/tampered/wrong-type references, notes/files cross-session use, and all platform lifecycle operations.
- Run the full TypeScript build, unit/integration suites and CI. These have **not** been run from this environment; MongoDB-backed integration tests may require `MONGODB_TEST_URI`.
- Review the final diff for type errors and compatibility before marking PR #54 ready. No VPS deployment or production verification has been performed.

Current status: meaningful backend and frontend slices are now integrated in the PR branch, but PR #54 remains draft and must not be merged until the exhaustive boundary review and automated validation pass.


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
