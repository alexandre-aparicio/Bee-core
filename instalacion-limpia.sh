#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="$HOME/projects/Bee-core"
BRANCH="chore/mongodb9-angular22-deployment"
COMPOSE_PROJECT_NAME="bee-core"

export COMPOSE_PROJECT_NAME

cd "$PROJECT_DIR"

echo "=========================================="
echo " BEE-CORE - INSTALACIÓN LIMPIA MONGODB 9"
echo "=========================================="

if [[ ! -f .env ]]; then
  echo "ERROR: No existe .env. No se puede continuar."
  exit 1
fi

echo "[1/7] Actualizando código desde GitHub..."

git fetch origin
git switch "$BRANCH"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: Hay cambios locales versionados. No se sobrescribirán."
  exit 1
fi

git pull --ff-only origin "$BRANCH"

echo "Commit:"
git log -1 --oneline

echo "[2/7] Validando configuración..."

docker compose config --quiet

if ! docker compose config --images | grep -Fxq "mongo:9.0.4"; then
  echo "ERROR: La configuración no utiliza mongo:9.0.4."
  exit 1
fi

echo "[3/7] Descargando y construyendo imágenes..."

docker compose pull mongodb
docker compose build --pull bee-core web

echo "[4/7] Deteniendo servicios..."

docker compose down --remove-orphans

echo "[5/7] Eliminando exclusivamente la base de datos anterior..."

DB_VOLUME="${COMPOSE_PROJECT_NAME}_bee_core_mongodb_data"

if docker volume inspect "$DB_VOLUME" >/dev/null 2>&1; then
  docker volume rm "$DB_VOLUME"
else
  echo "No existe volumen anterior; se creará uno nuevo."
fi

echo "[6/7] Arrancando Bee-core con MongoDB 9.0.4..."

docker compose up -d --force-recreate

echo "[7/7] Esperando servicios saludables..."

for service in bee-core-mongodb bee-core; do
  for attempt in $(seq 1 60); do
    STATUS=$(docker inspect "$service" \
      --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}')

    if [[ "$STATUS" == "healthy" ]]; then
      echo "$service: healthy"
      break
    fi

    if [[ "$attempt" -eq 60 ]]; then
      echo "ERROR: $service no alcanzó estado saludable."
      docker compose ps
      docker compose logs --tail=100 mongodb bee-core
      exit 1
    fi

    sleep 3
  done
done

echo
echo "=== VERSIÓN MONGODB ==="
docker exec bee-core-mongodb sh -lc '
mongosh --quiet \
  -u "$MONGO_INITDB_ROOT_USERNAME" \
  -p "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --eval "db.version()"
'

echo
echo "=== ESTADO FINAL ==="
docker compose ps

echo
echo "=== INSTALACIÓN FINALIZADA ==="
docker compose logs --tail=60 mongodb bee-core web
