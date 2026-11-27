# Connected Devices

## Runtime, packaging and plan migration

Connected Devices is delivered as a signed ZIP package containing its backend entrypoint and its Angular Native Federation frontend. The frontend source, HTML template, component-scoped styles and QR renderer live under `plugins/connected-devices/frontend`; the package builder adds the separately built remote artifacts to the signed ZIP. The core web application contains only the generic federation host and plugin outlet: it does not statically import or register the Connected Devices component. The remote exposes `PluginComponent` and is mounted in the host Angular view tree with `ViewContainerRef.createComponent`; Connected Devices does not use an iframe. The Marketplace runtime endpoint issues a short-lived, tenant-session-bound asset grant, and every remote asset request revalidates the session, membership, user, entitlement, installation, enablement and loaded package state. The component calls the tenant-scoped `/api/connected-devices` routes with the current dashboard access token. The Connected Devices package version is `0.3.0`.

The legacy bundled plan inclusion is restored by a one-time, ledgered migration after the signed ZIP is installed and its runtime is loaded. It creates `plugin_plan_package_assignments` for Starter, Pro and Enterprise only when no assignment or migration-ledger entry exists. Assignments use `source: "legacy-bundled-migration"`. The ledger records pre-existing assignments and explicit Platform Admin removals, so a later startup cannot silently re-add a package removed by an administrator. The migration changes no tenant installation, device, pairing or other tenant data.

**Owner operational step if the ZIP is uploaded after Bee-Core startup:** after uploading and verifying the Connected Devices signed ZIP in Platform Admin, restart Bee-Core once so startup can load the package and run the migration. Then open Platform Admin → Plugins → Connected Devices → Plans and confirm Starter, Pro and Enterprise are assigned. If a restart is not possible, use the same Plans control to assign the intended plans explicitly. Do not delete tenant data or recreate installations as part of this step.

## Angular frontend and theming

The remotely loaded Angular component inherits the dashboard's active theme and semantic `--bee-*` CSS variables directly because it is mounted in the same Angular view tree. It does not use an iframe, cross-frame theme bridge or postMessage API bridge. The generic host supplies tenant, role, access-token and authorized asset-base inputs; API authorization and tenant isolation remain enforced by the signed backend plugin. Native Federation shares Angular and RxJS as strict singletons. This is same-realm trusted code, not a security sandbox.

The device simulator deliberately remains a separate developer/test asset at `apps/web/src/assets/device-simulator/index.html`, not part of the production plugin frontend. It uses the same-origin `/api` path by default. Keep the existing style-guard allowlist for `src/assets/device-simulator/**`, the explicit Capacitor CORS origins and `x-device-pairing-secret` preflight header, and the existing CSP boundaries: the standalone same-origin simulator can reach the API, while sandboxed package frontends use the host API bridge. No wildcard CORS or broader plugin CSP is required.

Actual signed ZIP publication, the one-time plan confirmation, tenant installation/upgrade/uninstall/reinstall, and visual checks of the remotely mounted component in every template and mode remain owner-side operational checks. Automated checks are intentionally deferred until the agreed final validation phase.

Status: **Phase A implementation** — the plugin is optional and independently installed/enabled per tenant. No POS, inventory, GPS tracking or realtime business workflow is included.

## Product vision

Bee-Core should allow an authorized physical device or companion application to connect to a user account, company (tenant), and selected Bee-Core capabilities. The dashboard will provide a **Connected Devices** area where authorized users can create pairing requests, review linked devices, inspect granted capabilities, and revoke access.

The goal is to make Bee-Core an extensible platform that is not limited to browser sessions. A phone, tablet, handheld scanner, POS terminal, kiosk, or purpose-built companion app can act as a trusted endpoint for plugins.

## QR pairing experience

1. An authorized user opens the Connected Devices workspace and chooses Link a device.
2. They select the intended company/context and device type or use case. Bee-Core displays a short-lived QR code.
3. The companion application scans the QR and authenticates the person linking it. Scanning alone grants no access.
4. Bee-Core displays the device identity and exact requested capabilities. The user explicitly approves the pairing.
5. The server atomically consumes the one-time challenge, registers the device against the authorized user and tenant, and issues a separate device credential. The credential is stored as a hash and cannot authenticate until approval.
6. The dashboard shows the linked device, last-seen time, status, granted scopes, and available actions. Authorized users can rename, suspend, or revoke it.

