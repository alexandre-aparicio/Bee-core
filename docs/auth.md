# Auth layer (v0.2)

Bee-Core authentication separates the login context into three client types:

- `backend`: service-to-service/backend clients
- `dashboard`: administrative dashboard
- `public`: public-facing applications

## Bootstrap
Create a `.env` file using `.env.auth.example` as a template. Generate JWT secret:

```bash
openssl rand -base64 48
```

Use a unique admin password of 12+ characters. Never commit secrets.

## Login
```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"YOUR_PASSWORD","client":"dashboard"}'
```

Client is required and must be backend/dashboard/public.

Routes:
- POST /auth/login
- GET /auth/me (Bearer JWT)
- POST /auth/logout (Bearer JWT)

## Current limitations
This is an MVP, not production-ready identity management:
- users currently live in process memory and reset on container restart
- bootstrap admin is seeded at startup from env
- access token lifetime 20 minutes
- logout is stateless and does not revoke tokens
- client is recorded in JWT but strict route-level client guards are not yet implemented
- no refresh token rotation, MFA, user CRUD, role/permission policy engine, or persisted sessions yet

Next milestone: storage adapter plugin (MongoDB), role/permission plugin, refresh/revocation, and dashboard auth screens.
