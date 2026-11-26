# Control Horario — frontend ZIP-only migration

## Scope and non-goals

This work moves **only the Control Horario frontend** to the same signed-ZIP runtime model already used by Connected Devices.

- Connected Devices is the reference implementation and must remain unchanged.
- Documents is explicitly out of scope. Its native Angular workspace remains in place because Documents depends on the core Files service and its existing experience must not regress.
- Files, Auth, Organizations, tenant context, permissions and other host infrastructure remain core services.
- No tenant data migration or deletion is part of this frontend migration.

## Verified baseline on main

The baseline inspected for this branch has these properties:

1. `scripts/build-plugin-packages.mjs` defines a frontend source, entrypoint and assets for Connected Devices.
2. The same package definition for `time-tracking` has no `frontendSource` or `frontend` declaration. Its signed ZIP therefore contains backend code but no Time Tracking frontend assets.
3. `apps/web/src/app/plugins/plugin-frontend-registrations.ts` statically imports and registers both `documentsFrontend` and `timeTrackingFrontend`.
4. `apps/web/src/app/time-tracking/time-tracking.frontend.ts` resolves the Angular component dynamically, but it is still part of the host application bundle and is not a ZIP frontend.
5. The existing Time Tracking Angular component implements the current UI and must be treated as the functional reference during the port.
6. Connected Devices communicates with the host using the `bee-plugin:ready`, `bee-plugin:init`, `bee-plugin:api-request` and `bee-plugin:api-response` message protocol. It also consumes host theme tokens.

This is a baseline description, not a claim that the migration is complete.

## Target architecture

The Control Horario package must include its complete browser frontend (HTML, JavaScript, styles and any required static assets) in the signed ZIP. The host loads the declared frontend entrypoint through the same trusted runtime used for Connected Devices. Remote navigation exposes the four existing Time Tracking sections and passes the host locale to the iframe.

The remote frontend must use the existing host bridge rather than storing credentials independently or calling arbitrary origins. It must receive tenant/user context from the host, use the authorized API bridge for backend requests, and respect host navigation and theme behavior.

The package manifest must declare the route, entrypoint, assets, role-aware navigation metadata and the API prefixes actually needed by the Time Tracking UI. The package digest and publisher signature must cover every frontend asset and its route metadata.

The branch now removes only the Time Tracking Angular frontend registration, component, API service, styles, template and host translation catalog. The host derives remote navigation generically from signed package route metadata; it contains no Time Tracking-specific navigation branch. Documents registration, component, translation catalog and Files-backed workspace remain untouched.

## Functional parity checklist

The migration is not complete until the remote frontend preserves all currently supported Time Tracking workflows:

- Current work session and clock-in / clock-out.
- Break start and end.
- Session history.
- Weekly schedule display and management.
- Correction requests and their review workflow.
- Team/member views and role-based management actions.
- Loading, empty, validation, success and error states.
- Locale-aware labels, dates, times and weekdays.
- Tenant isolation and permission enforcement.
- Responsive layout, keyboard access and host light/dark theme tokens.

The exact available actions must continue to be enforced by the backend; hiding a button in the frontend is not an authorization boundary.

## Required automated tests

| Area | Required evidence |
|---|---|
| Package builder | Time Tracking ZIP contains every declared frontend asset and entrypoint. |
| Integrity | ZIP digest and publisher signature verify after frontend assets are included. |
| Manifest | Route, API prefixes, package ID/version and asset declarations are consistent. |
| Host registry | Time Tracking navigation resolves from authorized remote package metadata without a static Angular registration. |
| Runtime bridge | Init/context, API request/response, errors, timeout and teardown are covered. |
| Authorization | Unauthorized tenants/roles cannot access data or perform management actions. |
| Browser E2E | Clock, breaks, history, schedules and corrections work from the ZIP frontend. |
| Regression | Connected Devices remains functional and Documents remains the native Angular workspace backed by Files. |
| Build | Backend tests, Angular production build and browser tests pass with zero skipped tests. |

## Validation record

The ZIP frontend and its route metadata are declared in the signed package. The Angular Time Tracking frontend files and static registration have been removed from the host, while Documents remains registered and unchanged. Remote navigation is now sourced from the installed signed ZIP manifest (including role visibility and localized labels); the iframe receives section, locale and theme context and uses the existing API bridge. The standalone JavaScript syntax has been checked directly.

The previous CI run #1055 (branch SHA d129b7d) failed on three migration-related issues: package assertions for Control Horario were accidentally placed in the Connected Devices test block; the old i18n tests still read the deleted Angular catalogue; and browser E2E tests still expected a native component instead of the signed ZIP iframe. These have been corrected in the consolidated revision, including E2E coverage that serves the ZIP assets and exercises clock actions, breaks, history, correction requests, schedules and team review. The consolidated revision has not yet been run through CI. VPS signature/install and visual validation remain unverified.

Record each run below with the exact branch SHA and result. Do not mark a check complete based only on a successful build or a test-discovery listing.

| Check | Result |
|---|---|
| Baseline source inspection | Done |
| ZIP-only frontend implementation | In progress | Angular frontend and static registration removed; signed ZIP frontend, route metadata and generic host navigation committed. Full browser parity and visual review pending. |
| ZIP frontend JavaScript syntax | Passed locally | Parsed successfully with the JavaScript engine; this is not a browser E2E test. |
| Package/signature tests | Pending re-run on consolidated revision |
| Remote runtime and bridge tests | Pending re-run on consolidated revision |
| Time Tracking browser E2E on ZIP frontend | Updated to exercise iframe assets and workflows; pending CI |
| Connected Devices regression | Pending |
| Documents / Files regression | Pending |
| VPS build, sign, install and visual validation | Pending |

## Release safety

Do not merge or release this branch until the ZIP frontend passes automated and manual parity checks. Build and sign package time-tracking version 0.2.2 on the owner's VPS using the configured publisher key pair; GitHub Actions must not generate or receive the private signing key. Keep the existing tenant data and package rollback path intact.
