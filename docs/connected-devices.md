# Connected Devices

Status: proposed platform capability — **not implemented** and excluded from the verified MVP completion score.

## Product vision

Bee-Core should allow an authorized physical device or companion application to connect to a user account, company (tenant), and selected Bee-Core capabilities. The dashboard will provide a **Connected Devices** area where authorized users can create pairing requests, review linked devices, inspect granted capabilities, and revoke access.

The goal is to make Bee-Core an extensible platform that is not limited to browser sessions. A phone, tablet, handheld scanner, POS terminal, kiosk, or purpose-built companion app can act as a trusted endpoint for plugins.

## QR pairing experience

1. An authorized user opens Settings → Connected Devices and chooses Link a device.
2. They select the intended company/context and device type or use case. Bee-Core displays a short-lived QR code.
3. The companion application scans the QR and authenticates the person linking it. Scanning alone grants no access.
4. Bee-Core displays the device identity and exact requested capabilities. The user explicitly approves the pairing.
5. The server consumes the one-time challenge, registers the device against the authorized user and tenant, issues device credentials, and records an audit event.
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
- Define device identity, tenant ownership, roles, scope vocabulary, and threat model.
- Implement one-time QR challenges and explicit approval.
- Implement device registry, credential rotation, last-seen status, audit, and immediate revocation.
- Test cross-tenant isolation, expired/replayed challenges, stolen/revoked credentials, stale membership, and unauthorized scopes.
- Acceptance: a device can be linked and revoked without exposing reusable secrets in QR content; it cannot access another tenant or exceed approved scopes.

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

## Scope and status

This is a proposed platform roadmap capability. It is **not currently implemented**, must not be represented as an existing Bee-Core feature, and must not increase MVP progress or release-readiness percentages. Start with secure pairing and the device registry only after architecture, privacy model, and acceptance tests are approved.
