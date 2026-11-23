# Bee-Core security MVP status

**Snapshot:** 2026-11-22  
**Scope:** repository controls and evidence visible in this branch. This is an engineering status report, not a penetration-test attestation or a claim that production infrastructure is secure.

## Implemented in the repository

### Identity and sessions
- JWT access tokens are signed with HS256, issuer/audience validation and a 20-minute lifetime.
- Dashboard refresh sessions use rotating refresh tokens in HttpOnly, SameSite=Strict cookies; refresh reuse is rejected and revokes the affected session.
- Logout revokes the refresh session. The access token remains valid until its short expiry unless the protected operation also checks session state.
- Super Admin is represented by a reserved `super_admin` membership in the system Super Organization; global platform routes verify that membership and the active organization rather than trusting a user-level platform role.
- Superadministrator MFA uses AES-256-GCM encrypted TOTP secrets, replay protection and one-time hashed recovery codes. Login requires the authenticator/recovery code after enrollment, and privileged platform actions require recent MFA verification (15-minute window).
- Startup migration creates the Super Organization, moves legacy `platformRole: superadmin` accounts (and the configured bootstrap admin) into reserved memberships, changes their active organization and revokes existing refresh sessions so users must authenticate again. The legacy database field is unset; a response-only `platformRole` compatibility property remains for the current Angular shell.
- Startup environment validation rejects missing/weak JWT and MFA keys, missing Mongo credentials and known example/placeholder secrets in production.

### Tenant and data boundaries
- Tenant context is derived from verified session claims and active membership.
- Tenant collection helpers scope data operations by tenant.
- File storage uses tenant-specific directories, opaque session-bound references and tenant storage quotas.
- Integration tests cover cross-tenant file access and other tenant-scoped operations. Test coverage is not equivalent to a complete route-by-route security review.

### Network and HTTP controls
- The backend is exposed only on the Compose network in the production profile; the web reverse proxy is the public-facing service.
- Nginx applies per-IP rate limits to login, refresh, MFA and selected ticket/platform-admin routes and returns HTTP 429 when limits are exceeded.
- Nginx supplies CSP, frame/content-type/referrer/permissions policies, COOP and CORP headers. HSTS is emitted only when the proxy sees HTTPS.
- The file upload location permits up to 11 MiB at the proxy to accommodate the 10 MiB application limit and request overhead.
- The proxy overwrites forwarded client-IP headers rather than trusting an incoming X-Forwarded-For chain.

### Database and runtime
- Compose configures MongoDB root authentication and a database-scoped application user.
- The core owns one shared MongoClient and closes it through application shutdown.
- Plugin startup is dependency ordered; missing dependencies/cycles are explicit errors and plugin shutdown continues after an individual stop failure.

## Container changes in this branch — pending execution evidence

- Backend image uses a build stage and a production stage with `npm ci --omit=dev`, runs as `node`, and declares a Docker HEALTHCHECK.
- Frontend uses `nginxinc/nginx-unprivileged`, runs as UID 101 and listens on 8080.
- The production Compose profile keeps MongoDB and the API unpublished on host ports.
- CI workflows are configured to build the Compose stack, exercise authentication/session revocation, upload boundaries, response headers, rate limiting and run the repository's tenant-isolation integration tests.
- Gitleaks is configured to scan the checked-out tree and full Git history. A configured workflow is not evidence of a clean scan until its run completes successfully.

## Outstanding application work

- Complete route-by-route tenant-isolation review, including asynchronous/background work, file/media access and realtime/SSE paths.
- Audit query/export API or UI and retention controls.
- Password recovery and email verification.
- Immediate access-token revocation (today the access-token lifetime bounds the remaining exposure after refresh-session revocation).
- Independent security review of authorization boundaries, rate-limit behavior and operational failure modes.
- Review provider-signed billing webhooks and payment reconciliation before enabling real billing flows.

## External infrastructure and operational dependencies

These cannot be completed by repository code alone and must be configured and evidenced in the deployment environment:

| Area | Required external work | Evidence required |
|---|---|---|
| TLS | Provision and renew a real certificate at the public reverse proxy; restrict origin access and verify HTTPS end-to-end | Valid certificate chain, redirect/HSTS checks and external TLS scan |
| Secrets | Replace all examples with unique production secrets; store them in a secret manager or protected deployment environment; define rotation and recovery procedures | Secret inventory/rotation record; no secrets in repository, image layers or logs |
| Backups | Encrypted off-site MongoDB and file-volume backups, retention policy and access separation | Successful scheduled backup plus a witnessed restore drill |
| Network | Host firewall/security groups, SSH hardening and only required public ports | External port scan and firewall rules |
| Monitoring | Centralized logs, alerting for auth abuse, failed backups, disk pressure and service health | Tested alerts and operational runbook |
| Penetration test | Independent, authorized test against the deployed staging/production-equivalent system | Dated report, remediation tracking and retest |

## Verification record and acceptance status

No local Docker daemon, VPS shell or local Git checkout is available to this GitHub-only workflow. Consequently, this branch must not be described as locally executed or as having a clean local `git status`.

The following evidence must come from successful CI runs on the exact PR head:
- `docker compose build` and production-profile startup with an isolated generated `.env`.
- Login, MFA enrollment/verification, refresh rotation, logout and rejection of the revoked refresh token.
- 10 MiB upload accepted and 11 MiB upload rejected at the proxy.
- HTTP 429 after exceeding the configured proxy limit.
- Tenant-isolation integration tests against MongoDB.
- Expected security headers and proof that the API has no host-published port.
- Gitleaks scan of the full Git history and working tree.

A CI pass proves only the scripted cases. It does not prove real TLS, secret-management practices, off-site backups, successful disaster recovery or resistance to an independent penetration test.
