# MongoDB authentication rollout

The Compose stack now starts MongoDB with authentication enabled. The application connects with a dedicated `readWrite` user scoped to the Bee-Core database; the root account is reserved for administration and the health check. MongoDB is not published on a host port.

## Generate credentials

Generate hex-only passwords so they can safely be placed in the MongoDB URI:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Set the first as `MONGO_ROOT_PASSWORD` and the second as `MONGO_APP_PASSWORD` in `.env`. Also set `MONGO_ROOT_USERNAME=root`, `MONGO_APP_USERNAME=bee_core_app`, and `MONGODB_DB=bee_core`. Do not reuse the JWT or MFA encryption keys.

## Existing MongoDB volume: migrate before enabling authentication

**Do not recreate or delete the existing MongoDB volume.** MongoDB's initialization scripts only run for an empty data directory. If the current volume has no users and the container is restarted with authentication enabled, the application will be locked out.

1. Take and verify a backup of the existing MongoDB volume before changing the deployment.
2. While the current MongoDB container is still running without authentication, open an interactive shell:

   ```bash
   docker compose exec mongodb mongosh
   ```

3. Create the application user in the Bee-Core database, substituting the exact username and password values that you will put in `.env`:

   ```javascript
   use bee_core
   if (!db.getUser("bee_core_app")) {
     db.createUser({
       user: "bee_core_app",
       pwd: "PASTE_MONGO_APP_PASSWORD_HERE",
       roles: [{ role: "readWrite", db: "bee_core" }]
     })
   }
   ```

4. Create the root user in the `admin` database, using the exact root username and password from `.env`:

   ```javascript
   use admin
   if (!db.getUser("root")) {
     db.createUser({
       user: "root",
       pwd: "PASTE_MONGO_ROOT_PASSWORD_HERE",
       roles: [{ role: "root", db: "admin" }]
     })
   }
   ```

5. Exit the shell, add all four MongoDB variables to `.env`, and only then recreate the MongoDB and backend services:

   ```bash
   docker compose up -d --force-recreate mongodb bee-core
   docker compose ps
   docker compose logs --tail=100 mongodb bee-core
   ```

6. Verify application health and confirm that Bee-Core can read/write its database before removing or archiving any backup.

Do not run the migration commands against an already authenticated MongoDB instance without first checking whether those users exist. The `if (!db.getUser(...))` guards make the commands safe to repeat when the account is already present.

## New installations

For an empty MongoDB volume, the official MongoDB image creates the root account from `MONGO_INITDB_ROOT_USERNAME` and `MONGO_INITDB_ROOT_PASSWORD`, then runs `docker/mongo-init/01-create-app-user.sh` to create the restricted application user.

## Credentials and recovery

Keep both passwords in a secrets manager and retain a secure backup. If either credential is lost, update MongoDB and the Compose environment together. The application user has only `readWrite` privileges on the Bee-Core database; do not use the root account in `MONGODB_URI`.
