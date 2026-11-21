# Security MVP progress

This document records implemented security controls and the remaining gaps before public deployment.

## Implemented on main

- Tenant context derives from a verified JWT/session and active membership.
- Notes routes scope record access to the active tenant.
- Tenant collection helpers stamp and constrain tenant reads/writes/deletes.
- MongoDB integration tests cover cross-company note read/update/delete IDOR attempts and preserve the owning tenant's data.
- Custom company roles are persisted per tenant, owner-managed, permission-validated and resolved from active membership; role changes revoke affected refresh sessions (PR #17).
- Tenant-scoped append-only audit writer validates metadata size/keys and creates tenant/time, actor/time and action/time indexes.
- Successful login/logout audit events are integrated (PR #18).
- Invitation creation/acceptance/cancellation, custom role create/update/delete, membership role changes/suspension, plugin install/uninstall and company/marketplace permission denials are integrated (PR #20), with MongoDB integration assertions.
- Subscription changes and plugin entitlement grant/revocation events are tenant-audited; duplicate no-op billing webhook deliveries do not emit duplicate transition events. Provider references are bound to a single plugin per tenant and mismatched grant/revoke events are rejected (proposed PR: webhook entitlement hardening).

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
- MFA, rate limiting, password recovery, email verification and immediate access-token revocation.
- Provider-signed billing webhooks and payment reconciliation.
- HTTPS/TLS, firewall policy, encrypted off-site backups, restore drills and monitoring.

## Test expectation

MongoDB integration tests in GitHub Actions must execute (not skip) with the CI MongoDB service. Passing checks prove only the cases explicitly covered; they do not replace a complete security review.
