# Bee-Core

**All Is a Plugin** — a small TypeScript modular runtime where the core provides infrastructure and application capabilities are plugins.

## MVP
- Plugin registry and lifecycle (register, initialize, start, stop)
- Typed event bus
- Fastify HTTP runtime
- Health and plugin introspection endpoints
- Auth plugin for backend/dashboard/public clients
- MongoDB-native persistent users and refresh sessions
- Docker Compose stack with MongoDB

## Docker deployment
```bash
git clone https://github.com/alexandre-aparicio/Bee-core.git
cd Bee-core
cp .env.auth.example .env
# Edit .env with a strong JWT secret and bootstrap admin credentials
docker compose up -d --build
```
Endpoints: `/health`, `/plugins`, `/auth/login`, `/auth/refresh`, `/auth/me`, `/auth/logout`.

## Local development
Node.js 22+, MongoDB 8+
```bash
npm install
npm run dev
```

## Auth persistence
Users and refresh sessions are stored in MongoDB collections `users` and `refresh_sessions`. Refresh tokens are SHA-256 hashed, rotated on refresh, and TTL-indexed for expiration cleanup. See [docs/auth.md](docs/auth.md).

## Plugin contract
A plugin exports a manifest and lifecycle hooks. See `src/plugins/hello.plugin.ts`.
