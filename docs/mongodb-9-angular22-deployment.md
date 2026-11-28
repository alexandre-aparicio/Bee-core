# MongoDB 9.0.4 y Angular 22: instalación y actualización

Esta guía describe el despliegue de Bee-Core basado en la configuración de `main`.

## Versiones fijadas

- MongoDB: `mongo:9.0.4` (servicio Compose `mongodb`).
- Node.js del backend: `node:22-alpine` en compilación y ejecución.
- Node.js de compilación del frontend: `node:22.22.3-bookworm-slim`.
- Angular Core, CLI, Build y CDK: `22.2.7`.
- Driver oficial MongoDB para Node.js: `^7.9.1`.

Las dependencias deben instalarse desde los lockfiles versionados mediante `npm ci`; no se deben editar manualmente los lockfiles.

## Instalación limpia en el VPS

El repositorio incluye `instalacion-limpia.sh`. Está pensado para una instalación que debe empezar con una base de datos MongoDB nueva:

```bash
cd ~/projects/Bee-core
chmod +x instalacion-limpia.sh
./instalacion-limpia.sh
```

El instalador:

1. Exige que exista `.env` y rechaza cambios locales en archivos versionados.
2. Actualiza el checkout desde `origin/main` (la rama configurada en el propio script).
3. Valida Compose y comprueba que la imagen configurada sea exactamente `mongo:9.0.4`.
4. Descarga MongoDB y construye las imágenes del backend y frontend.
5. Comprueba las etiquetas Compose del volumen de base de datos antes de eliminarlo.
6. Detiene y recrea los servicios, espera a que MongoDB y Bee-Core estén saludables y a que la web esté ejecutándose.
7. Muestra la versión efectiva de MongoDB y el estado/logs finales.

### Datos que elimina y datos que conserva

**ATENCIÓN: la instalación limpia es destructiva para la base de datos.** Si existe el volumen Compose esperado `bee-core_bee_core_mongodb_data` (nombre habitual con el proyecto `bee-core`), el script elimina exclusivamente ese volumen después de comprobar sus etiquetas. Se crea así una base de datos vacía; no se migran ni recuperan los datos MongoDB anteriores.

El instalador no ejecuta `docker compose down -v` y no elimina los volúmenes `bee_core_files` ni `bee_core_plugins`. Los archivos privados y los paquetes de plugins persistidos quedan fuera del borrado de la base de datos.

Antes de una instalación limpia, realiza y verifica las copias de seguridad necesarias. No uses este script como procedimiento de actualización ordinaria.

## Actualización normal: conservar los datos

Para actualizar el código y recrear los contenedores sin borrar la base de datos, archivos ni paquetes de plugins:

```bash
cd ~/projects/Bee-core
export COMPOSE_PROJECT_NAME=bee-core

git status --short
git fetch origin
git switch main
git pull --ff-only origin main

docker compose config --quiet
docker compose pull mongodb
docker compose build --pull bee-core web
docker compose up -d --force-recreate

docker compose ps
```

Si `git switch main` avisa de que un archivo no versionado sería sobrescrito, detente y revisa ese conflicto. No uses `git clean -fd` ni borres archivos locales indiscriminadamente. Conserva especialmente `.env`, `secrets/` y `artifacts/`.

Este procedimiento no ejecuta `down -v`, no elimina volúmenes y no cambia deliberadamente los datos persistidos. Comprueba el estado de los servicios después de recrearlos.

## Comprobaciones posteriores

Versión MongoDB autenticada usando las credenciales ya presentes dentro del contenedor:

```bash
docker exec bee-core-mongodb sh -lc '
mongosh --quiet \
  -u "$MONGO_INITDB_ROOT_USERNAME" \
  -p "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --eval "db.version()"
'
```

Estado y logs:

```bash
docker compose ps
docker compose logs --tail=100 mongodb bee-core web
```

Se espera MongoDB `9.0.4`, estado saludable para `bee-core-mongodb` y `bee-core`, y el contenedor `bee-core-web` en ejecución.

## Límites de la validación

La CI valida los builds, pruebas y componentes de despliegue configurados en GitHub Actions. No ejecuta `instalacion-limpia.sh`, porque el script elimina intencionadamente el volumen MongoDB. La ejecución real del instalador y la comprobación visual/operativa en el VPS son verificaciones separadas.
