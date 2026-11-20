import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePluginManifest, type BeeBusinessPluginManifest } from "../src/core/plugin-package.js";
import { resolvePluginDependencyOrder } from "../src/core/plugin-entitlements.js";

const validManifest: BeeBusinessPluginManifest = {
  id: "crm.contacts",
  name: "CRM Contacts",
  version: "1.0.0",
  publisher: "Bee Projects",
  description: "Company-scoped contact management",
  category: "crm",
  compatibility: { minRuntimeVersion: "0.3.0" },
  dependencies: [{ pluginId: "core.audit", versionRange: "^1.0.0", optional: true }],
  permissions: [{ key: "crm.contacts.read", description: "Read company contacts" }],
  backend: { entrypoint: "dist/backend/index.js" },
  frontend: { routes: [{ path: "/crm/contacts", component: "crm.contacts.list" }] },
  collections: ["crm_contacts", "crm_contact_notes"],
  migrations: [{ id: "001-create-contacts", checksum: "a".repeat(64), phase: "install" }],
  settingsSchema: { type: "object", properties: {} },
  package: { sha256: "b".repeat(64), signature: "signed-package-digest", storageKey: "packages/crm-contacts/1.0.0.tgz" }
};

test("plugin manifest accepts a complete, versioned and signed package contract", () => {
  assert.doesNotThrow(() => validatePluginManifest(validManifest));
});

test("plugin manifest rejects unsafe paths, invalid IDs, duplicate permissions and invalid digests", () => {
  assert.throws(() => validatePluginManifest({ ...validManifest, id: "../crm" }), /plugin id/);
  assert.throws(() => validatePluginManifest({ ...validManifest, backend: { entrypoint: "../../etc/passwd" } }), /entrypoint/);
  assert.throws(() => validatePluginManifest({ ...validManifest, package: { ...validManifest.package, storageKey: "../outside.tgz" } }), /package digest/);
  assert.throws(() => validatePluginManifest({ ...validManifest, package: { ...validManifest.package, sha256: "bad" } }), /package digest/);
  assert.throws(() => validatePluginManifest({ ...validManifest, permissions: [...validManifest.permissions, ...validManifest.permissions] }), /unique/);
  assert.throws(() => validatePluginManifest({ ...validManifest, dependencies: [...validManifest.dependencies, ...validManifest.dependencies] }), /dependencies must be unique/);
  assert.throws(() => validatePluginManifest({ ...validManifest, dependencies: [{ pluginId: "core.audit", versionRange: "latest" }] }), /Invalid plugin dependencies/);
  assert.throws(() => validatePluginManifest({ ...validManifest, frontend: { routes: [{ path: "/same", component: "crm.contacts.list" }, { path: "/same", component: "crm.contacts.detail" }] } }), /route paths must be unique/);
  assert.throws(() => validatePluginManifest({ ...validManifest, collections: ["crm_contacts", "crm_contacts"] }), /collection names must be unique/);
  assert.throws(() => validatePluginManifest({ ...validManifest, migrations: [...validManifest.migrations, ...validManifest.migrations] }), /migration IDs must be unique/);
  assert.throws(() => validatePluginManifest({ ...validManifest, frontend: { routes: [{ path: "/../../admin", component: "crm.contacts.list" }] } }), /Invalid frontend route registrations/);
});

test("plugin dependency resolver orders transitive dependencies before dependents", () => {
  const packages = [
    { id: "app", dependencies: ["reports", "search"] },
    { id: "reports", dependencies: ["database"] },
    { id: "search", dependencies: ["database"] },
    { id: "database", dependencies: [] }
  ];
  assert.deepEqual(resolvePluginDependencyOrder("app", packages), ["database", "reports", "search"]);
});

test("plugin dependency resolver rejects missing dependencies and dependency cycles", () => {
  assert.throws(
    () => resolvePluginDependencyOrder("app", [{ id: "app", dependencies: ["missing"] }]),
    /Missing trusted plugin dependency/
  );
  assert.throws(
    () => resolvePluginDependencyOrder("app", [
      { id: "app", dependencies: ["reports"] },
      { id: "reports", dependencies: ["app"] }
    ]),
    /dependency cycle/
  );
});


import { MongoClient } from "mongodb";
import { rollbackTenantPluginMigrations, runTenantPluginMigrations } from "../src/core/plugin-migrations.js";

const migrationMongoUri = process.env.MONGODB_TEST_URI;

