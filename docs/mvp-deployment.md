# Bee-Core 0.1.0 Docker deployment

The production Compose overlay is intended to expose only the web/Nginx service. MongoDB and Bee-Core API remain reachable only over the internal Compose network.

## Install

Prerequisites: Docker Engine, Docker Compose v2.24+ (needed for Compose `!reset`), and a server with port 80 available or an existing reverse proxy.

```bash
git clone https://github.com/alexandre-aparicio/Bee-core.git
cd Bee-core
cp .env.production.example .env
openssl rand -hex 48
```

Set the generated JWT secret, a unique bootstrap admin email, and a strong bootstrap password (12+ chars) in `.env`. Restrict it:

```bash
chmod 600 .env
```

Start the production profile:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Access the UI at `http://SERVER/`. For a real public server, put it behind HTTPS and configure firewall rules before using real data.

## Validate the stack

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml config
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
curl -fsS http://127.0.0.1/
```

The web container's Nginx proxies `/api/` to the internal API. The API health endpoint `/health` should be checked from inside the Compose network, not exposed as a host port.

## Persistence and backup

Named volumes persist MongoDB and private file data:

- `bee_core_mongodb_data`
- `bee_core_files`

Create a logical backup, store it encrypted off-server, and test restore procedures before relying on it:

```bash
mkdir -p backups
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T mongodb mongodump --db "${MONGODB_DB:-bee_core}" --archive > "backups/bee-core-$(date +%F).archive"
```

## Update

```bash
git pull --ff-only
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## Readiness limitations

This is an install candidate, not a security-certified production release. Tenant isolation route/async audits remain incomplete; custom roles and audit writing are foundations not yet wired into all routes. MFA, rate limiting, recovery flows, TLS setup, encrypted off-server backups, restore drills, and server monitoring are still deployment/operator requirements or outstanding product work. Consult `docs/tenant-data-isolation.md` and `docs/auth.md` before exposing the service publicly.
