# Security MVP progress

This document records security checks currently covered and gaps that remain before a public deployment.

## Verified in code / CI

- Tenant context derives from verified JWT/session and active membership.
- Notes routes scope record access to active tenant.
- Marketplace integration tests cover cross-company note reads returning 404.
- Added regression coverage for cross-company note update/delete attempts, both directions, and asserts that the owning company's note content remains unchanged.
- Added strict custom-role permission key/name normalization foundation (exact permission keys; no wildcard grants).
- Added tenant-scoped append-only audit event write service with metadata limits and indexes.

## Not complete

- Custom roles are persisted per tenant and resolved through active membership; company-owner management, assignment and session revocation are implemented and merged in PR #17.
- Successful login/logout audit integration is implemented in PR #18; role/member, marketplace and permission-denial events are not yet wired.
- No end-to-end audit query/export or retention controls.
- Tenant isolation audit of every route and background/async entrypoint is incomplete.
- MFA, rate limiting, password recovery, email verification and robust token revocation remain outstanding.

## Test expectation

The MongoDB integration tests in GitHub Actions must execute (not skip) with the CI MongoDB service. A successful test run is evidence for the covered cases only, not a guarantee of universal tenant isolation or production readiness.
