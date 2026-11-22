# Frontend security hardening

## Scope

This work tracks the frontend dependency remediation for `apps/web`. The acceptance gate is:

1. Move Angular off the unsupported 19.2 line using the official sequential migrations (19 → 20 → 21 → 22), selecting mutually compatible stable Angular, CLI, build, compiler and TypeScript versions.
2. Use a Node.js version satisfying the selected Angular release in local development and the `apps/web/Dockerfile` build stage. Do not assume that a floating `node:22-alpine` tag satisfies a minimum patch requirement.
3. Regenerate `apps/web/package-lock.json` with npm from the final manifest; never hand-edit lockfile dependency graphs.
4. Run `npm ci`, `npm run audit:production`, `npm run build` and `npm run test:e2e` from `apps/web`.
5. Verify the app in headless Chromium, including login, dashboard and public/dashboard theme selection.

## Reproducible production audit

From `apps/web`:

```sh
npm ci
npm run audit:production
```

The `audit:production` script is a convenience wrapper for `npm audit --omit=dev`. It does not replace the full development-dependency audit when that is required.

## Current status

**Not resolved yet.** The branch currently contains Angular 19.2.15 in both `package.json` and `package-lock.json`. The manifest now exposes the production audit command, but this alone does not remediate vulnerable packages.

The dependency migration and lockfile regeneration require executing the Angular CLI and npm against the repository. GitHub file-edit operations cannot safely reproduce npm's resolved dependency graph or run the production build and browser acceptance checks. Do not mark this work complete until the checks above have actually passed.

## Constraints

- Keep this work on `security/hardening-92`; do not merge it into `main` or open a pull request without explicit authorization.
- Do not use GitHub Actions as a substitute for local verification.
- Do not weaken tests, compiler checks, lint rules or audit severity.
- Do not use `--force` or `--legacy-peer-deps` to bypass dependency conflicts.
- Do not claim a clean audit, successful build or browser verification without captured command output.


## Backend session, MFA and realtime hardening

The backend work on `security/hardening-92` addresses the remaining refresh-session and realtime resource-exhaustion gaps:

- Refresh rotation stores up to 4,096 previously rotated token hashes on the session-family record. Reuse of any retained hash revokes that session family, invalidates access tokens bound to its session ID, clears the dashboard refresh cookie and returns HTTP 401. The event is written as `auth.refresh.reuse` with a denied outcome.
- The history limit is fail-closed: once the history reaches 4,096 entries, the session is revoked and `auth.refresh.limit` is audited instead of silently dropping older hashes.
- Both template stream-ticket and notification realtime-ticket stores have a 5,000-entry cap, a 30-second lifetime, single-use consumption and indexed-heap expiry cleanup. Cleanup does not scan the full ticket Map on each request; heap operations are logarithmic.
- SSE and WebSocket transports share one per-Fastify-server limiter: 20 concurrent connections per IP, 5 per authenticated user and 1,000 total. Tickets are bound to the issuing IP; counters are released on close, error and shutdown.
- Superadministrators without an enrolled encrypted MFA secret are denied tenant/business routes. The MFA setup and confirmation routes remain available for enrollment. Platform administration checks both active enrollment and MFA verification within the previous 15 minutes; MFA denials and existing sensitive platform mutations are audited.

### Local verification

From the repository root:

```sh
npm run check
MONGODB_TEST_URI="mongodb://127.0.0.1:27017/bee_core_test" npm test
```

The suite includes ticket-store and connection-limiter unit tests, refresh replay and history-limit integration assertions, superadmin MFA enrollment/freshness/audit assertions, per-user SSE quota coverage, and a public stream-ticket flood test. The flood test expects exactly 5,000 tickets to be accepted, excess requests to receive HTTP 429, and process RSS growth to remain below 96 MiB.

**Verification status for this branch:** the source and tests have been committed through GitHub file operations, but they have not been executed in a local Bee-Core checkout. Do not treat the tests as green until the commands above have been run against a local MongoDB test instance.

### Deployment and residual limits

- Configure `TRUST_PROXY` with only the actual private IP/CIDR of the immediate trusted web proxy. With `TRUST_PROXY=false` behind Nginx, Fastify sees the proxy address rather than each end-user address, so per-IP quotas become aggregate proxy quotas. Do not trust arbitrary forwarded headers or set `TRUST_PROXY=true` on an API reachable by untrusted peers.
- Ticket stores and connection counters are in-memory and scoped to one Node.js process. Multiple API replicas each enforce their own limits; a distributed deployment needs a shared store/limiter to enforce cluster-wide quotas.
- Audit helpers currently log persistence failures and continue; a MongoDB audit-write failure can therefore leave a revoked session without a durable audit row. Monitor the backend audit-write error logs.
- A session is deliberately terminated after 4,096 rotations so the replay-detection history remains complete and bounded.
