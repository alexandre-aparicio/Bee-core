import { test } from "node:test";
import assert from "node:assert/strict";
import { MongoClient, type Collection } from "mongodb";
import {
  claimPluginInstallJob,
  completePluginInstallJob,
  enqueuePluginInstallJob,
  ensurePluginInstallJobIndexes,
  type PluginInstallJob
} from "../src/core/plugin-install-jobs.js";

const uri = process.env.MONGODB_TEST_URI;

test("durable plugin install jobs deduplicate, recover expired leases and reject stale workers", { skip: !uri }, async () => {
  const client = new MongoClient(uri!);
  await client.connect();
  const dbName = "bee_install_jobs_test_" + Date.now();
  const collection: Collection<PluginInstallJob> = client.db(dbName).collection("plugin_install_jobs");
  try {
    await ensurePluginInstallJobIndexes(collection);
    const first = await enqueuePluginInstallJob(collection, { tenantId: "tenant-a", pluginId: "notes", actorId: "owner-a" });
    assert.equal(first.created, true);
    const duplicate = await enqueuePluginInstallJob(collection, { tenantId: "tenant-a", pluginId: "notes", actorId: "owner-a" });
    assert.equal(duplicate.created, false);
    assert.equal(duplicate.job.id, first.job.id);

    const claimedByOldWorker = await claimPluginInstallJob(collection, "worker-old");
    assert.ok(claimedByOldWorker);
    assert.equal(claimedByOldWorker.status, "running");
    assert.equal(claimedByOldWorker.attempts, 1);

    await collection.updateOne(
      { id: first.job.id },
      { $set: { leaseUntil: new Date(Date.now() - 1) } }
    );
    const recovered = await claimPluginInstallJob(collection, "worker-recovery");
    assert.ok(recovered);
    assert.equal(recovered.id, first.job.id);
    assert.equal(recovered.attempts, 2);
    assert.equal(await completePluginInstallJob(collection, claimedByOldWorker, "worker-old", "0.1.0"), false);
    assert.equal(await completePluginInstallJob(collection, recovered, "worker-recovery", "0.1.0"), true);

    const completed = await collection.findOne({ id: first.job.id });
    assert.equal(completed?.status, "succeeded");
    assert.equal(completed?.result?.version, "0.1.0");
    const nextInstall = await enqueuePluginInstallJob(collection, { tenantId: "tenant-a", pluginId: "notes", actorId: "owner-a" });
    assert.equal(nextInstall.created, true, "a completed job must release its active deduplication key");
    assert.notEqual(nextInstall.job.id, first.job.id);
  } finally {
    await client.db(dbName).dropDatabase();
    await client.close();
  }
});
