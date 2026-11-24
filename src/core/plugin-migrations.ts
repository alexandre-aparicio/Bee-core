import { randomUUID } from "node:crypto";
import type { Db, Document } from "mongodb";
import { TenantCollection } from "./tenant-collection.js";

export type TenantPluginMigration = {
  id: string;
  checksum: string;
  phase?: "install" | "upgrade";
  up: (db: Db, tenantId: string) => Promise<void>;
  down?: (db: Db, tenantId: string) => Promise<void>;
};

type MigrationRecord = Document & {
  id: string;
  tenantId: string;
  pluginId: string;
  migrationId: string;
  checksum: string;
  status: "running" | "applied" | "failed" | "rolled_back" | "rollback_failed";
  startedAt: Date;
  appliedAt?: Date;
  error?: string;
};

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : "Migration failed").slice(0, 500);
}

/**
 * Runs immutable, tenant-scoped plugin migrations.
 * A "running" migration is retried on the next install attempt, so each up()
 * must be idempotent. Completed migrations in the current run are compensated
 * in reverse order if a later migration fails.
 */
export async function runTenantPluginMigrations(
  db: Db,
  tenantId: string,
  pluginId: string,
  migrations: readonly TenantPluginMigration[]
): Promise<{ applied: string[]; skipped: string[] }> {
  const collection = db.collection<MigrationRecord>("tenant_plugin_migrations");
  await collection.createIndex(
    { tenantId: 1, pluginId: 1, migrationId: 1 },
    { unique: true, name: "tenant_plugin_migration_unique" }
  );
  const records = new TenantCollection<MigrationRecord>(collection, tenantId);
  const applied: string[] = [];
  const skipped: string[] = [];
  const completed: TenantPluginMigration[] = [];

  for (const migration of migrations) {
    if (!migration.id.trim() || !/^[a-f0-9]{64}$/i.test(migration.checksum)) {
      throw new Error("Plugin migration requires a stable ID and SHA-256 checksum");
    }
    const existing = await records.findOne({ pluginId, migrationId: migration.id });
    if (existing && existing.checksum !== migration.checksum) {
      throw new Error("Applied plugin migration checksum changed: " + migration.id);
    }
    if (existing?.status === "applied") {
      skipped.push(migration.id);
      continue;
    }

    const now = new Date();
    if (existing) {
      await records.updateOne(
        { pluginId, migrationId: migration.id },
        { $set: { status: "running", startedAt: now, error: "" }, $unset: { appliedAt: "" } }
      );
    } else {
      try {
        await records.insertOne({
          id: randomUUID(),
          pluginId,
          migrationId: migration.id,
          checksum: migration.checksum,
          status: "running",
          startedAt: now
        });
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        const concurrent = await records.findOne({ pluginId, migrationId: migration.id });
        if (concurrent?.status === "applied" && concurrent.checksum === migration.checksum) {
          skipped.push(migration.id);
          continue;
        }
        throw new Error("Plugin migration is already running: " + migration.id);
      }
    }

    try {
      await migration.up(db, tenantId);
      await records.updateOne(
        { pluginId, migrationId: migration.id },
        { $set: { status: "applied", appliedAt: new Date(), error: "" } }
      );
      applied.push(migration.id);
      completed.push(migration);
    } catch (error) {
      await records.updateOne(
        { pluginId, migrationId: migration.id },
        { $set: { status: "failed", error: errorText(error) } }
      );
      const rollbackTargets = [migration, ...completed.reverse()];
      for (const target of rollbackTargets) {
        if (!target.down) {
          await records.updateOne(
            { pluginId, migrationId: target.id },
            { $set: { status: "rollback_failed", error: "No rollback handler is registered" } }
          );
          continue;
        }
        try {
          await target.down(db, tenantId);
          await records.updateOne(
            { pluginId, migrationId: target.id },
            { $set: { status: "rolled_back", error: "" }, $unset: { appliedAt: "" } }
          );
        } catch (rollbackError) {
          await records.updateOne(
            { pluginId, migrationId: target.id },
            { $set: { status: "rollback_failed", error: errorText(rollbackError) } }
          );
        }
      }
      throw new Error("Plugin migration failed (" + migration.id + "): " + errorText(error));
    }
  }

  return { applied, skipped };
}


/**
 * Compensate migrations that completed successfully before a later lifecycle
 * step (for example a plugin hook or version switch) failed.
 */
export async function rollbackTenantPluginMigrations(
  db: Db,
  tenantId: string,
  pluginId: string,
  migrations: readonly TenantPluginMigration[],
  migrationIds: readonly string[]
): Promise<{ rolledBack: string[]; failed: string[] }> {
  const collection = db.collection<MigrationRecord>("tenant_plugin_migrations");
  await collection.createIndex(
    { tenantId: 1, pluginId: 1, migrationId: 1 },
    { unique: true, name: "tenant_plugin_migration_unique" }
  );
  const records = new TenantCollection<MigrationRecord>(collection, tenantId);
  const byId = new Map(migrations.map(migration => [migration.id, migration]));
  const rolledBack: string[] = [];
  const failed: string[] = [];

  for (const migrationId of [...migrationIds].reverse()) {
    const migration = byId.get(migrationId);
    const record = await records.findOne({ pluginId, migrationId });
    if (!migration || !record || record.status !== "applied") continue;
    if (!migration.down) {
      await records.updateOne(
        { pluginId, migrationId },
        { $set: { status: "rollback_failed", error: "No rollback handler is registered" } }
      );
      failed.push(migrationId);
      continue;
    }
    try {
      await migration.down(db, tenantId);
      await records.updateOne(
        { pluginId, migrationId },
        { $set: { status: "rolled_back", error: "" }, $unset: { appliedAt: "" } }
      );
      rolledBack.push(migrationId);
    } catch (error) {
      await records.updateOne(
        { pluginId, migrationId },
        { $set: { status: "rollback_failed", error: errorText(error) } }
      );
      failed.push(migrationId);
    }
  }

  return { rolledBack, failed };
}
