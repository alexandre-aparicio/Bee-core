# Bee-Core

**All Is a Plugin** — a small TypeScript modular runtime where the core provides infrastructure and application capabilities are plugins.

## Current MVP
- Plugin registry and lifecycle (register, initialize, start, stop)
- Typed event bus
- Fastify HTTP runtime
- Health and plugin introspection endpoints
- Example `hello` plugin
- Docker and Docker Compose deployment

## Run with Docker

```bash
git clone https://github.com/alexandre-aparicio/Bee-core.git
cd Bee-core
docker compose up -d --build
```

Open:
- `http://localhost:3000/health`
- `http://localhost:3000/plugins`
- `http://localhost:3000/`

## Local development

Requires Node.js 22+.

```bash
npm install
npm run dev
```

## Plugin contract

A plugin exports a manifest and lifecycle hooks. See `src/plugins/hello.plugin.ts`.

## Roadmap
- External plugin discovery and loading
- Plugin configuration schema and validation
- Permission/capability system
- Plugin dependency graph
- MongoDB adapter plugin
- Angular admin UI plugin
- CLI for plugin scaffolding and management
- Tests and observability
