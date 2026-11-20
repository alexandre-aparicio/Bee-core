# Authentication (MongoDB)

Bee-Core supports client contexts `backend`, `dashboard`, and `public`.

## Persistence
MongoDB database (default `bee_core`) stores:
- `users`: email (unique), password hash, roles, enabled, allowed client contexts
- `refresh_sessions`: hashed refresh token, user ID, client, expiry and revocation timestamps

Unique and query indexes are created at startup. The refresh-session expiry index is TTL-managed by MongoDB. Bootstrap admin is created only if the email does not exist; changing .env will not reset existing credentials.

## Environment
Copy `.env.auth.example` to `.env`. Set a random JWT secret (minimum 32 chars) and strong admin password (minimum 12 chars). Never commit .env.

## Login
```bash
curl -s -X POST http://localhost:3000/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@example.com","password":"YOUR_PASSWORD","client":"dashboard"}'
```
Login returns a 20-minute access token and 30-day refresh token. Refresh tokens are hashed at rest and rotated on refresh.

## Refresh
```bash
curl -s -X POST http://localhost:3000/auth/refresh -H 'Content-Type: application/json' -d '{"refreshToken":"YOUR_REFRESH_TOKEN"}'
```

## Me
```bash
curl -s http://localhost:3000/auth/me -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

## Logout
```bash
curl -s -X POST http://localhost:3000/auth/logout -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' -H 'Content-Type: application/json' -d '{"refreshToken":"YOUR_REFRESH_TOKEN"}'
```
Logout revokes refresh session. An existing access token remains usable until expiry (maximum 20 minutes).

## Limitations
Still a development milestone: no route-wide guard policy, rate limiting, MFA, password reset, audit retention, email verification or immediate access-token revocation. Add these and perform a security review before public production deployment.
