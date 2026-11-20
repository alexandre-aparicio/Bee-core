# Auth guards

Bee-Core JWTs carry a client context: `backend`, `dashboard`, or `public`.

Import the guards in a plugin route:

```ts
import { requireAuth, requireRoles } from "../auth/auth.guard.js";

// Only dashboard-issued tokens can call this endpoint.
server.get("/dashboard/example", {
  preHandler: [requireAuth("dashboard"), requireRoles("user")]
}, async () => ({ ok: true }));

// Backend service token:
server.get("/internal/example", {
  preHandler: [requireAuth("backend"), requireRoles("service")]
}, async () => ({ ok: true }));
```

- `requireAuth(client?)` verifies the JWT, its Bee-Core audience claim, required subject/client claims, and optional client context.
- `requireRoles(...)` checks role claims; admins bypass role checks.
- Put `requireAuth` before `requireRoles` in the preHandler array.

## Current limitations

The guards are implemented, but existing routes have not yet been migrated to them. The auth token is still stateless, users are in memory, and roles are token claims rather than database-backed authorization. Do not expose this prototype to the public internet until persistent users, token revocation/rotation, rate limiting, and route coverage are completed and reviewed.
