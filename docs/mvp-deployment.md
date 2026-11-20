# Bee-Core 0.1.0 MVP deployment guide

This overlay is the first server-install profile for Bee-Core. It exposes the Angular/Nginx web container only and keeps MongoDB and the API on the Compose network.

## Status / scope

This is a **deployment candidate**, not a security-certified production release. The repository's tenant isolation notes explicitly list routes and asynchronous paths that still need audit/migration. Authentication notes also identify missing rate limiting, MFA, password reset, email verification and immediate access-token revocation. Do not expose this stack directly to the public internet without HTTPS, firewalling, backups, and a security review.

## Prerequisites

- Docker Engine and Docker Compose plugin
- Linux VPS with inbound TCP 80 (or place behind an existing reverse proxy)
- A domain and TLS termination configured at the host reverse proxy before collecting real user data

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

Start the production overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Web UI: `http://SERVER_OR_DOMAIN/`. The web Nginx container proxies `/api/` to the internal Bee-Core service. API and MongoDB do not publish host ports in this profile.

## Verify deployment

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=100 bee-core
curl -fsS http://127.0.0.1/ || curl -fsS http://SERVER_OR_DOMAIN/
```

The API health endpoint is available internally at `http://bee-core:3000/health`; do not expose it directly in the production profile. From the host, test the web endpoint and the login flow through the frontend proxy.

## Data persistence

- MongoDB data: Docker volume `bee_core_mongodb_data`
- Private file data: Docker volume `bee_core_files`

List volumes:

```bash
docker volume ls | grep bee_core
```

## Backup (basic logical backup)

Run a database dump from the Mongo container. Store the backup off-server and encrypt it:

```bash
mkdir -p backups
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T mongodb mongodump --db bee_core --archive > backups/bee_core-$(date +%F).archive
```

Restore validation is not yet automated; test restores into a separate database before treating backups as reliable.

## Update

```bash
git pull --ff-only
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## Production checklist

- [ ] Configure HTTPS on host reverse proxy (Let's Encrypt or managed TLS); redirect HTTP to HTTPS
- [ ] Firewall only the reverse proxy ports (normally 80/443)
- [ ] Do not publish MongoDB or API host ports
- [ ] Use a strong generated JWT secret and unique bootstrap credentials
- [ ] Keep `.env` out of Git and restrict its permissions (`chmod 600 .env`)
- [ ] Configure encrypted, off-site backups and test a restore
- [ ] Configure VPS monitoring, disk alerts, and container log rotation
- [ ] Review `docs/tenant-data-isolation.md` limitations and all plugin routes
- [ ] Before public production: add rate limiting, password reset, MFA, audit route coverage, tenant-isolation tests, vulnerability scanning, and restore drill