Pairing challenges must be unpredictable, single-use, short-lived, rate-limited, and bound to the intended tenant, initiating user/session, and requested context. QR payloads contain only an opaque pairing reference, never a reusable access token, refresh token, API key, or personal data. Expired, consumed, cancelled, or revoked challenges fail closed.

## Device registry and authorization

A device is a separately identifiable client, not a user and not a way to bypass user or tenant authorization.

The target registry should record:
- Stable device ID and tenant ID.
- Linking user and, where applicable, owning membership.
- Human-readable name, device type, application ID/version, and platform.
- Lifecycle state: pending, active, suspended, revoked, or expired.
- Granted capability scopes and the purpose for which they were approved.
- Credential/session metadata, creation/expiry/last-seen timestamps.
- Minimal diagnostic metadata, avoiding unnecessary personal data.

All tenant-owned device records and device-originated data must be tenant-scoped. Every request validates the device credential, current device status, tenant status, relevant membership/authorization state, and requested scope. A device must not inherit unrestricted permissions from the user who paired it. Device permissions are revocable independently of normal browser sessions.

Device credentials should be high-entropy, stored hashed where applicable, renewable with rotation, and revocable. Refresh/replay detection, rate limits, audit events, and secure transport are required. Lost devices must be revocable immediately. Sensitive actions may require fresh user confirmation or step-up authentication.

## Capability and permission model

Expose explicit, least-privilege capabilities rather than general API or database access. Illustrative scopes include:
- location.read — submit location updates after operating-system permission is granted;
- catalog.read — retrieve catalog data required by an authorized plugin;
- inventory.read and inventory.write — perform permitted inventory operations;
- pos.session.read and pos.order.write — interact with authorized POS sessions and orders;
- scanner.use — submit barcode/QR scan results;
- camera.capture — use camera features through the companion app and OS permission;
- notifications.receive — receive scoped notifications;
- device.status.write — report health, connectivity, and application status.

These names are illustrative, not a finalized API contract. Plugins declare the device capabilities they need. Tenant administrators approve only required scopes. Bee-Core authorization cannot override iOS or Android permission prompts or background-execution policies.

## Example use cases

### Live location and field operations

A user links a mobile app by scanning the QR code. After a separate, explicit location permission flow, the app sends location events to Bee-Core. An authorized fleet, field-service, delivery, attendance, or asset-tracking plugin can display the latest permitted position and, where appropriate, location history.

Requirements:
- Explain who can see location, for what purpose, and for which period.
- Provide visible tracking state and a simple pause/stop control in the mobile app.
- Handle foreground/background location permission through the operating system.
- Configure update frequency, accuracy, retention, and battery-aware behavior.
- Enforce tenant- and role-scoped access, auditability, and deletion/retention policy.
- Never assume QR pairing enables continuous GPS or guarantees background delivery.

Location is sensitive personal data. Collection must be purpose-limited, minimized, transparent, and compliant with applicable privacy and employment laws. The platform must not silently track a person.

### Mobile POS companion or handheld terminal

A phone or handheld device can be linked to a tenant and an authorized POS plugin. Depending on granted scopes, it may:
- Download or synchronize an allowed product catalog, prices, taxes, and relevant stock data.
- Scan barcodes and search products.
- Add items to a draft order or authorized POS session.
- Submit order changes and receive status updates.
- Queue permitted operations offline and synchronize them when connectivity returns.

The device must not write directly to MongoDB or bypass POS business rules. Mutations go through authenticated plugin APIs validating tenant, POS session, user/device scopes, product availability, pricing, taxes, and order state. Offline operations need idempotency keys, conflict handling, clear synchronization status, and auditable reconciliation. Sensitive payment-card data should remain with a compliant payment terminal/provider; the companion device must not become an unreviewed card-data store.

### Other device categories

The same pairing and scoped-capability model could support barcode scanners, tablets, kiosks, printers, digital signage, warehouse terminals, IoT gateways, and other devices. Each integration is delivered by a plugin or supported device adapter; the core owns identity, pairing, authorization, lifecycle, and secure event transport.