test("tenant plugin migrations are idempotent and reject checksum drift", { skip: !migrationMongoUri }, async () => {
  const client = new MongoClient(migrationMongoUri!);
  await client.connect();
  const dbName = "bee_plugin_migrations_" + Date.now();
  const db = client.db(dbName);
  let executions = 0;
  const migration = {
    id: "001-create-records",
    checksum: "a".repeat(64),
    up: async () => { executions += 1; },
    down: async () => {}
  };
  try {
    const first = await runTenantPluginMigrations(db, "tenant-a", "crm.contacts", [migration]);
    assert.deepEqual(first, { applied: ["001-create-records"], skipped: [] });
    const second = await runTenantPluginMigrations(db, "tenant-a", "crm.contacts", [migration]);
    assert.deepEqual(second, { applied: [], skipped: ["001-create-records"] });
    assert.equal(executions, 1, "an applied migration must not execute twice");
    await assert.rejects(
      runTenantPluginMigrations(db, "tenant-a", "crm.contacts", [{ ...migration, checksum: "b".repeat(64) }]),
      /checksum changed/
    );
    assert.equal(await db.collection("tenant_plugin_migrations").countDocuments({ tenantId: "tenant-b" }), 0);
  } finally {
    await client.db(dbName).dropDatabase();
    await client.close();
  }
});

test("failed plugin migration compensates partial work and rolls prior migrations back in reverse order", { skip: !migrationMongoUri }, async () => {
  const client = new MongoClient(migrationMongoUri!);
  await client.connect();
  const dbName = "bee_plugin_migration_rollback_" + Date.now();
  const db = client.db(dbName);
  const order: string[] = [];
  const first = {
    id: "001-first",
    checksum: "1".repeat(64),
    up: async () => { order.push("up-first"); },
    down: async () => { order.push("down-first"); }
  };
  const second = {
    id: "002-second",
    checksum: "2".repeat(64),
    up: async () => { order.push("up-second"); throw new Error("injected migration failure"); },
    down: async () => { order.push("down-second"); }
  };
  try {
    await assert.rejects(
      runTenantPluginMigrations(db, "tenant-a", "crm.contacts", [first, second]),
      /Plugin migration failed \(002-second\): injected migration failure/
    );
    assert.deepEqual(order, ["up-first", "up-second", "down-second", "down-first"]);
    const records = await db.collection("tenant_plugin_migrations").find({ tenantId: "tenant-a" }).sort({ migrationId: 1 }).toArray();
    assert.deepEqual(records.map(record => [record.migrationId, record.status]), [
      ["001-first", "rolled_back"],
      ["002-second", "rolled_back"]
    ]);
  } finally {
    await client.db(dbName).dropDatabase();
    await client.close();
  }
});

test("migration rollback failures are persisted for operator recovery", { skip: !migrationMongoUri }, async () => {
  const client = new MongoClient(migrationMongoUri!);
  await client.connect();
  const dbName = "bee_plugin_migration_rollback_failure_" + Date.now();
  const db = client.db(dbName);
  try {
    await assert.rejects(
      runTenantPluginMigrations(db, "tenant-a", "crm.contacts", [{
        id: "001-no-compensation",
        checksum: "3".repeat(64),
        up: async () => { throw new Error("partial write"); }
      }]),
      /Plugin migration failed/
    );
    const record = await db.collection("tenant_plugin_migrations").findOne({ tenantId: "tenant-a", migrationId: "001-no-compensation" });
    assert.equal(record?.status, "rollback_failed");
    assert.match(String(record?.error), /No rollback handler/);
  } finally {
    await client.db(dbName).dropDatabase();
    await client.close();
  }
});


test("successful migrations can be compensated when a later lifecycle hook fails", { skip: !migrationMongoUri }, async () => {
  const client = new MongoClient(migrationMongoUri!);
  await client.connect();
  const dbName = "bee_plugin_migration_lifecycle_compensation_" + Date.now();
  const db = client.db(dbName);
  const order: string[] = [];
  const migrations = [
    {
      id: "001-add-column",
      checksum: "4".repeat(64),
      up: async () => { order.push("up-1"); },
      down: async () => { order.push("down-1"); }
    },
    {
      id: "002-backfill",
      checksum: "5".repeat(64),
      up: async () => { order.push("up-2"); },
      down: async () => { order.push("down-2"); }
    }
  ];
  try {
    const result = await runTenantPluginMigrations(db, "tenant-a", "crm.contacts", migrations);
    assert.deepEqual(result.applied, ["001-add-column", "002-backfill"]);
    const rollback = await rollbackTenantPluginMigrations(db, "tenant-a", "crm.contacts", migrations, result.applied);
    assert.deepEqual(rollback, { rolledBack: ["002-backfill", "001-add-column"], failed: [] });
    assert.deepEqual(order, ["up-1", "up-2", "down-2", "down-1"]);
    assert.equal(await db.collection("tenant_plugin_migrations").countDocuments({ tenantId: "tenant-a", status: "applied" }), 0);
  } finally {
    await client.db(dbName).dropDatabase();
    await client.close();
  }
});
