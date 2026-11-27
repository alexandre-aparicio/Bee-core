# Time Tracking Connected — extension package

## Boundary

`time-tracking-connected` is an optional signed plugin package. It depends on both `connected-devices` and `time-tracking`.

- Connected Devices owns pairing, device credentials, device lifecycle, the capability registry and per-device grants.
- Control Horario owns its Native Federation frontend, time-entry records, validation, idempotency, effective permissions and business rules.
- Time Tracking Connected is a thin adapter between an authenticated device and the Control Horario device-operation contract. It owns no time-entry collections and does not import Control Horario repositories or HTTP routes.

The architecture follows the package boundary established by `refactor/time-tracking-connected-devices-architecture`: Control Horario remains an independently installable business package with its own frontend remote and API prefix. The companion extension is a separate package; it does not become a frontend feature or dependency of Connected Devices.

The package is manual-activation and contributes capabilities only while the extension and its required business package are available for the tenant.

## Capability declarations

| ID | Operation | Required plugin |
|---|---|---|
| `time-tracking.clock-in` | Clock in | `time-tracking` |
| `time-tracking.clock-out` | Clock out | `time-tracking` |
| `time-tracking.records.read` | Read own status and sessions | `time-tracking` |

Each declaration contains contract version 1, a stable ID, display label/description, group/order, operation names, provider package ID and required package IDs. The registry returns only declarations whose provider and dependencies are available to the active tenant.

The initial Android scope intentionally remains limited to clock-in, clock-out and own-record reads. Breaks, schedules and correction workflows remain Control Horario business functionality and are not exposed as companion capabilities until their mobile interaction and permission model are designed explicitly.

## Runtime service contracts

Connected Devices publishes:
- `connected-devices.capabilities`: registration and tenant-filtered discovery of extension declarations.
- `connected-devices.device-auth`: authenticate the device credential and authorize a capability against a live declaration, active device, active owner membership and the persisted per-device grant.

Control Horario 0.2.4 publishes:
- `time-tracking.device-api`: clock-in, clock-out, status and own-session reads. It delegates to the existing Control Horario handlers, preserving their validation, idempotency and response status codes.
- Before executing a handler, the service verifies that Control Horario is available for the tenant, the linked user is an active member, and the user's effective permission set includes the required Control Horario permissions.
- Effective permissions are resolved from Core's tenant role policy, plugin permission catalogue, custom-role grants and restriction roles. Unsupported or incomplete authorization context fails closed. The device extension no longer duplicates role defaults or assumes that a role name implies permission.

Time Tracking Connected consumes these services through `ctx.services`. It does not import either module's private repository or route implementation. It checks device authentication, extension availability and the per-device capability grant; Control Horario remains the authority for business authorization.

## Device API

The extension uses its own non-overlapping API prefix, separate from Connected Devices and Control Horario:

| Method | Path | Required capability |
|---|---|---|
| POST | `/time-tracking-connected/device/clock-in` | `time-tracking.clock-in` |
| POST | `/time-tracking-connected/device/clock-out` | `time-tracking.clock-out` |
| GET | `/time-tracking-connected/device/status` | `time-tracking.records.read` |
| GET | `/time-tracking-connected/device/sessions` | `time-tracking.records.read` |

Every request authenticates `Authorization: Bearer <device-credential>`. The server derives tenant and owner user IDs from the stored device record; it never accepts them from the request body. Clock operations require an `operationId` and use the existing Control Horario handler. The device capability grant and Control Horario's effective user permissions are both required; neither replaces the other.

## Package publication

Time Tracking Connected is published as its own signed ZIP package version 0.1.2 and declares both dependency layers using the existing package contract:

- Platform/runtime `dependencies`: `connected-devices` and `time-tracking`. The existing superadministrator package installer rejects the ZIP unless both packages are already installed and healthy on the platform.
- Tenant `tenantDependencies`: `connected-devices` and `time-tracking`. The existing Marketplace activation/install checks require both plugins to be authorized for that tenant and installed and enabled before activating the extension. The same check is repeated by the durable worker. It does not grant entitlements, install dependencies automatically or change who can manage plugins.

The existing authorization model is unchanged: only the platform superadministrator installs/uninstalls packages and authorizes their availability for tenants, individually or through plans. A tenant can enable or disable only plugins already authorized for it, using the existing Marketplace controls. The extension's tenant activation is manual. At runtime, its capabilities are exposed only while the extension and both base plugins are available/enabled for that tenant. Missing either base plugin prevents extension installation/activation for that tenant, without changing who can install, authorize or activate any plugin.

This is deliberately not a dependency from Control Horario to Connected Devices. Control Horario remains independently installable and usable in web. Only the optional `time-tracking-connected` adapter requires both modules. Connected Devices is version 0.3.0 and Control Horario is version 0.2.4 because the latter publishes the permission-aware device service contract.

## Validation status

Source and package-builder definitions are present on `feature/connected-devices-capability-extensions`. The package manifest now declares both mandatory tenant dependencies as well as both runtime dependencies. The existing platform package dependency resolver and tenant `tenantDependencies` activation checks enforce both prerequisites at their respective levels; superadministrator installation and tenant authorization/activation roles remain unchanged. They have not been built, tested, signed or validated on the VPS. GitHub Actions and automated tests remain intentionally deferred until the end-to-end implementation is ready.
