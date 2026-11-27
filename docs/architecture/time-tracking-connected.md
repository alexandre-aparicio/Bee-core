# Time Tracking Connected — extension package

## Boundary

`time-tracking-connected` is an optional signed plugin package. It depends on both `connected-devices` and `time-tracking`.

- Connected Devices owns pairing, device credentials, device lifecycle, the capability registry and per-device grants.
- Control Horario owns time-entry records, validation, idempotency and business rules.
- Time Tracking Connected is the adapter between an authenticated device and the Control Horario device-operation contract. It owns no time-entry collections and does not import Control Horario repositories or HTTP handlers.

The package is manual-activation and contributes capabilities only while both `time-tracking-connected` and `time-tracking` are available for the tenant.

## Capability declarations

| ID | Operation | Required plugin |
|---|---|---|
| `time-tracking.clock-in` | Clock in | `time-tracking` |
| `time-tracking.clock-out` | Clock out | `time-tracking` |
| `time-tracking.records.read` | Read own status and sessions | `time-tracking` |

Each declaration contains a stable ID, localized display label/description, group/order, operation names, provider package ID and required package IDs. The registry returns only declarations whose provider and dependencies are available to the active tenant.

## Runtime service contracts

Connected Devices publishes:
- `connected-devices.capabilities`: registration and tenant-filtered discovery of extension declarations.
- `connected-devices.device-auth`: authenticate the device credential and authorize a capability against a live declaration, active device, active owner membership and the persisted per-device grant.

Control Horario 0.2.3 publishes:
- `time-tracking.device-api`: clock-in, clock-out, status and own-session reads. It delegates to the existing Control Horario handlers, preserving their validation, idempotency and response status codes.

Time Tracking Connected consumes these services through `ctx.services`. It does not import either module's private repository or route implementation.

## Device API

The extension uses its own non-overlapping API prefix, separate from Connected Devices and Control Horario:

| Method | Path | Required capability |
|---|---|---|
| POST | `/time-tracking-connected/device/clock-in` | `time-tracking.clock-in` |
| POST | `/time-tracking-connected/device/clock-out` | `time-tracking.clock-out` |
| GET | `/time-tracking-connected/device/status` | `time-tracking.records.read` |
| GET | `/time-tracking-connected/device/sessions` | `time-tracking.records.read` |

Every request authenticates `Authorization: Bearer <device-credential>`. The server derives tenant and owner user IDs from the stored device record; it never accepts them from the request body. Clock operations require an `operationId` and use the existing Control Horario handler. The device owner must still be an active company member and have an allowed Control Horario role; unknown/custom roles and restricted memberships currently fail closed.

## Package publication

The package builder includes `time-tracking-connected` as a separate signed ZIP package version 0.1.0. Its manifest dependencies are `connected-devices` and `time-tracking`. Connected Devices is version 0.3.0 and Control Horario is version 0.2.3 because these versions publish the required runtime contracts.

## Validation status

Source and package-builder definitions are present on `feature/connected-devices-capability-extensions`. No build, test, GitHub workflow, package signing or VPS validation has been run yet. Final validation is intentionally deferred until the end-to-end implementation is ready.
