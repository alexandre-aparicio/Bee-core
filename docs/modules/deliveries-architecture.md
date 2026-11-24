# Entregas y Recogidas — arquitectura

## Boundary
Deliveries is an independent tenant business plugin. It owns its operation records, references, recipient/address snapshot, assignments, planned dates, workflow status and audit timestamps in `tenant_deliveries`. All persistence uses `TenantCollection`; no other plugin collection is read or written.

## Dependencies and integrations
- Hard runtime dependencies: Auth, Organizations and Marketplace, matching the existing tenant-plugin lifecycle.
- Documents: optional integration. Delivery metadata remains valid without Documents. A later adapter may create/link signed delivery notes, receipts and supporting files through the Documents public API. Deliveries must not access Documents or Files collections or storage paths.
- Connected Devices: optional capability provider for camera capture, location and QR/barcode scanning. A browser-only workflow remains supported. No device pairing or device credential logic is implemented in Deliveries.
- Time Tracking: no dependency and no integration.

Optional integrations must be capability-detected and fail gracefully; they must never prevent the core delivery workflow from loading.

## Initial workflow
Kinds: delivery and pickup.
Statuses: draft → assigned → picked_up → in_transit → delivered; failed and cancelled are controlled terminal/recovery paths. Invalid transitions are rejected by the backend.
Managers can assign or reassign an operation to any active member of the same company, or leave it unassigned. The API validates the masked member reference against an active membership in the current tenant. Members only receive operations assigned to them; they can advance their own operation. Managers can see and manage all operations.
Operations are tenant-scoped and IDs returned to the dashboard are session-bound references.

## API
- GET /deliveries
- POST /deliveries
- PATCH /deliveries/:deliveryId
- DELETE /deliveries/:deliveryId (draft/cancelled only)

## Follow-up phases
1. Dispatch board, scheduling filters and assignment history.
2. Optional Documents adapter for signed proof-of-delivery and attachments.
3. Optional Connected Devices adapter for camera/GPS/scanner capabilities.
4. Customer signatures, timestamps, geolocation evidence, incident reasons and offline mobile queue.
5. Notifications, route planning and reporting.
