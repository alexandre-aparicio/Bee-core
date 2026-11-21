# Bee-Core 0.1.0 MVP deployment guide

This overlay is the first server-install profile for Bee-Core. It exposes the Angular/Nginx web container on a dedicated host port for an existing reverse proxy (such as Nginx Proxy Manager) and keeps MongoDB and the API on the private Compose network.

## Status / scope

This is a **deployment candidate**, not a security-certified production release. Tenant isolation, authentication hardening, monitoring and operational recovery still have open work. Do not expose this stack directly to the public internet without HTTPS, firewalling, encrypted off-site backups and a security review.

## Container process handling

The Compose definition enables Docker's lightweight init process for MongoDB, the API and the web container. It forwards termination signals and reaps orphaned child processes, improving clean shutdown and restart behavior. It does not replace health checks, graceful application shutdown, or monitoring.

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

The web Nginx container proxies `/api/` to the internal Bee-Core service. API and MongoDB do not publish host ports in this profile. The production overlay places MongoDB and the API on an internal backend network; only the API and web proxy share the frontend network, so the web container cannot connect directly to MongoDB. Do not bind Bee-Core to host ports 80 or 443; those belong to the existing Nginx Proxy Manager.

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

Back up both persistent data stores: MongoDB and the private file volume. These commands use the active Compose network/container and honor `MONGODB_DB` from the shell environment or `.env`. Keep the backup directory outside the Git checkout:

```bash
set -euo pipefail
backup_dir="$HOME/bee-core-backups"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
backup_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
db_name="${MONGODB_DB:-$(sed -n 's/^MONGODB_DB=//p' .env | tail -n1)}"
db_name="${db_name:-bee_core}"
mongodb_id="$(docker compose -f docker-compose.yml -f docker-compose.prod.yml ps -q mongodb)"
network="$(docker inspect "$mongodb_id" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{end}}')"
files_volume="$(docker volume ls --filter label=com.docker.compose.volume=bee_core_files --format '{{.Name}}' | head -n1)"
test -n "$network"
test -n "$files_volume"

docker run --rm --network "$network" -v "$backup_dir:/backup" \
  mongodb/mongodb-database-tools:100.12.2 \
  mongodump --uri="mongodb://mongodb:27017/${db_name}" \
  --archive="/backup/bee-core-${db_name}-${backup_stamp}.archive" --gzip

docker run --rm -v "$files_volume:/data:ro" -v "$backup_dir:/backup" alpine:3.20 \
  sh -c "tar -czf /backup/bee-core-files-${backup_stamp}.tar.gz -C /data ."
```

Copy both archives off-server, encrypt them, and define retention. A backup on the same VPS is not sufficient disaster recovery. The file-volume archive may contain customer uploads and must be protected like the database backup.

## Restore drill

Restore into a separate database and volume first; never overwrite live data during a drill. Set `BACKUP_STAMP` to the timestamp used by the two backup files:

```bash
set -euo pipefail
backup_dir="$HOME/bee-core-backups"
backup_stamp="${BACKUP_STAMP:?Set BACKUP_STAMP to the backup timestamp}"
db_name="${MONGODB_DB:-$(sed -n 's/^MONGODB_DB=//p' .env | tail -n1)}"
db_name="${db_name:-bee_core}"
restore_db="${db_name}_restore"
archive="bee-core-${db_name}-${backup_stamp}.archive"
files_archive="bee-core-files-${backup_stamp}.tar.gz"
mongodb_id="$(docker compose -f docker-compose.yml -f docker-compose.prod.yml ps -q mongodb)"
network="$(docker inspect "$mongodb_id" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{end}}')"
test -f "$backup_dir/$archive"
test -f "$backup_dir/$files_archive"

docker run --rm --network "$network" -v "$backup_dir:/backup:ro" \
  mongodb/mongodb-database-tools:100.12.2 \
  mongorestore --uri="mongodb://mongodb:27017/${restore_db}" \
  --archive="/backup/${archive}" --gzip \
  --nsInclude="${db_name}.*" --nsFrom="${db_name}.*" --nsTo="${restore_db}.*"

restore_volume="bee-core-files-restore-drill"
docker volume rm "$restore_volume" >/dev/null 2>&1 || true
docker volume create "$restore_volume"
docker run --rm -v "$restore_volume:/restore" -v "$backup_dir:/backup:ro" alpine:3.20 \
  sh -c "tar -xzf /backup/${files_archive} -C /restore"
docker run --rm -v "$restore_volume:/restore:ro" alpine:3.20 \
  sh -c "find /restore -type f -print | sed -n '1,20p'"
```

Verify application-critical MongoDB collections and records, and inspect restored files in the separate volume before considering the drill successful. Remove the temporary restore volume and database after validation. The CI workflow exercises MongoDB and file-volume round-trips; it does not replace scheduled encrypted off-site backups, retention policies or periodic restores against production-sized data.
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
