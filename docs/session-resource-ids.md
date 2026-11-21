# Session-bound resource identifiers

## Status

The runtime migration is implemented in the API layer. All authenticated JSON requests and responses pass through the central session-ID middleware registered by the auth plugin. Production build, automated tests and full browser flows must pass in GitHub Actions before this is marked verified.

## Contract

- MongoDB keeps its existing internal IDs. No database relationship or foreign key is rewritten.
- Authenticated clients receive opaque, randomized references instead of internal tenant, plugin, user, membership, role, invitation, file, note, job, audit, installation and subscription IDs.
- Each reference is encrypted with AES-256-GCM using a key derived from `JWT_SECRET` and the persisted session ID. A deterministic 96-bit nonce is derived from the session key, resource type and internal ID, keeping a resource reference stable within one session while producing a different reference in a new session.
- The encrypted payload includes resource type, internal ID, session ID and the session's absolute expiry. References are therefore type-bound, session-bound and time-bound.
- A new login creates a new session and new references. References from another session, a revoked session, a different resource type, a modified value or an expired session are rejected.
- Refresh-token rotation retains the same session and does not extend its absolute 30-day expiry. Existing references remain valid until that expiry; the client receives the remaining refresh lifetime.
- Logout revokes the persisted session. The API middleware rejects the session before route handlers run, invalidating all references immediately.

## API integration

- The auth plugin owns JWT registration and the central Fastify `preValidation` / `preSerialization` hooks.
- Incoming route parameters, query parameters and typed JSON body fields are unmasked before plugin handlers access MongoDB.
- Typed resource fields in JSON responses are masked before serialization, including nested objects and arrays.
- JWT `sub` and `tenantId` claims contain encrypted references rather than internal user or tenant IDs. The random `sid` identifies the active session; authorization resolves user and tenant from the persisted session and verifies both encrypted claims.
- Company switching issues new encrypted user/tenant claims bound to the same persisted session.
- Public tenant resolution returns a public tenant slug rather than a database ID. Public template responses omit tenant IDs. Public plugin page identifiers remain stable package slugs, not database record IDs.
- The billing entitlement webhook is intentionally excluded from session-ID translation because it authenticates with its separate machine-to-machine webhook secret; its tenant reference is validated server-side.

## Security requirements

- Never use a masked reference as an authorization decision. Every protected handler must continue to enforce session validity, tenant membership, role/permission checks and tenant-scoped database queries.
- Keep `JWT_SECRET` private and at least 32 characters long. Rotating it invalidates existing JWTs and references, requiring users to sign in again.
- Do not log raw IDs, decrypted references or access/refresh tokens.
- Any new resource ID field or route parameter must be added to `RESOURCE_FIELDS` / `RESOURCE_CONTAINERS` in `src/core/session-id.ts` and covered by tests.
- Public endpoints must not return internal database IDs. If a public flow needs a reference, use a non-sensitive public slug or a separately designed short-lived public capability.

## Verification

Unit tests cover opacity, session stability, session separation, type substitution, tampering, expiry and recursive API translation. Integration tests exercise authentication, company switching, files, plugin lifecycle and platform administration through the central middleware. A successful GitHub Actions run is required before claiming end-to-end verification.
