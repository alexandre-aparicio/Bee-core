# Bee-Core 0.1.0 MVP deployment guide

This overlay is the first server-install profile for Bee-Core. It exposes the Angular/Nginx web container on a dedicated host port for an existing reverse proxy (such as Nginx Proxy Manager) and keeps MongoDB and the API on the private Compose network.

## Status / scope

This is a **deployment candidate**, not a security-certified production release. Tenant isolation, authentication hardening, monitoring and operational recovery still have open work. Do not expose this stack directly to the public internet without HTTPS, firewalling, encrypted off-site backups and a security review.

## Prerequisites

- Docker Engine and Docker Compose plugin v2.24+ (required for the `!reset` merge tag used to remove inherited host port bindings)
- Linux VPS
- A domain and TLS termination configured at the host reverse proxy before collecting real user data
- An unused host TCP port for Bee-Core web traffic (default: `3011`)

## Quick install

```bash
git clone https://github.com/alexandre-aparicio/Bee-core.git
cd Bee-core
cp .env.production.example .env
```

Generate a secret, then set it in `.env`:

```bash
openssl rand -hex 48
```

Set a unique admin email/password. Bootstrap password must be at least 12 characters. Keep `.env` private and do not commit it.

Check that the default web port is not already occupied:

```bash
sudo ss -ltnp | grep ':3011 ' || true
docker ps --format 'table {{.Names}}\\t{{.Ports}}'
```

If TCP 3011 is occupied, choose another unused host port in `.env` by setting `BEE_WEB_PORT`.

Start the production overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

The web UI listens on host TCP port `3011` by default. Configure Nginx Proxy Manager with a Proxy Host for the Bee-Core domain (for example, `beecore.beeprojects.net`), forwarding to the VPS host address reachable from the NPM container and port `3011`, using HTTP between NPM and Bee-Core. Enable the required SSL certificate and Force SSL in NPM.

Do **not** forward NPM to `127.0.0.1:3011` unless NPM uses host networking; inside a normal container, localhost refers to the NPM container itself. Use the Docker host gateway or the VPS address reachable from that container.

The web Nginx container proxies `/api/` to the internal Bee-Core service. API and MongoDB do not publish host ports in this profile. Do not bind Bee-Core to host ports 80 or 443; those belong to the existing Nginx Proxy Manager.

## DNS and tenant subdomains

Set `PUBLIC_BASE_DOMAIN=beecore.beeprojects.net` in the production `.env`. Create DNS records pointing to the VPS public IP:

- `beecore.beeprojects.net` — A/AAAA record for the Bee-Core corporate host.
- `*.beecore.beeprojects.net` — wildcard A/AAAA record for tenant subdomains.

In Nginx Proxy Manager, create one Proxy Host with both domain names:

- `beecore.beeprojects.net`
- `*.beecore.beeprojects.net`

Forward both to the VPS host address reachable from the NPM container, port `3011`, using HTTP. Preserve the original Host header (the bundled web Nginx already forwards `Host $host` to Fastify). Request a DNS-challenge certificate containing both `beecore.beeprojects.net` and `*.beecore.beeprojects.net`; a wildcard certificate alone does not cover the base hostname. Enable Force SSL.

The platform superadministrator creates each company with a unique public slug. For example, slug `dragchart` resolves to `dragchart.beecore.beeprojects.net`. If omitted, Bee-Core derives a slug from the company name. Existing companies receive a slug during the organizations plugin startup migration. Reserved names and duplicate slugs are rejected.

Bee-Core resolves the request Host against the configured base domain and looks up the slug in the `tenants` collection. The base host serves the corporate landing page; an active tenant subdomain serves that tenant's public page; unknown or suspended tenants return a not-found page. No per-tenant container or separate NPM Proxy Host is required. MongoDB and the API remain private to the Compose network.


## Verify deployment

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=100 bee-core
curl -fsS http://127.0.0.1:${BEE_WEB_PORT:-3011}/
```

The API health endpoint is available internally at `http://bee-core:3000/health`; do not expose it directly in the production profile.

## Data persistence

The production Compose project persists three independent data sets:

- MongoDB: Docker volume `bee_core_mongodb_data` (users, tenants, sessions, plugin state and business records).
- Private files: Docker volume `bee_core_files` mounted at `/data/bee-files`.
- Uploaded plugin packages: Docker volume `bee_core_plugins` mounted at `/data/bee-plugins`.

The actual Docker volume names are prefixed by the Compose project name. Resolve them from the running backend container instead of assuming a fixed prefix:

```bash
compose=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)
backend_id=$("${compose[@]}" ps -q bee-core)
files_volume=$(docker inspect "$backend_id" --format '{{range .Mounts}}{{if eq .Destination "/data/bee-files"}}{{.Name}}{{end}}{{end}}')
plugins_volume=$(docker inspect "$backend_id" --format '{{range .Mounts}}{{if eq .Destination "/data/bee-plugins"}}{{.Name}}{{end}}{{end}}')
test -n "$files_volume" && test -n "$plugins_volume"
```

