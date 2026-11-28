# Bee-Core 0.1.0 MVP acceptance checklist

**Snapshot:** 2026-11-25  
**Release state:** Not ready to tag. The items below distinguish repository implementation from evidence on a specific GitHub Actions run. A passing CI run is not a penetration-test or production-security attestation.

## Required CI gates

| Gate | Current evidence | Status |
|---|---|---|
| Backend TypeScript build and automated tests | Main CI run [45509283984](https://github.com/alexandre-aparicio/Bee-core/actions/runs/45509283984) passed; PR #210 exact-head run [45582103740](https://github.com/alexandre-aparicio/Bee-core/actions/runs/45582103740) passed (118 passed, 0 failed, 0 skipped); PR #206 run [45582869039](https://github.com/alexandre-aparicio/Bee-core/actions/runs/45582869039) passed (120 passed, 0 failed, 0 skipped). | Verified on PR #210 and PR #206 heads |
| Angular production build | PR #207 migration rehearsal run [45580607220](https://github.com/alexandre-aparicio/Bee-core/actions/runs/45580607220) completed Angular 19 → 20 → 21 → 22 migration; PR #210 exact-head run [45582103740](https://github.com/alexandre-aparicio/Bee-core/actions/runs/45582103740) passed the Angular production build and test-discovery job. | Verified in migration rehearsal; apply/review patch and rerun on release PR |
| Angular dependency audit | The migration rehearsal's initial Angular 19 `npm ci` reported 38 vulnerabilities (1 low, 24 moderate, 11 high, 2 critical). After the sequential Angular 22 migration and lockfile regeneration, the final `npm ci` audited 308 packages and reported **0 vulnerabilities**; `npm audit --omit=dev` also reported **0 production vulnerabilities**. PR #210 exact-head CI also passed its Angular production audit. Deprecated `tar@6.2.1` and `glob@10.5.0` warnings appeared during the initial install and should still be reviewed. | Full and production audit passed in rehearsal and PR #210 |
| Playwright | Migration rehearsal successfully enumerated the existing smoke test. | Discovery only; browser E2E not executed |
| Production Compose clean install | PR #210 exact head `cb0ef4bc96b10c96d4b61010ea89ef87a6babf2e`, run [45582103740](https://github.com/alexandre-aparicio/Bee-core/actions/runs/45582103740), passed production overlay validation, clean build/start, web and reverse-proxied API health. | Verified on PR #205 head |
| Persistence and backup/restore | The same PR #210 run passed MongoDB/auth persistence after restart, authenticated MongoDB backup/restore, and private-file plus uploaded-plugin-volume backup/restore. | Verified on PR #205 head |
| One candidate commit with all gates green | PR #205's Angular 19 web audit failed (6 production vulnerabilities). PR #210 carries the Angular 22 migration and Node 22.22.3 web build image pin; its exact-head Backend, Angular and production Compose workflows all passed. PR #206's MongoDB-backed cross-tenant route regression also passed, but the two branches have not been integrated into one release-candidate commit or merged. | **Core CI milestone reached; release/security sign-off still open** |

## Tenant isolation and authorization

- [x] Server-resolved tenant context and tenant-scoped collection foundation exist.
- [x] Marketplace integration covers tenant-scoped install-job reads, concurrent install/uninstall deduplication and plan/purchase entitlement behavior in `test/marketplace.integration.test.ts`.
- [x] Connected Devices cross-company resource attempts are covered by PR #206. Both a controlled route regression and a MongoDB-backed regression exercise approve, suspend, activate, unlink, delete, revoke, rename and pairing cancellation against foreign records; they verify no foreign mutation and actor-tenant-only denial events. CI passed on run [45582869039](https://github.com/alexandre-aparicio/Bee-core/actions/runs/45582869039) (120 passed, 0 failed, 0 skipped).
- [ ] Complete route-by-route IDOR review for every plugin, public route, file/media route, background worker, webhook and realtime/SSE path.
- [ ] Run cross-tenant integration tests for all relevant routes against MongoDB, not only controlled route/repository test doubles.
- [ ] Verify role and permission enforcement for every mutating endpoint; a frontend-hidden action is not an authorization control.

## Audit trail

- [x] `appendTenantAuditEvent` provides a tenant-scoped insert-only service surface and validates metadata.
- [x] Audit reads are tenant-scoped and the role audit UI consumes the shared audit collection.
- [x] Marketplace subscription and plugin lifecycle transitions append tenant audit events, with concurrent duplicate webhook transitions producing one event.
- [ ] Complete audit coverage for every security-sensitive route and asynchronous transition.
- [ ] Resolve best-effort audit delivery in both Marketplace and Connected Devices helpers: they log and swallow audit-write errors, so a business mutation can succeed without a durable audit event. Define fail-closed/outbox/transaction semantics and test audit-storage failures.
- [ ] Enforce audit immutability at the database privilege/operational boundary. The current application database user has broad `readWrite` privileges; the helper being insert-only does not by itself prevent another code path using the raw MongoDB collection from updating or deleting events.
- [ ] Define retention, export, monitoring and tamper-evidence procedures.

## Plugin installation and entitlement lifecycle

- [x] Trusted package registry, plan assignments, manual tenant grants and entitlement checks exist.
- [x] Tenant install/update/uninstall jobs are durable, tenant-scoped, deduplicated, leased and retryable; stale workers cannot finalize a job after losing its lease.
- [x] Lifecycle integration covers migration compensation and preserves tenant business data after uninstall/revocation.
- [x] Signed ZIP upload validates archive paths, bounds, digest and publisher signature; package files persist in the plugin volume.
- [ ] Keep publisher private keys offline and configure/rotate trusted public keys operationally.
- [ ] Add automatic fallback for a newly uploaded backend package that fails startup.
- [ ] Complete dynamic frontend package loading for Documents, Connected Devices and Time Tracking; those remain statically bundled Angular components.
- [ ] Harden billing webhooks with provider signatures, timestamp/replay-window validation, provider event-ID deduplication and payment reconciliation. The current shared Bearer secret is not a hardened public billing integration.
- [ ] Do not describe signed backend packages as sandboxed: they execute trusted code inside the Bee-Core Node process.

## Docker installation and operations

- [x] Production Compose overlay removes host-published MongoDB and API ports; only the web entry point is published.
- [x] CI has exercised clean build/start, health, auth/session rotation, MongoDB and file persistence, and restore round-trips for MongoDB, private files and plugin-package files.
- [x] Apply the Angular 22 migration to a dedicated branch and pin the web build image to `node:22.22.3-alpine` (PR #210). The migration rehearsal passed; exact-head Backend, Angular audit/build and production Compose CI remain pending.
- [ ] Use reproducible `npm ci` installs for backend and frontend; keep both lockfiles committed.
- [ ] Verify the human-operated backup/restore commands in the deployment guide. The current documentation correction is proposed in PR #208 and is not yet merged.
- [ ] Configure real TLS, firewall restrictions, secret storage/rotation, encrypted off-site backups, retention, monitoring, log rotation and tested operational alerts.
- [ ] Perform a documented restore drill using production-sized representative data.

## Release decision

Do not tag `0.1.0` until all of the following are true on one reviewed release-candidate commit:

1. Backend CI passes with no skipped tests.
2. Angular install, full dependency review, production audit, production build and actual browser E2E pass.
3. Production Compose clean install/build/start, health, persistence and all three backup/restore paths pass.
4. Cross-tenant IDOR tests cover all security-sensitive routes and execute against MongoDB.
5. Audit coverage is complete for the declared MVP scope, with audit-write failure behavior and immutability limitations resolved or explicitly accepted by a security owner.
6. Installation, configuration, backup/restore and recovery instructions are current and reproducible.
7. Remaining external infrastructure and security-review requirements are explicitly signed off.

Until then Bee-Core is a deployment candidate, not a production-safe release.