## Target architecture

- **Core device service:** pairing challenges, registry, device lifecycle, credentials, scope checks, revocation, audit, and tenant context.
- **Companion SDK/API:** documented authentication, capability discovery, scoped requests, event submission, and reconnect behavior.
- **Realtime/event transport:** authenticated, tenant-scoped channels with short-lived connection tickets and revalidation; devices receive no broad event-bus access.
- **Plugin integration:** plugins declare supported device types/scopes and implement business workflows through their existing service/API boundaries.
- **Dashboard UI:** connected-device list, QR pairing flow, approval details, capability review, last-seen/status, suspend/revoke, and audit history.
- **Mobile application:** pairing, sign-in, consent screens, OS permission requests, secure credential storage, background task handling, and visible connection/tracking controls.

The core should remain device-vendor-neutral. A first-party mobile companion app can demonstrate the contract, while third parties can build compatible clients against a documented, versioned API.

## Suggested data and API boundaries

These are conceptual resources, not implemented endpoints or finalized schemas:
- device_pairing_challenges — opaque one-time challenge references, tenant/user binding, requested scopes, expiry, and consumption state;
- connected_devices — tenant-scoped device identity, owner, status, metadata, and granted scopes;
- device_sessions — revocable credential/session metadata and rotation state;
- device_events — scoped event metadata or references, with appropriate retention.

Potential API operations include creating/cancelling a pairing challenge, exchanging a challenge after authenticated approval, listing/getting/renaming/suspending/revoking devices, refreshing/revoking device sessions, discovering allowed capabilities, and submitting scoped device events. Exact routes, schemas, indexes, transport, and retention must be designed before implementation.

## Delivery phases and acceptance criteria

### Phase A — Secure pairing and device registry

Implementation status on `feat/connected-devices-plugin`:
- [x] Standalone backend plugin (`connected-devices`) with no dependency on TPV, Documents, Inventory or other business plugins; only the shared Auth runtime is required.
- [x] Tenant-scoped device and pairing-challenge collections with indexes.
- [x] Five-minute, random, one-time QR pairing token stored only as a SHA-256 hash; replay/expiry checks and atomic claim.
- [x] Companion credential is separate from the QR token, stored only as a hash and unusable while the device is pending approval.
- [x] Explicit owner/admin approval with a fixed capability vocabulary and grants restricted to the requested subset.
- [x] Own-device visibility for regular members; organization administrators can review tenant devices.
- [x] Immediate credential revocation and tenant/plugin activation checks on dashboard and device authentication.
- [x] Heartbeat and exported `hasConnectedDeviceCapability(db, tenantId, deviceId, capability)` contract for future consumer plugins.
- [x] Device suspension/reactivation by owner/admin and one-time credential rotation by the authenticated device; revoked credentials are replaced atomically.
- [ ] Audit events, rate limiting and operational alerting.
- [ ] Automated integration coverage for cross-tenant isolation, expiry/replay, approval, membership removal and revoked credentials.
- [ ] Runtime validation/build/CI and end-to-end companion-client scan test.

The phase remains **in progress** until the remaining controls and security tests are complete. The QR payload contains only the one-time pairing token; it never contains a reusable device credential.

### Phase B — Companion client and realtime foundation
- Publish a versioned device API/SDK and minimal companion application.
- Add secure credential storage, reconnect behavior, scoped realtime/event delivery, and visible device status.
- Acceptance: revoked, suspended, expired, or out-of-scope devices are rejected promptly, including on existing realtime connections.

### Phase C — First device capability
- Choose one focused reference integration, such as barcode scanning into a draft POS order.
- Implement plugin-declared scopes, server-side business validation, audit, and idempotent operations.
- Acceptance: device actions are tenant- and role-authorized and cannot bypass plugin business rules.

### Phase D — Location and advanced workflows
- Add opt-in location capability with explicit consent, OS permissions, visible tracking controls, configurable frequency/retention, and access audit.
- Validate background behavior and battery/privacy impact on supported mobile platforms.
- Acceptance: tracking starts only after explicit authorization, can be paused/stopped and revoked, and is visible only to authorized roles.

