import { test } from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { BUILT_IN_PLANS, RETIRED_PACKAGE_POLICIES, TRUSTED_PLUGIN_PACKAGES } from "../src/plugins/plugin-manifest-registry.js";
import {
  ensurePlatformPluginRegistry,
  listPlatformPluginPackages,
  migrateLegacyPlatformPackageInstalls,
  retireBundledPlatformPackage,
  seedBundledPlatformPackages,
  setPlatformPackageAvailable,
  setPlatformPackageInstalled
} from "../src/core/platform-plugin-registry.js";

const mongoUri = process.env.MONGODB_TEST_URI;

test("platform package registry separates global package state from tenant installations", { skip: !mongoUri }, async () => {
  const client = new MongoClient(mongoUri!);
  await client.connect();
  const db = client.db("bee_platform_packages_" + Date.now());
  try {
    await ensurePlatformPluginRegistry(db);
    await seedBundledPlatformPackages(db, [{
      id: "documents",
      name: "Documents",
      version: "1.0.0",
      description: "Document library",
      category: "platform",
      dependencies: ["files"]
    }]);
    await db.collection("tenant_plugin_installations").insertOne({
      tenantId: "super-org",
      pluginId: "documents",
      version: "1.0.0",
      status: "installed"
    });

    assert.equal(await migrateLegacyPlatformPackageInstalls(db, "super-org"), 1);
    assert.equal(await migrateLegacyPlatformPackageInstalls(db, "super-org"), 0, "legacy migration is idempotent");
    const [pkg] = await listPlatformPluginPackages(db);
    assert.equal(pkg?.pluginId, "documents");
    assert.equal(pkg?.status, "installed");
    assert.equal(pkg?.source, "bundled");

    await setPlatformPackageAvailable(db, "documents");
    const available = await db.collection("platform_plugin_packages").findOne({ pluginId: "documents" });
    assert.equal(available?.status, "available");

    await setPlatformPackageInstalled(db, "documents", "1.1.0", "super-admin");
    const installed = await db.collection("platform_plugin_packages").findOne({ pluginId: "documents" });
    assert.equal(installed?.status, "installed");
    assert.equal(installed?.version, "1.1.0");
    assert.equal(installed?.installedBy, "super-admin");
  } finally {
    await db.dropDatabase();
    await client.close();
  }
});

