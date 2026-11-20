# Auth layer (v0.3)

Bee-Core authentication supports three client contexts:

- `backend`: service-to-service/backend clients
- `dashboard`: administrative dashboard
- `public`: public-facing applications

## Persistence

Auth stores users and refresh sessions in PostgreSQL. Compose provisions the database and a named volume `bee_core_pgdata`, so the data persists across container recreation.

The plugin creates these tables automatically:
- `bee_auth_users`: email, password hash, roles, enabled state, allowed client contexts
- `bee_auth_refresh_sessions`: hashed refresh tokens, client, expiry and revocation timestamps

Bootstrap administrator is inserted only if its email does not already exist. Changing the bootstrap password in .env will not automatically change an existing account.

## Environment

Copy `.env.auth.example` to `.env`. Generate secrets:

```bash
openssl rand -base64 48
```

Set a unique JWT secret and database password. Use a strong bootstrap password of at least 12 characters. Never commit `.env`.

## Login

```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"YOUR_PASSWORD","client":"dashboard"}'
```

Login returns a 20-minute access token and a 30-day refresh token. Refresh tokens are stored hashed in the database and rotated on every refresh.

## Refresh

```bash
curl -s -X POST http://localhost:3000/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"YOUR_REFRESH_TOKEN"}'
```

## Me

```bash
curl -s http://localhost:3000/auth/me -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

## Logout

```bash
curl -s -X POST http://localhost:3000/auth/logout \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"YOUR_REFRESH_TOKEN"}'
```

Logout revokes the refresh session. An already-issued access token remains usable until it expires (maximum 20 minutes).

## Routes

- POST `/auth/login`
- POST `/auth/refresh`
- GET `/auth/me` (Bearer JWT)
- POST `/auth/logout` (Bearer JWT)

## Current limitations

This is still a development milestone, not production-ready identity management:
- Refresh tokens are rotated and revocable; access JWTs are not revoked immediately.
- Users and roles currently have no CRUD endpoints/UI.
- Role/client guard utilities exist, but existing routes are not yet protected through a central policy.
- No rate limiting, MFA, password reset, audit retention, or email verification.
- Admin bootstrap credentials are only used for initial account creation.

Before public deployment, add rate limits, security review, route-wide guard coverage, operational backup strategy, and secure secret handling.
