import { test } from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { getTenantPluginCatalog } from "../src/core/plugin-entitlements.js";
import {
  migrateLegacyConnectedDevicesPlanAssignments,
  recordLegacyConnectedDevicesPlanRemovals
} from "../src/plugins/connected-devices/connected-devices-plan-migration.js";

const uri = process.env.MONGODB_TEST_URI;

test("Connected Devices legacy plan migration is ledgered, idempotent and preserves tenant data", { skip: !uri }, async () => {
  const client = new MongoClient(uri!);
  const dbName = "bee_connected_devices_plan_migration_" + Date.now();
  await client.connect();
  const db = client.db(dbName);
  const now = new Date();
  try {
    await db.collection("plugin_plans").insertMany([
      { id: "starter", name: "Starter", includedPluginIds: ["files", "documents"], visiblePluginIds: ["files", "documents"], maxUsers: 5, storageMb: 100 },
      { id: "pro", name: "Pro", includedPluginIds: ["files", "documents"], visiblePluginIds: ["files", "documents"], maxUsers: 25, storageMb: 1024 },
      { id: "enterprise", name: "Enterprise", includedPluginIds: ["files", "documents"], visiblePluginIds: ["files", "documents"], maxUsers: null, storageMb: 10240 },
      { id: "custom", name: "Custom", includedPluginIds: ["files"], visiblePluginIds: ["files"], maxUsers: 2, storageMb: 50 }
    ]);
    await db.collection("platform_plugin_packages").insertOne({
      pluginId: "connected-devices", version: "0.1.0", source: "zip", status: "installed", runtimeState: "loaded"
    });
    await db.collection("plugin_catalog").insertOne({
      id: "connected-devices", name: "Connected Devices", version: "0.1.0",
      description: "Signed package", category: "platform", visibleInPlans: [],
      includedInPlans: [], purchasable: false, system: false, dependencies: [],
      codeAvailable: true, status: "published"
    });
    await db.collection("tenants").insertMany([
      { id: "starter-tenant", name: "Starter", status: "active", kind: "tenant", createdAt: now },
      { id: "custom-tenant", name: "Custom", status: "active", kind: "tenant", createdAt: now }
    ]);
    await db.collection("tenant_subscriptions").insertMany([
      { id: "sub-starter", tenantId: "starter-tenant", planId: "starter", status: "active", startedAt: now, currentPeriodEnd: null, updatedAt: now },
      { id: "sub-custom", tenantId: "custom-tenant", planId: "custom", status: "active", startedAt: now, currentPeriodEnd: null, updatedAt: now }
    ]);
    await db.collection("tenant_plugin_installations").insertOne({
      id: "existing-install", tenantId: "starter-tenant", pluginId: "files", version: "1.0.0",
      status: "installed", installedAt: now, updatedAt: now
    });
    await db.collection("connected_devices").insertOne({ id: "existing-device", tenantId: "starter-tenant", label: "Keep me" });

    await migrateLegacyConnectedDevicesPlanAssignments(db);
    const assignments = db.collection("plugin_plan_package_assignments");
    assert.deepEqual(
      (await assignments.find({ pluginId: "connected-devices" }).sort({ planId: 1 }).toArray()).map(row => row.planId),
      ["enterprise", "pro", "starter"]
    );
    for (const assignment of await assignments.find({ pluginId: "connected-devices" }).toArray()) {
      assert.equal(assignment.source, "legacy-bundled-migration");
    }
    const ledgerCount = await db.collection("plugin_plan_package_assignment_migrations").countDocuments({});
    assert.equal(ledgerCount, 3);

    await migrateLegacyConnectedDevicesPlanAssignments(db);
    assert.equal(await assignments.countDocuments({ pluginId: "connected-devices" }), 3);
    assert.equal(await db.collection("plugin_plan_package_assignment_migrations").countDocuments({}), ledgerCount);

    const starterCatalog = await getTenantPluginCatalog(db, "starter-tenant");
    assert.ok(starterCatalog.some(item => item.id === "connected-devices"), "Starter retains Connected Devices access");
    const customCatalog = await getTenantPluginCatalog(db, "custom-tenant");
    assert.equal(customCatalog.some(item => item.id === "connected-devices"), false, "a plan without assignment gains no access");

    // This is the same durable marker written by the Platform Admin PUT route
    // before it deletes an assignment omitted from planIds.
    await recordLegacyConnectedDevicesPlanRemovals(db, ["pro", "enterprise"], "admin-test");
    await assignments.deleteOne({ planId: "starter", pluginId: "connected-devices" });
    await migrateLegacyConnectedDevicesPlanAssignments(db);
    assert.equal(await assignments.findOne({ planId: "starter", pluginId: "connected-devices" }), null,
      "an explicit admin removal must never be restored by startup");
    assert.equal(await assignments.countDocuments({ pluginId: "connected-devices" }), 2);

    assert.deepEqual(await db.collection("tenant_plugin_installations").findOne({ id: "existing-install" }), {
      _id: (await db.collection("tenant_plugin_installations").findOne({ id: "existing-install" }))!._id,
      id: "existing-install", tenantId: "starter-tenant", pluginId: "files", version: "1.0.0",
      status: "installed", installedAt: now, updatedAt: now
    });
    assert.ok(await db.collection("connected_devices").findOne({ id: "existing-device", tenantId: "starter-tenant" }),
      "existing device data remains untouched");
  } finally {
    await client.close();
  }
});
