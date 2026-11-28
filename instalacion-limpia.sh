#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="$HOME/projects/Bee-core"
BRANCH="main"
COMPOSE_PROJECT_NAME="bee-core"

export COMPOSE_PROJECT_NAME

cd "$PROJECT_DIR"

echo "=========================================="
echo " BEE-CORE - INSTALACIÓN COMPLETA MONGODB 9"
echo "=========================================="

if [[ ! -f .env ]]; then
  echo "ERROR: No existe .env. No se puede continuar."
  exit 1
fi

# No cambiar de rama si hay modificaciones en archivos versionados.
# Los archivos no versionados (por ejemplo secrets/ y artifacts/) se conservan.
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "ERROR: Hay cambios locales en archivos versionados."
  echo "Guárdalos o descártalos antes de continuar."
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

# Una instalación realmente limpia elimina los tres volúmenes persistentes:
# base de datos, archivos privados y paquetes ZIP de plugins.
# Validar TODOS los volúmenes antes de detener o eliminar nada.
VOLUME_NAMES=(
  "${COMPOSE_PROJECT_NAME}_bee_core_mongodb_data"
  "${COMPOSE_PROJECT_NAME}_bee_core_files"
  "${COMPOSE_PROJECT_NAME}_bee_core_plugins"
)
VOLUME_KEYS=(
  "bee_core_mongodb_data"
  "bee_core_files"
  "bee_core_plugins"
)
VOLUMES_TO_REMOVE=()

echo "[4/7] Validando todos los volúmenes persistentes que se eliminarán..."
echo "ATENCIÓN: se eliminarán la base de datos, los archivos privados y todos los paquetes de plugins."

for index in "${!VOLUME_NAMES[@]}"; do
  VOLUME_NAME="${VOLUME_NAMES[$index]}"
  EXPECTED_KEY="${VOLUME_KEYS[$index]}"

  if ! docker volume inspect "$VOLUME_NAME" >/dev/null 2>&1; then
    echo "No existe el volumen $VOLUME_NAME; se creará vacío."
    continue
  fi

  VOLUME_PROJECT=$(docker volume inspect --format '{{ index .Labels "com.docker.compose.project" }}' "$VOLUME_NAME")
  COMPOSE_VOLUME_KEY=$(docker volume inspect --format '{{ index .Labels "com.docker.compose.volume" }}' "$VOLUME_NAME")

  if [[ "$VOLUME_PROJECT" != "$COMPOSE_PROJECT_NAME" || "$COMPOSE_VOLUME_KEY" != "$EXPECTED_KEY" ]]; then
    echo "ERROR: El volumen $VOLUME_NAME no tiene las etiquetas esperadas de Bee-core."
    echo "No se eliminará ningún volumen. Revisa el nombre del proyecto y las etiquetas."
    exit 1
  fi

  VOLUMES_TO_REMOVE+=("$VOLUME_NAME")
done

echo "[5/7] Deteniendo servicios..."

docker compose down --remove-orphans

for VOLUME_NAME in "${VOLUMES_TO_REMOVE[@]}"; do
  echo "Eliminando volumen persistente: $VOLUME_NAME"
  docker volume rm "$VOLUME_NAME"
done

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

for attempt in $(seq 1 30); do
  WEB_STATUS=$(docker inspect bee-core-web --format '{{.State.Status}}')

  if [[ "$WEB_STATUS" == "running" ]]; then
    echo "bee-core-web: running"
    break
  fi

  if [[ "$attempt" -eq 30 ]]; then
    echo "ERROR: bee-core-web no está en ejecución."
    docker compose ps
    docker compose logs --tail=100 web
    exit 1
  fi

  sleep 2
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
