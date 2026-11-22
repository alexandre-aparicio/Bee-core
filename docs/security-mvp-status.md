# Security MVP progress

This document records implemented security controls and the remaining gaps before public deployment.

## Implemented on main and current security branch

- Tenant context derives from a verified JWT/session and active membership.
- Notes routes scope record access to the active tenant.
- Tenant collection helpers stamp and constrain tenant reads/writes/deletes.
- MongoDB integration tests cover cross-company note read/update/delete IDOR attempts and preserve the owning tenant's data.
- Custom company roles are persisted per tenant, owner-managed, permission-validated and resolved from active membership; role changes revoke affected refresh sessions (PR #17).
- Tenant-scoped append-only audit writer validates metadata size/keys and creates tenant/time, actor/time and action/time indexes.
- Successful login/logout audit events are integrated (PR #18).
- Login performs a dummy bcrypt comparison for unknown users; Nginx applies login rate limiting and baseline security headers (PR #56).
- Superadministrator TOTP MFA uses AES-256-GCM-encrypted secrets, replay prevention, and ten one-time hashed recovery codes. Platform administration requires MFA verification within the previous 15 minutes (security branch; not yet merged).
- Dashboard access tokens remain in memory across the Angular app; refresh tokens are stored in rotating HttpOnly, SameSite=Strict cookies. Refresh lifetime is seven days with a 30-day absolute session cap; logout revokes the session (security branch; not yet merged).
- Direct membership creation returns a uniform response for unknown, disabled, already-active and over-limit addresses to reduce email enumeration (security branch; not yet merged).
- MongoDB root authentication and a database-scoped application user are configured in Compose, with an initialization script and a documented migration procedure for existing volumes (security branch; not yet merged).
- Production reverse-proxy TLS requirements are documented; Nginx emits HSTS only when the upstream reports HTTPS (security branch; not yet merged).
- TOTP unit tests were added but have not yet been executed.
- Invitation creation/acceptance/cancellation, custom role create/update/delete, membership role changes/suspension, plugin install/uninstall and company/marketplace permission denials are integrated (PR #20), with MongoDB integration assertions.
- Subscription changes and plugin entitlement grant/revocation events are tenant-audited; compare-and-set updates make concurrent duplicate webhook deliveries produce at most one transition/audit event, while conflicting state changes return 409. Provider references are bound to a single plugin per tenant and mismatched grant/revoke events are rejected (proposed PR: webhook entitlement hardening).

## Audit coverage integrated in PR #20

- Invitation create/accept/cancel.
- Custom role create/update/delete.
- Membership role changes and suspension.
- Successful plugin install/uninstall.
- Permission denials for company permissions and marketplace read/install operations.
- MongoDB integration assertions for the recorded events.

PR #20 is merged as `1c96e8100d2145f518a0232d300122c866551c1b`. Its PR-head backend/MongoDB and Docker full-stack checks passed. The dedicated Angular workflow was not triggered because no Angular source changed; Angular was still built and exercised by the full-stack workflow. Post-merge `main` checks are the final validation gate.

## Not complete

- Audit query/export UI/API and retention controls.
- Full route-by-route tenant isolation review, including files/media, SSE and background/async entrypoints.
- MFA implementation is present on the current security branch but still needs backend type-checking, automated test execution and staging verification before merge.
- The main lockfile now resolves `@fastify/jwt@10.2.8` and `fast-jwt@6.3.5`; the previous 9.1.0/5.0.6 note is stale. A fresh backend `npm audit --omit=dev` result for the current main head is not available in GitHub Actions, so do not treat the dependency audit as cleared until the backend workflow passes.
- Existing MongoDB volumes must have the root and application users created manually before the authenticated Compose configuration is applied; follow `docs/mongodb-authentication.md` and take a verified backup first.
- Password recovery, email verification and immediate access-token revocation.
- Provider-signed billing webhooks and payment reconciliation.
- Actual certificate provisioning and reverse-proxy configuration, firewall policy, encrypted off-site backups, restore drills and monitoring. TLS configuration at the hosting reverse proxy still needs to be applied and verified.

## Test expectation

MongoDB integration tests in GitHub Actions must execute (not skip) with the CI MongoDB service. Passing checks prove only the cases explicitly covered; they do not replace a complete security review.