test("bundled synchronization never overwrites a ZIP package record", { skip: !mongoUri }, async () => {
  const client = new MongoClient(mongoUri!);
  await client.connect();
  const db = client.db("bee_platform_package_zip_" + Date.now());
  try {
    await ensurePlatformPluginRegistry(db);
    await db.collection("platform_plugin_packages").insertOne({
      pluginId: "external.crm",
      name: "External CRM",
      version: "2.0.0",
      description: "Uploaded CRM",
      category: "crm",
      dependencies: [],
      status: "installed",
      source: "zip",
      installedAt: new Date(),
      installedBy: "super-admin",
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await seedBundledPlatformPackages(db, [{
      id: "external.crm",
      name: "Bundled fallback",
      version: "0.1.0",
      description: "Should not replace uploaded metadata",
      category: "platform",
      dependencies: []
    }]);
    await setPlatformPackageAvailable(db, "external.crm");
    await setPlatformPackageInstalled(db, "external.crm", "0.1.0", "worker");

    const pkg = await db.collection("platform_plugin_packages").findOne({ pluginId: "external.crm" });
    assert.equal(pkg?.name, "External CRM");
    assert.equal(pkg?.version, "2.0.0");
    assert.equal(pkg?.status, "installed");
    assert.equal(pkg?.source, "zip");
  } finally {
    await db.dropDatabase();
    await client.close();
  }
});


test("retired bundled packages stay hidden and are not re-migrated while tenant history is preserved", { skip: !mongoUri }, async () => {
  const client = new MongoClient(mongoUri!);
  await client.connect();
  const db = client.db("bee_retired_bundled_package_" + Date.now());
  try {
    await ensurePlatformPluginRegistry(db);
    await db.collection("tenant_plugin_installations").insertOne({
      tenantId: "super-org",
      pluginId: "time-tracking",
      version: "0.2.0",
      status: "installed"
    });
    await db.collection("plugin_catalog").insertOne({
      id: "time-tracking",
      name: "Control Horario",
      version: "0.2.0",
      status: "published",
      codeAvailable: true
    });

    assert.equal(await migrateLegacyPlatformPackageInstalls(db, "super-org"), 1);
    await retireBundledPlatformPackage(db, "time-tracking");

    const legacyPackage = await db.collection("platform_plugin_packages").findOne({ pluginId: "time-tracking" });
    assert.equal(legacyPackage?.status, "deprecated");
    assert.equal(legacyPackage?.source, "bundled");
    assert.equal(await migrateLegacyPlatformPackageInstalls(db, "super-org"), 0, "retired legacy records must not be revived on restart");
    assert.equal((await listPlatformPluginPackages(db)).some(item => item.pluginId === "time-tracking"), false);
    const catalogEntry = await db.collection("plugin_catalog").findOne({ id: "time-tracking" });
    assert.equal(catalogEntry?.status, "deprecated");
    assert.equal(catalogEntry?.codeAvailable, false);
    assert.equal(await db.collection("tenant_plugin_installations").countDocuments({ tenantId: "super-org", pluginId: "time-tracking" }), 1, "tenant history must not be deleted");
  } finally {
    await db.dropDatabase();
    await client.close();
  }
});

test("retiring a bundled package never hides a package already replaced by a signed ZIP", { skip: !mongoUri }, async () => {
  const client = new MongoClient(mongoUri!);
  await client.connect();
  const db = client.db("bee_retire_zip_package_" + Date.now());
  try {
    await ensurePlatformPluginRegistry(db);
    await db.collection("platform_plugin_packages").insertOne({
      pluginId: "time-tracking",
      name: "Control Horario",
      version: "0.2.0",
      description: "Signed package",
      category: "productivity",
      dependencies: ["auth", "organizations"],
      status: "installed",
      source: "zip",
      runtimeState: "loaded",
      installedAt: new Date(),
      installedBy: "super-admin",
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await db.collection("plugin_catalog").insertOne({
      id: "time-tracking",
      name: "Control Horario",
      status: "published",
      codeAvailable: true
    });

    await retireBundledPlatformPackage(db, "time-tracking");
    const packageRecord = await db.collection("platform_plugin_packages").findOne({ pluginId: "time-tracking" });
    assert.equal(packageRecord?.source, "zip");
    assert.equal(packageRecord?.status, "installed");
    assert.equal(packageRecord?.runtimeState, "loaded");
    const catalogEntry = await db.collection("plugin_catalog").findOne({ id: "time-tracking" });
    assert.equal(catalogEntry?.status, "published");
    assert.equal(catalogEntry?.codeAvailable, true);
  } finally {
    await db.dropDatabase();
    await client.close();
  }
});


test("permanent retirement hides a replaced package while preserving tenant data and installation history", { skip: !mongoUri }, async () => {
  const client = new MongoClient(mongoUri!);
  await client.connect();
  const db = client.db("bee_retired_workspace_module_" + Date.now());
  try {
    await ensurePlatformPluginRegistry(db);
    await db.collection("platform_plugin_packages").insertOne({
      pluginId: "notes",
      name: "Team Notes",
      version: "0.1.0",
      description: "Previously uploaded package",
      category: "productivity",
      dependencies: [],
      status: "installed",
      source: "zip",
      runtimeState: "loaded",
      installedAt: new Date(),
      installedBy: "super-admin",
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await db.collection("plugin_catalog").insertOne({
      id: "notes",
      name: "Team Notes",
      status: "published",
      codeAvailable: true
    });
    await db.collection("tenant_plugin_installations").insertOne({
      tenantId: "tenant-legacy",
      pluginId: "notes",
      version: "0.1.0",
      status: "installed"
    });
    await db.collection("tenant_notes").insertOne({
      tenantId: "tenant-legacy",
      id: "legacy-row",
      title: "Keep this data",
      content: "Retirement must not delete tenant content"
    });

    await retireBundledPlatformPackage(db, "notes", true);

    const packageRecord = await db.collection("platform_plugin_packages").findOne({ pluginId: "notes" });
    assert.equal(packageRecord?.status, "deprecated");
    assert.equal(packageRecord?.source, "zip");
    assert.equal(packageRecord?.runtimeState, "loaded");
    const catalogEntry = await db.collection("plugin_catalog").findOne({ id: "notes" });
    assert.equal(catalogEntry?.status, "deprecated");
    assert.equal(catalogEntry?.codeAvailable, false);
    assert.equal(await db.collection("tenant_plugin_installations").countDocuments({ tenantId: "tenant-legacy", pluginId: "notes" }), 1);
    assert.deepEqual(await db.collection("tenant_notes").findOne({ tenantId: "tenant-legacy", id: "legacy-row" }), {
      _id: (await db.collection("tenant_notes").findOne({ tenantId: "tenant-legacy", id: "legacy-row" }))!._id,
      tenantId: "tenant-legacy",
      id: "legacy-row",
      title: "Keep this data",
      content: "Retirement must not delete tenant content"
    });
    assert.equal(await migrateLegacyPlatformPackageInstalls(db, "tenant-legacy"), 0, "retired records must not be migrated back into the platform catalogue");
    assert.equal((await listPlatformPluginPackages(db)).some(item => item.pluginId === "notes"), false);
  } finally {
    await db.dropDatabase();
    await client.close();
  }
});


test("Connected Devices retires only the bundled fallback and preserves ZIP, tenant installs and device data", { skip: !mongoUri }, async () => {
  const client = new MongoClient(mongoUri!);
  await client.connect();
  const db = client.db("bee_connected_devices_zip_only_" + Date.now());
  const now = new Date();
  try {
    await ensurePlatformPluginRegistry(db);
    await db.collection("tenant_plugin_installations").insertOne({
      tenantId: "super-org",
      pluginId: "connected-devices",
      version: "0.1.0",
      status: "installed"
    });
    await db.collection("plugin_catalog").insertOne({
      id: "connected-devices",
      name: "Connected Devices",
      version: "0.1.0",
      status: "published",
      codeAvailable: true
    });
    await db.collection("connected_devices").insertOne({
      id: "legacy-device",
      tenantId: "tenant-legacy",
      name: "Keep scanner",
      status: "active",
      credentialHash: "a".repeat(64)
    });
    await db.collection("connected_device_pairing_challenges").insertOne({
      id: "legacy-challenge",
      tenantId: "tenant-legacy",
      status: "issued",
      tokenHash: "b".repeat(64),
      expiresAt: new Date(now.getTime() + 60_000)
    });

    assert.equal(await migrateLegacyPlatformPackageInstalls(db, "super-org"), 1);
    await retireBundledPlatformPackage(db, "connected-devices", false);

    const bundled = await db.collection("platform_plugin_packages").findOne({ pluginId: "connected-devices" });
    assert.equal(bundled?.source, "bundled");
    assert.equal(bundled?.status, "deprecated");
    assert.equal(await migrateLegacyPlatformPackageInstalls(db, "super-org"), 0, "retired fallback must not be recreated at startup");
    assert.equal((await listPlatformPluginPackages(db)).some(item => item.pluginId === "connected-devices"), false);
    const catalog = await db.collection("plugin_catalog").findOne({ id: "connected-devices" });
    assert.equal(catalog?.status, "deprecated");
    assert.equal(catalog?.codeAvailable, false);

    assert.equal(await db.collection("tenant_plugin_installations").countDocuments({ tenantId: "super-org", pluginId: "connected-devices" }), 1);
    assert.ok(await db.collection("connected_devices").findOne({ tenantId: "tenant-legacy", id: "legacy-device" }));
    assert.ok(await db.collection("connected_device_pairing_challenges").findOne({ tenantId: "tenant-legacy", id: "legacy-challenge" }));

    await db.collection("platform_plugin_packages").updateOne(
      { pluginId: "connected-devices" },
      { $set: { source: "zip", status: "installed", runtimeState: "loaded", version: "0.1.0", updatedAt: new Date() } }
    );
    await db.collection("plugin_catalog").updateOne(
      { id: "connected-devices" },
      { $set: { status: "published", codeAvailable: true, updatedAt: new Date() } }
    );
    await retireBundledPlatformPackage(db, "connected-devices", false);
    const signedZip = await db.collection("platform_plugin_packages").findOne({ pluginId: "connected-devices" });
    assert.equal(signedZip?.source, "zip");
    assert.equal(signedZip?.status, "installed");
    assert.equal(signedZip?.runtimeState, "loaded");
    const publishedCatalog = await db.collection("plugin_catalog").findOne({ id: "connected-devices" });
    assert.equal(publishedCatalog?.status, "published");
    assert.equal(publishedCatalog?.codeAvailable, true);
  } finally {
    await db.dropDatabase();
    await client.close();
  }
});


test("Connected Devices is not a trusted bundle or built-in plan entitlement", () => {
  assert.equal(TRUSTED_PLUGIN_PACKAGES.some(plugin => plugin.id === "connected-devices"), false);
  assert.equal(BUILT_IN_PLANS.some(plan => plan.visiblePluginIds.includes("connected-devices") || plan.includedPluginIds.includes("connected-devices")), false);
  assert.equal(RETIRED_PACKAGE_POLICIES.some(policy => policy.id === "connected-devices"), false, "legacy feature packages are retired by generic ownership discovery, not a Connected Devices Core exception");
});
