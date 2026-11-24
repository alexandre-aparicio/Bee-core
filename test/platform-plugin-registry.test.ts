import { test } from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import {
  ensurePlatformPluginRegistry,
  listPlatformPluginPackages,
  migrateLegacyPlatformPackageInstalls,
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