### Phase E — Ecosystem
- Document third-party device adapters, certification/security requirements, supported categories, and compatibility/version policy.
- Add POS, inventory, field-service, kiosk, printer, and IoT integrations through plugins.


### Implemented API surface (Phase A)

All paths below are plugin-owned and are mounted under the normal Bee-Core API prefix:

| Method | Path | Purpose |
|---|---|---|
| POST | `/connected-devices/pairing-challenges` | Authenticated user creates a five-minute one-time QR challenge with requested capabilities (maximum five outstanding challenges per user). |
| POST | `/connected-devices/pair` | Companion exchanges the QR token once and receives a pending, not-yet-authorized device credential. |\n| POST | `/connected-devices/pairing-challenges/:challengeId/cancel` | Owner or tenant admin cancels an unused challenge; if already claimed, its pending/active device is revoked. |
| GET | `/connected-devices/pairing-status` | Companion checks approval using the pairing secret header. |
| GET | `/connected-devices` | Lists the current user's devices, or the tenant registry plus owner identity for owner/admin. Expired pending requests are marked `expired`. |
| POST | `/connected-devices/:deviceId/approve` | Owner/admin approves a subset of requested capabilities. |
| POST | `/connected-devices/:deviceId/suspend` / `activate` | Owner/admin suspends or reactivates a device. |
| POST | `/connected-devices/:deviceId/revoke` | Owner/admin or device owner permanently revokes access. |
| PATCH | `/connected-devices/:deviceId` | Renames a device. |
| POST | `/connected-devices/device/unlink` | Companion cancels its own pending or active pairing with its device credential and invalidates the local authorization. |
| POST | `/connected-devices/device/heartbeat` | Active device updates its last-seen timestamp. |
| POST | `/connected-devices/device/rotate-credential` | Active device atomically rotates its credential; the new value is returned once. |
| GET | `/connected-devices/device/me` | Returns the authenticated device's non-secret profile and granted capabilities. |

The backend plugin depends on the shared Auth, Organizations and Marketplace access-contract services; it has no dependency on TPV, Documents, Inventory or other business extensions. The plugin manager exposes only the database name and derived session-resource secret to this plugin. Dashboard routes re-resolve the active membership and tenant session. Device authentication rechecks plugin entitlement/installation/activation and the linked user's active membership; membership removal causes device access to fail closed and revokes the credential on the next authenticated request. Consumer plugins should use the exported server-side `hasConnectedDeviceCapability` contract after validating their own authenticated tenant context.

## Scope and status

The first implementation is being developed as an optional, standalone plugin. It must not increase MVP progress or release-readiness percentages until security tests, CI and runtime acceptance checks pass. TPV and all other business plugins remain independent; future extensions may depend on Connected Devices, but Connected Devices must never depend on them.


## Browser companion simulator

A mobile-first browser companion is included at `/assets/device-simulator/index.html` after the Angular web app is built and deployed. On desktop it is presented inside a phone frame; on narrow screens it expands to a full-height mobile viewport with a status bar, app header, compact connection cards and bottom navigation. Open it from the same Bee-Core origin, paste the full `bee-device://pair?token=...` payload displayed by **Connected Devices → Link a device**, and choose **Pair this device**. The simulator exchanges the one-time token, displays the pending device ID, and checks approval every four seconds. Approve the device in the dashboard; once active, the simulator sends a REST heartbeat every ten seconds and displays the server acknowledgement.

The API base defaults to `/api`, matching the dashboard proxy. If the simulator is hosted elsewhere, the API must explicitly allow that origin and the browser's credential/header restrictions must be respected. The simulator keeps the returned device credential in memory only; disconnecting or reloading clears it. Use it only against a development/test tenant and revoke the test device when finished.

**Transport limitation:** this simulator validates the currently implemented HTTP pairing, approval-status and heartbeat endpoints. The current plugin does not yet expose a device WebSocket/realtime endpoint. A successful heartbeat therefore proves authenticated REST connectivity, not a persistent socket connection.


## Browser simulator heartbeat request

The browser simulator sends an explicit empty JSON object (`{}`) with the authenticated heartbeat POST. The API request helper sets `Content-Type: application/json`; sending no body with that header can be rejected by Fastify's JSON parser before the device authentication handler runs. The heartbeat route itself does not require payload fields. This client-side correction does not change device authentication or authorization.

