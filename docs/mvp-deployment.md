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

Generate fresh values for every required secret. This command replaces the example placeholders:

```bash
set -euo pipefail
JWT_SECRET=$(openssl rand -hex 48)
AUTH_MFA_ENCRYPTION_KEY=$(openssl rand -base64 32)
MONGO_ROOT_PASSWORD=$(openssl rand -hex 32)
MONGO_APP_PASSWORD=$(openssl rand -hex 32)
BEE_MAIL_ENCRYPTION_KEY=$(openssl rand -hex 32)
sed -i \
  -e "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" \
  -e "s|^AUTH_MFA_ENCRYPTION_KEY=.*|AUTH_MFA_ENCRYPTION_KEY=$AUTH_MFA_ENCRYPTION_KEY|" \
  -e "s|^MONGO_ROOT_PASSWORD=.*|MONGO_ROOT_PASSWORD=$MONGO_ROOT_PASSWORD|" \
  -e "s|^MONGO_APP_PASSWORD=.*|MONGO_APP_PASSWORD=$MONGO_APP_PASSWORD|" \
  -e "s|^BEE_MAIL_ENCRYPTION_KEY=.*|BEE_MAIL_ENCRYPTION_KEY=$BEE_MAIL_ENCRYPTION_KEY|" \
  .env
```

Edit `.env` and set a unique admin email, a password of at least 12 characters, and the intended `PUBLIC_BASE_DOMAIN`. If you enable billing webhooks, set `BEE_BILLING_WEBHOOK_SECRET` to a separate high-entropy secret. Keep `.env` private and do not commit it:

```bash
chmod 600 .env
```

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

MongoDB authentication is enabled. Use the root account only for maintenance and backup/restore operations; the application itself uses a database-scoped application account. The example below reads the hex-only MongoDB credentials from .env and runs Database Tools on the private Compose network, so MongoDB remains unpublished on the host.

```bash
set -euo pipefail
set -a
. ./.env
set +a
: "${MONGO_ROOT_USERNAME:?Set MONGO_ROOT_USERNAME in .env}"
: "${MONGO_ROOT_PASSWORD:?Set MONGO_ROOT_PASSWORD in .env}"
: "${MONGODB_DB:=bee_core}"
mkdir -p backups
mongodb_id=$(docker compose -f docker-compose.yml -f docker-compose.prod.yml ps -q mongodb)
network=$(docker inspect "$mongodb_id" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{end}}')
test -n "$network"
backup_file="bee_core-$(date +%F).archive"
docker run --rm --network "$network" \
  -e MONGO_ROOT_USERNAME -e MONGO_ROOT_PASSWORD -e MONGODB_DB -e BACKUP_FILE="$backup_file" \
  -v "$PWD/backups:/backup" --entrypoint sh \
  mongodb/mongodb-database-tools:100.12.2 -c \
  'exec mongodump --host=mongodb:27017 --username="$MONGO_ROOT_USERNAME" --password="$MONGO_ROOT_PASSWORD" --authenticationDatabase=admin --db="$MONGODB_DB" --archive="/backup/$BACKUP_FILE" --gzip'
```



Back up the private file volume as well. The database stores file metadata while the binary content lives in the separate bee_core_files Docker volume; these two backups must be retained together. Pause application writes while taking the pair for a consistent recovery point:

```bash
set -euo pipefail
backend_id=$(docker compose -f docker-compose.yml -f docker-compose.prod.yml ps -q bee-core)
files_volume=$(docker inspect "$backend_id" --format '{{range .Mounts}}{{if eq .Destination "/data/bee-files"}}{{.Name}}{{end}}{{end}}')
: "${files_volume:?Could not resolve the Bee-Core private file volume}"
docker run --rm -v "$files_volume:/source:ro" -v "$PWD/backups:/backup" ubuntu:22.04 \
  tar -czf "/backup/bee_core_files-$(date +%F).tar.gz" -C /source .
```

Copy both the MongoDB archive and file-volume archive off-server, encrypt them, and apply the same retention policy. A backup on the same VPS is not sufficient disaster recovery. The root credentials are passed to the short-lived tools container through its environment; restrict access to the Docker host and .env.

## Restore drill

Restore into a separate database first; never overwrite the live database during a drill:

```bash
set -euo pipefail
set -a
. ./.env
set +a
: "${MONGO_ROOT_USERNAME:?Set MONGO_ROOT_USERNAME in .env}"
: "${MONGO_ROOT_PASSWORD:?Set MONGO_ROOT_PASSWORD in .env}"
: "${MONGODB_DB:=bee_core}"
restore_db="${MONGODB_DB}_restore"
network=$(docker inspect "$(docker compose -f docker-compose.yml -f docker-compose.prod.yml ps -q mongodb)" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{end}}')
docker run --rm --network "$network" \
  -e MONGO_ROOT_USERNAME -e MONGO_ROOT_PASSWORD -e MONGODB_DB -e RESTORE_DB="$restore_db" \
  -v "$PWD/backups:/backup" --entrypoint sh \
  mongodb/mongodb-database-tools:100.12.2 -c \
  'exec mongorestore --host=mongodb:27017 --username="$MONGO_ROOT_USERNAME" --password="$MONGO_ROOT_PASSWORD" --authenticationDatabase=admin --archive="/backup/bee_core-YYYY-MM-DD.archive" --gzip --nsInclude="$MONGODB_DB.*" --nsFrom="$MONGODB_DB.*" --nsTo="$RESTORE_DB.*"'
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T mongodb mongosh --quiet \
  --username "$MONGO_ROOT_USERNAME" --password "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin \
  --eval "const restored=db.getSiblingDB('$restore_db'); printjson(restored.getCollectionNames());"
# After verifying the restored collections and records:
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T mongodb mongosh --quiet \
  --username "$MONGO_ROOT_USERNAME" --password "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin \
  --eval "db.getSiblingDB('$restore_db').dropDatabase()"
```

Restore the private file archive into a separate named volume during the same drill:

```bash
restore_files_volume="bee_core_files_restore"
docker volume create "$restore_files_volume"
docker run --rm -v "$restore_files_volume:/target" -v "$PWD/backups:/backup:ro" ubuntu:22.04 \
  tar -xzf /backup/bee_core_files-YYYY-MM-DD.tar.gz -C /target
backend_id=$(docker compose -f docker-compose.yml -f docker-compose.prod.yml ps -q bee-core)
files_volume=$(docker inspect "$backend_id" --format '{{range .Mounts}}{{if eq .Destination "/data/bee-files"}}{{.Name}}{{end}}{{end}}')
docker run --rm -v "$files_volume:/source:ro" -v "$restore_files_volume:/restored:ro" ubuntu:22.04 \
  bash -euc 'diff -r /source /restored'
docker volume rm "$restore_files_volume"
```

For an actual recovery, stop Bee-Core before replacing the live file volume and restore the database and file archive from the same recovery point. Verify application-critical collections and records plus representative downloaded files before reopening writes. The CI workflow exercises authenticated MongoDB and private-file-volume round-trips; it does not replace scheduled encrypted off-site backups, retention policies or periodic restores against production-sized data.

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
