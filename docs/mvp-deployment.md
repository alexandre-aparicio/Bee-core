# Bee-Core 0.1.0 MVP deployment guide

This overlay is the first server-install profile for Bee-Core. It exposes the Angular/Nginx web container on a dedicated host port for an existing reverse proxy (such as Nginx Proxy Manager) and keeps MongoDB and the API on the private Compose network.

## Status / scope

This is a **deployment candidate**, not a security-certified production release. Tenant isolation, authentication hardening, monitoring and operational recovery still have open work. Do not expose this stack directly to the public internet without HTTPS, firewalling, encrypted off-site backups and a security review.

## Prerequisites

- Docker Engine and Docker Compose plugin v2.24.4+ (required for the `!reset` and `!override` Compose merge tags used to enforce production port bindings)
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

- MongoDB data: Docker volume `bee_core_mongodb_data`
- Private file data: Docker volume `bee_core_files`

List volumes:

```bash
docker volume ls | grep bee_core
```

## Backup

Create paired backups of MongoDB and the private file volume. The commands below use the MongoDB root credentials from the protected `.env` file; the database is authenticated and is not published on the host.

For a consistent application-level snapshot, place the app in a maintenance window and stop API writes while both backups are taken:

```bash
set -a
. ./.env
set +a
mkdir -p backups
network=$(docker network ls --filter label=com.docker.compose.project --format '{{.Name}}' | grep '_default

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
- [ ] Verify both MongoDB and private-file backup archives are encrypted, off-site and restorable together
- [ ] Complete rate limiting, password reset, MFA, audit-route coverage, tenant-isolation review and vulnerability scanning before public production
 | head -n1)
date_tag=$(date -u +%Y%m%dT%H%M%SZ)
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop bee-core
docker run --rm --network "$network" -v "$PWD/backups:/backup" \
  mongodb/mongodb-database-tools:100.12.2 \
  mongodump --uri="mongodb://${MONGO_ROOT_USERNAME}:${MONGO_ROOT_PASSWORD}@mongodb:27017/${MONGODB_DB:-bee_core}?authSource=admin" \
  --archive="/backup/bee_core-${date_tag}.archive" --gzip
docker run --rm --volumes-from bee-core -v "$PWD/backups:/backup" alpine:3.20 \
  tar czf "/backup/bee_core_files-${date_tag}.tar.gz" -C /data/bee-files .
docker compose -f docker-compose.yml -f docker-compose.prod.yml start bee-core
```

Copy both files off-server, encrypt them, restrict access and define retention. Keep the database archive and file archive from the same `date_tag` together. A backup on the same VPS is not sufficient disaster recovery.

## Restore drill

Restore the database into a separate database first; never overwrite the live database during a drill:

```bash
set -a
. ./.env
set +a
network=$(docker network ls --filter label=com.docker.compose.project --format '{{.Name}}' | grep '_default

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
 | head -n1)
docker run --rm --network "$network" -v "$PWD/backups:/backup" \
  mongodb/mongodb-database-tools:100.12.2 \
  mongorestore --uri="mongodb://${MONGO_ROOT_USERNAME}:${MONGO_ROOT_PASSWORD}@mongodb:27017/bee_core_restore?authSource=admin" \
  --archive="/backup/bee_core-YYYYMMDDTHHMMSSZ.archive" --gzip \
  --nsInclude='bee_core.*' --nsFrom='bee_core.*' --nsTo='bee_core_restore.*'
```

Restore the file archive only during a planned maintenance window, after taking a safety copy of the current file volume:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop bee-core
docker run --rm --volumes-from bee-core -v "$PWD/backups:/backup" alpine:3.20 \
  sh -c 'find /data/bee-files -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar xzf /backup/bee_core_files_YYYYMMDDTHHMMSSZ.tar.gz -C /data/bee-files'
docker compose -f docker-compose.yml -f docker-compose.prod.yml start bee-core
```

Verify application-critical collections, file references and restored records before considering the drill successful. CI exercises a MongoDB sentinel round-trip and checks that both backup artifacts can be created; it does not replace scheduled encrypted off-site backups, retention policies or periodic restores against production-sized data.

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
