# Bee-Core

**All Is a Plugin** — a modular TypeScript runtime where the core provides infrastructure and application capabilities are delivered by plugins.

## MVP capabilities

- Plugin registry and lifecycle (register, initialize, start, stop)
- Typed event bus and Fastify HTTP runtime
- Health and plugin introspection endpoints
- Authentication for backend, dashboard and public clients
- MongoDB-persisted users and refresh sessions
- Angular frontend with public landing, login and dashboard shell
- Docker Compose deployment with persistent MongoDB and private file storage

## First VPS installation

For the initial server pull, use the production Compose overlay documented in **[the Bee-Core 0.1.0 deployment guide](docs/mvp-deployment.md)**. It publishes only the web entry point; MongoDB and the API remain private on the Compose network.

Quick start:

```bash
git clone https://github.com/alexandre-aparicio/Bee-core.git
cd Bee-core
cp .env.production.example .env
openssl rand -hex 48
# Put the generated value in JWT_SECRET and set unique admin credentials in .env
chmod 600 .env
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Use Docker Engine and Docker Compose plugin v2.24.4 or newer. Configure HTTPS and firewall access before exposing the service to real users. This MVP deployment is a test/deployment candidate, not a security-certified production release. See the deployment guide for verification, persistence, backup and restore instructions.

## API endpoints

`/health`, `/plugins`, `/auth/login`, `/auth/refresh`, `/auth/me`, `/auth/logout`.

## Local development

Requirements: Node.js 22+ and MongoDB 8+.

```bash
npm install
npm run dev
```

Frontend:

```bash
cd apps/web
npm install
npm start
```

## API CORS origins

The API allows cross-origin requests only from the exact origins listed in
`BEE_CORS_ORIGINS` (comma-separated, without paths). The default includes
Capacitor's Android and iOS origins:

```dotenv
BEE_CORS_ORIGINS=https://localhost,capacitor://localhost
```

Add a trusted browser development origin explicitly when needed. Do not use
`*` for production. Preflight requests are restricted to supported methods and
the `authorization`, `content-type`, and `x-device-pairing-secret` headers.

## Authentication persistence

Users and refresh sessions are stored in MongoDB collections `users` and `refresh_sessions`. Refresh tokens are SHA-256 hashed, rotated on refresh, and TTL-indexed for expiration cleanup. See [docs/auth.md](docs/auth.md).

## Connected devices

Bee-Core's proposed QR-based device pairing, scoped device authorization, mobile companion, location and POS integration roadmap is documented in [Connected Devices](docs/connected-devices.md). This is a planned capability, not part of the implemented MVP.

## Plugin contract

A plugin exports a manifest and lifecycle hooks. See [src/plugins/hello.plugin.ts](src/plugins/hello.plugin.ts).