## Backup

Load the protected deployment configuration and identify the exact private Compose network. The application database user can read the configured application database; use the root account only for restore operations that create a separate database.

```bash
set -euo pipefail
set -a
. ./.env
set +a
mkdir -p backups
chmod 700 backups

compose=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)
mongodb_id=$("${compose[@]}" ps -q mongodb)
backend_id=$("${compose[@]}" ps -q bee-core)
network=$(docker inspect "$mongodb_id" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{end}}')
files_volume=$(docker inspect "$backend_id" --format '{{range .Mounts}}{{if eq .Destination "/data/bee-files"}}{{.Name}}{{end}}{{end}}')
plugins_volume=$(docker inspect "$backend_id" --format '{{range .Mounts}}{{if eq .Destination "/data/bee-plugins"}}{{.Name}}{{end}}{{end}}')
test -n "$network" && test -n "$files_volume" && test -n "$plugins_volume"

stamp=$(date +%F)
docker run --rm --network "$network" -e MONGO_APP_USERNAME -e MONGO_APP_PASSWORD -e MONGODB_DB -v "$PWD/backups:/backup" mongodb/mongodb-database-tools:100.12.2 mongodump --host mongodb:27017 --username "$MONGO_APP_USERNAME" --password "$MONGO_APP_PASSWORD" --authenticationDatabase "$MONGODB_DB" --db "$MONGODB_DB" --archive="/backup/bee-core-$stamp.archive" --gzip

docker run --rm -v "$files_volume:/source:ro" -v "$PWD/backups:/backup" ubuntu:22.04 tar -czf "/backup/bee-core-files-$stamp.tar.gz" -C /source .
docker run --rm -v "$plugins_volume:/source:ro" -v "$PWD/backups:/backup" ubuntu:22.04 tar -czf "/backup/bee-core-plugins-$stamp.tar.gz" -C /source .
```

This backs up the database, private file volume and uploaded plugin-package volume. Keep all three archives from the same maintenance window. Copy them off-server, encrypt them, restrict access and define retention. A backup on the same VPS is not sufficient disaster recovery.

## Restore drill

Never restore over the live database or live volumes during a drill. Restore MongoDB into a separate database using the root account, then restore the file/package archives into new temporary volumes:

```bash
set -euo pipefail
set -a
. ./.env
set +a
compose=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)
mongodb_id=$("${compose[@]}" ps -q mongodb)
network=$(docker inspect "$mongodb_id" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{end}}')
stamp=YYYY-MM-DD
restore_db="${MONGODB_DB}_restore"
restore_files_volume="bee-core-files-restore"
restore_plugins_volume="bee-core-plugins-restore"

docker run --rm --network "$network" -e MONGO_ROOT_USERNAME -e MONGO_ROOT_PASSWORD -e MONGODB_DB -e RESTORE_DB="$restore_db" -v "$PWD/backups:/backup" mongodb/mongodb-database-tools:100.12.2 mongorestore --host mongodb:27017 --username "$MONGO_ROOT_USERNAME" --password "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin --archive="/backup/bee-core-$stamp.archive" --gzip --nsInclude="$MONGODB_DB.*" --nsFrom="$MONGODB_DB.*" --nsTo="$restore_db.*"

docker volume create "$restore_files_volume" >/dev/null
docker volume create "$restore_plugins_volume" >/dev/null
docker run --rm -v "$restore_files_volume:/target" -v "$PWD/backups:/backup:ro" ubuntu:22.04 tar -xzf "/backup/bee-core-files-$stamp.tar.gz" -C /target
docker run --rm -v "$restore_plugins_volume:/target" -v "$PWD/backups:/backup:ro" ubuntu:22.04 tar -xzf "/backup/bee-core-plugins-$stamp.tar.gz" -C /target
```

Verify the restored database's critical collections and records, compare file/package contents and test that restored plugin packages can be re-verified at startup. Remove the temporary database and volumes after the drill. The CI workflow exercises sentinel-record and volume round-trips; it does not replace scheduled encrypted off-site backups, retention policies or periodic restores against production-sized data.

## Update

```bash
git pull --ff-only
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## Production checklist

- [ ] Configure HTTPS on Nginx Proxy Manager and redirect HTTP to HTTPS
- [ ] Firewall only the reverse proxy ports (normally 80/443) and keep the Bee-Core backend port accessible only to NPM / trusted host traffic
- [ ] Do not publish MongoDB or API host ports
- [ ] Keep Bee-Core web on a dedicated unused host port (default 3011), not 80/443
- [ ] Use a strong generated JWT secret and unique bootstrap credentials
- [ ] Keep `.env` out of Git and restrict its permissions (`chmod 600 .env`)
- [ ] Configure encrypted, off-site backups and test restores
- [ ] Configure VPS monitoring, disk alerts and container log rotation
- [ ] Review `docs/tenant-data-isolation.md` limitations and all plugin routes
- [ ] Complete rate limiting, password reset, MFA, audit-route coverage, tenant-isolation review and vulnerability scanning before public production
