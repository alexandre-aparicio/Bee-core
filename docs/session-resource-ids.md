# Session-bound resource references

Bee-Core's resource-reference codec is being introduced as a shared security primitive.

## Contract
- Internal MongoDB IDs remain unchanged and are used only by backend persistence and relationships.
- External references are encrypted with AES-256-GCM and are bound to a session ID and resource type.
- Each encryption uses a fresh 96-bit nonce, so repeated references for the same resource are different.
- The encrypted payload carries the issuing session expiry. A reference cannot be used in another session, for another resource type, or after its expiry.
- The encryption key is derived server-side from the configured secret and the session ID using HMAC-SHA-256. The secret must be at least 32 characters and must never be sent to clients.

## API
The shared module `src/core/session-id.ts` exports generic `maskResourceId` / `unmaskResourceId` functions and convenience wrappers for tenant, plugin and user IDs. Additional resource types are supported by the shared type.

## Important integration requirement
This codec alone does not protect an endpoint. Every API route that accepts or returns resource IDs must be migrated to mask outgoing identifiers and unmask incoming references using the authenticated session's persisted expiry. Authorization and tenant scoping must still be enforced after unmasking. Public, unauthenticated endpoints must not expose internal IDs; they should use public slugs or omit IDs.

Do not consider the migration complete until all API routes, JWT claims, frontend route state and plugin interfaces have been migrated and cross-session / cross-tenant integration tests pass.
