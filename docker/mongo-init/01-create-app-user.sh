#!/usr/bin/env bash
set -euo pipefail

: "${MONGO_APP_USERNAME:?MONGO_APP_USERNAME is required}"
: "${MONGO_APP_PASSWORD:?MONGO_APP_PASSWORD is required}"
: "${MONGO_INITDB_DATABASE:?MONGO_INITDB_DATABASE is required}"

mongosh --quiet \
  --username "$MONGO_INITDB_ROOT_USERNAME" \
  --password "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  "$MONGO_INITDB_DATABASE" \
  --eval '
    const username = process.env.MONGO_APP_USERNAME;
    const password = process.env.MONGO_APP_PASSWORD;
    const database = process.env.MONGO_INITDB_DATABASE;
    if (!db.getUser(username)) {
      db.createUser({ user: username, pwd: password, roles: [{ role: "readWrite", db: database }] });
    }
  '