## Device card lifecycle actions

Each device card exposes a vertical three-dot action menu. **Unlink** invalidates the current credential, clears granted capabilities and retains the device record as `unlinked`; a new one-time QR pairing creates a fresh device identity and credential. **Revoke** permanently invalidates the current device credential and keeps the revoked record for audit/history. **Suspend** temporarily blocks access and can be reversed by reactivation. **Delete** permanently removes the tenant-scoped device record and cancels its claimed pairing challenge; it is restricted to organization administrators. Unlink and delete are distinct: unlink preserves history, delete removes the record.


## Device lifecycle confirmation dialogs and JSON request headers

Device lifecycle actions require an explicit browser confirmation before destructive or access-changing operations. API errors and operation results are displayed inline in the Angular component.

The Connected Devices API client now adds `Content-Type: application/json` only when a request actually has a body. Body-less DELETE requests no longer advertise an empty JSON payload, avoiding Fastify's `FST_ERR_CTP_EMPTY_JSON_BODY` parser error. Mutating POST operations that require an empty JSON payload continue to send an explicit `{}` body.


## Dashboard 0.1.5 — organization-style device directory

Version 0.1.5 updates only the native Angular dashboard experience and plugin version metadata. The Connected Devices workspace now follows the Organization directory interaction pattern: a page heading, four summary metrics, search, status and device-type filters, cards/table view selection, and a New device action that opens a modal for capability selection and QR pairing. Device approval and lifecycle actions remain connected to the existing plugin API.

The module consumes shared directory, statistic, card, badge, table, menu, button and dialog primitives from `apps/web/src/app/templates/base/base.css`. It does not declare component-local visual styles. These primitives use the existing semantic `--bee-*` tokens so the active template continues to control the visual treatment. The backend routes, tenant authorization, pairing token model, credential handling and device lifecycle semantics are unchanged.

Automated browser coverage must verify the heading, summary cards, search/filtering, card/table switching, modal opening and QR generation/cancellation, device approval, and bodyless DELETE behavior. Visual verification across all six templates and Light/Dark modes remains a separate acceptance check.

## Extensible capability model — new architecture decision

The device-pairing flow is a permanent capability of the Connected Devices base plugin and must always remain available. It is not a module-provided feature and must never be disabled by the absence of business extensions.

The Connected Devices UI separates the permanent **Pair device** action from optional, dynamically contributed device capabilities:

- **Pair device:** always visible and enabled. It creates the QR pairing challenge and remains usable even when no extension is installed.
- **Optional capabilities:** shown only when an installed and enabled extension declares them. Each capability has an administrator-controlled check/uncheck state (grant/revoke) for the relevant device or policy. Unavailable extensions must not leave stale or phantom options in the UI.
- **Authorization:** checked UI state is not sufficient authorization. Every device operation must be enforced server-side against tenant, active device, user/membership, extension installation and activation, capability grant, and the extension's own business permissions. Revocation must take effect on subsequent requests and relevant realtime sessions.

Extensions integrate through a versioned, explicit capability-contribution contract. They declare stable capability IDs, labels, descriptions, grouping/order metadata and the operations they expose; Connected Devices discovers and renders those declarations without importing extension-specific business logic. Installation/activation registers the contribution; disable/uninstall removes it from the available catalogue and revokes or invalidates grants safely. Re-enabling/reinstalling must not silently restore previously revoked device grants.

### Example: Control Horario Connected

Control Horario remains an independent business module. Its companion integration is a separate extension package, **Control Horario Connected**, which depends on Connected Devices and the Control Horario backend contract. When installed and enabled, it contributes capabilities such as:

- `time-tracking.clock-in` — registrar entrada.
- `time-tracking.clock-out` — registrar salida.
- `time-tracking.records.read` — consultar registros de jornada.

These options appear in Connected Devices only while the extension is available. Administrators can check/uncheck the permitted capabilities for a device. The Android companion discovers the currently granted catalogue and displays only those actions. The extension executes the actual clock-in/out and record queries through its own authenticated APIs and business rules; Connected Devices owns pairing, device identity and capability grants, not time-tracking logic.

### Acceptance criteria for this workstream

