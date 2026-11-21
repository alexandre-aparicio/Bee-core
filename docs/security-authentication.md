# Authentication hardening

## Superadministrator MFA

Superadministrator accounts must enroll an authenticator before platform administration endpoints are available.

1. Generate a dedicated encryption key: `openssl rand -base64 32`.
2. Set it as `AUTH_MFA_ENCRYPTION_KEY` in the backend environment. It must decode to exactly 32 bytes.
3. Back up this key in a secure secrets manager. Losing it makes stored authenticator secrets unrecoverable.
4. Sign in as the bootstrap superadministrator. On first sign-in, the dashboard presents the authenticator secret and provisioning URI.
5. Add the account to an RFC 6238-compatible authenticator and confirm with the current six-digit code.
6. Store the ten one-time recovery codes securely. They are displayed only once.

Authenticator secrets are encrypted with AES-256-GCM at rest. TOTP codes have a ±1 time-step tolerance and a successfully used time-step cannot be reused. Recovery codes are stored as SHA-256 hashes and consumed atomically. Platform administration requires a successful MFA verification within the previous 15 minutes.

If MFA is not configured, a superadministrator can authenticate to enroll, but platform administration routes remain blocked until enrollment is confirmed.

## Dashboard sessions

The dashboard receives short-lived access tokens in memory only. Refresh tokens are delivered as `HttpOnly; SameSite=Strict` cookies scoped to `/api/auth`; the dashboard does not store access or refresh tokens in localStorage.

Refresh tokens rotate on use. Their idle lifetime is seven days and each session has a 30-day absolute lifetime. Logout revokes the current refresh session and clears the cookie. Cookie-based refresh and logout reject cross-origin requests when an Origin header is present.

The cookie is marked `Secure` outside development. Production deployments must serve the dashboard and API over HTTPS.

## Deployment

Add `AUTH_MFA_ENCRYPTION_KEY` to the production `.env` before starting the stack. The value in the example environment files is a placeholder and must be replaced with the output of `openssl rand -base64 32`. Do not commit real keys or reuse the JWT signing secret.

After deploying, verify that the reverse proxy preserves the `Set-Cookie` header and that requests to `/api/auth/refresh` carry the cookie. Keep the proxy and browser on the same site so the strict SameSite policy works as intended.

## Verification

The unit tests in `test/totp.test.ts` cover Base32 round-tripping, an RFC 6238 SHA-1 test vector, and invalid codes. Run `npm test` and `npm run check` in the backend workspace before deployment. Also build the Angular app and exercise first-time MFA enrollment, regular MFA login, recovery-code login, refresh rotation, and logout in a staging environment.