- [ ] Pair-device action is always visible and enabled with only the base Connected Devices plugin installed.
- [ ] Base installation exposes no business actions or placeholder checkboxes.
- [ ] Installing/enabling an extension adds only its declared capability options.
- [ ] Each optional capability can be granted and revoked independently per device (subject to tenant policy).
- [ ] Android discovery returns only capabilities currently available and granted to that device.
- [ ] Extension disable/uninstall removes its options and makes its operations fail closed; stale grants cannot authorize calls.
- [ ] Reinstall/reenable does not silently regrant previously revoked permissions.
- [ ] Cross-tenant isolation, membership changes, revoked/suspended devices and extension lifecycle are covered by automated tests.
- [ ] The Control Horario Connected reference extension demonstrates clock-in, clock-out and records-read without adding a dependency from Connected Devices to Control Horario.

### Implementation status — capability extensions

The first implementation slice is now present on `feature/connected-devices-capability-extensions`. It has **not been built, tested or validated on the VPS yet**; automated tests and GitHub workflows are intentionally deferred until the end-to-end implementation is ready.

Implemented in source:
- Connected Devices publishes a typed, runtime capability registry service. Extension declarations have stable IDs, provider package IDs, labels, descriptions, groups, order and operation names.
- The base capability catalogue is empty unless an extension registers declarations. The former hard-coded capability list is no longer used as the default allowlist.
- Dashboard API exposes the tenant-available catalogue at `GET /connected-devices/capabilities`.
- Pairing accepts zero requested capabilities. Pair-device remains available even when no extension is installed.
- Administrators can replace the grant set for an active device through `PATCH /connected-devices/:deviceId/capabilities`; the backend validates each ID against the currently available catalogue.
- Device discovery is available through `GET /connected-devices/device/capabilities` and `GET /connected-devices/device/me`; both return only currently available, granted capabilities.
- The Connected Devices Angular remote loads its catalogue dynamically, offers pairing with an empty catalogue, and renders optional per-device grant controls only when declarations exist.
- A separate signed-package definition and backend plugin source for `time-tracking-connected` contributes `time-tracking.clock-in`, `time-tracking.clock-out` and `time-tracking.records.read`. Its operations delegate to the existing Control Horario handlers, check device grants, package availability and active owner membership, and fail closed for unsupported/restricted roles.
- The separate `alexandre-aparicio/Bee-devices` repository branch `feature/capability-aware-companion` now contains an Ionic/Angular + Capacitor app scaffold with ML Kit QR scanning, pairing approval polling, dynamic capability discovery, the three Control Horario actions, unlink and capability refresh on app resume. Device credentials remain memory-only.

New API surface:

| Method | Path | Purpose |
|---|---|---|
| GET | `/connected-devices/capabilities` | Returns declarations from extensions available to the active tenant. |
| PATCH | `/connected-devices/:deviceId/capabilities` | Owner/admin replaces the active device's granted capability IDs. |
| GET | `/connected-devices/device/capabilities` | Companion obtains only the capabilities currently granted and available. |
| GET | `/time-tracking-connected/device/status` | Control Horario Connected returns the owner's current session. |
| GET | `/time-tracking-connected/device/sessions` | Returns the owner's own closed sessions. |
| POST | `/time-tracking-connected/device/clock-in` | Registers entry with an idempotency operation ID. |
| POST | `/time-tracking-connected/device/clock-out` | Registers exit with an idempotency operation ID. |

Remaining before VPS acceptance:
- Secure persistence using Android Keystore and lifecycle-aware capability refresh in Bee Devices.
- Resolve full custom-role and restriction-role permission context through a Core-owned authorization contract rather than the current fail-closed restriction.
- Add lifecycle handling to clear extension grants when an extension is uninstalled, and verify package disable/re-enable behavior.
- Build and install the signed Connected Devices 0.3.0 and Time Tracking Connected 0.1.0 packages, build/sync the Android app, and validate on the VPS/device.
- Run the agreed backend, package, browser, security and Android integration tests only after the implementation is complete.

No tests or GitHub Actions have been run for this implementation slice. Bee-Core `main` and the deployed VPS have not been changed. Bee Devices work is isolated on `feature/capability-aware-companion`; its `main` branch remains at its original scaffold commit.

