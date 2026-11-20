import { test } from "node:test";
import assert from "node:assert/strict";
import { MongoClient, type Collection } from "mongodb";
import {
  claimPluginInstallJob,
  completePluginInstallJob,
  enqueuePluginInstallJob,
  enqueuePluginUpdateJob,
  enqueuePluginUninstallJob,
  ensurePluginInstallJobIndexes,
  failPluginInstallJob,
  renewPluginInstallJobLease,
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

    const failureOne = await claimPluginInstallJob(collection, "worker-failure-1");
    assert.ok(failureOne);
    await failPluginInstallJob(collection, failureOne, "worker-failure-1", new Error("temporary migration failure"));
    let retryState = await collection.findOne({ id: nextInstall.job.id });
    assert.equal(retryState?.status, "queued");
    assert.match(String(retryState?.error), /temporary migration failure/);

    await collection.updateOne({ id: nextInstall.job.id }, { $set: { nextRunAt: new Date(Date.now() - 1) } });
    const failureTwo = await claimPluginInstallJob(collection, "worker-failure-2");
    assert.ok(failureTwo);
    await failPluginInstallJob(collection, failureTwo, "worker-failure-2", new Error("second failure"));
    await collection.updateOne({ id: nextInstall.job.id }, { $set: { nextRunAt: new Date(Date.now() - 1) } });
    const failureThree = await claimPluginInstallJob(collection, "worker-failure-3");
    assert.ok(failureThree);
    await failPluginInstallJob(collection, failureThree, "worker-failure-3", new Error("terminal failure"));
    retryState = await collection.findOne({ id: nextInstall.job.id });
    assert.equal(retryState?.status, "failed");
    assert.equal(retryState?.attempts, 3);
    assert.equal(retryState?.activeKey, undefined, "terminal failure must release the active job key");

    const update = await enqueuePluginUpdateJob(collection, { tenantId: "tenant-a", pluginId: "notes", actorId: "owner-a", previousVersion: "0.0.9" });
    assert.equal(update.created, true);
    assert.equal(update.job.action, "update");
    assert.equal(update.job.previousVersion, "0.0.9");
    const duplicateUpdate = await enqueuePluginUpdateJob(collection, { tenantId: "tenant-a", pluginId: "notes", actorId: "owner-a", previousVersion: "0.0.9" });
    assert.equal(duplicateUpdate.created, false);
    assert.equal(duplicateUpdate.job.id, update.job.id);
    const claimedUpdate = await claimPluginInstallJob(collection, "worker-update");
    assert.ok(claimedUpdate);
    assert.equal(claimedUpdate.action, "update");
    assert.equal(await completePluginInstallJob(collection, claimedUpdate, "worker-update", "0.1.0"), true);

    const uninstall = await enqueuePluginUninstallJob(collection, { tenantId: "tenant-a", pluginId: "notes", actorId: "owner-a" });
    assert.equal(uninstall.created, true);
    assert.equal(uninstall.job.action, "uninstall");
    const duplicateUninstall = await enqueuePluginUninstallJob(collection, { tenantId: "tenant-a", pluginId: "notes", actorId: "owner-a" });
    assert.equal(duplicateUninstall.created, false);
    assert.equal(duplicateUninstall.job.id, uninstall.job.id);
    const anotherTenantUninstall = await enqueuePluginUninstallJob(collection, { tenantId: "tenant-b", pluginId: "notes", actorId: "owner-b" });
    assert.equal(anotherTenantUninstall.created, true, "another company has an independent lifecycle queue key");
    assert.notEqual(anotherTenantUninstall.job.id, uninstall.job.id);
  } finally {
    await client.db(dbName).dropDatabase();
    await client.close();
  }
});


test("expired plugin lifecycle leases cannot be renewed or completed by stale workers", { skip: !uri }, async () => {
  const client = new MongoClient(uri!);
  await client.connect();
  const dbName = "bee_install_job_lease_test_" + Date.now();
  const collection: Collection<PluginInstallJob> = client.db(dbName).collection("plugin_install_jobs");
  try {
    await ensurePluginInstallJobIndexes(collection);
    const queued = await enqueuePluginInstallJob(collection, { tenantId: "tenant-a", pluginId: "notes", actorId: "owner-a" });
    const oldWorkerJob = await claimPluginInstallJob(collection, "worker-old", new Date(), 1_000);
    assert.ok(oldWorkerJob);
    await new Promise(resolve => setTimeout(resolve, 1_150));
    assert.equal(await renewPluginInstallJobLease(collection, oldWorkerJob, "worker-old"), false);
    assert.equal(await completePluginInstallJob(collection, oldWorkerJob, "worker-old", "0.1.0"), false);
    const current = await collection.findOne({ id: queued.job.id });
    assert.equal(current?.status, "running", "an expired worker must not finalize the durable job");
    assert.ok(current?.leaseUntil && current.leaseUntil <= new Date());
  } finally {
    await client.db(dbName).dropDatabase();
    await client.close();
  }
});

test("active lifecycle workers can extend their lease but cannot extend after another worker reclaims it", { skip: !uri }, async () => {
  const client = new MongoClient(uri!);
  await client.connect();
  const dbName = "bee_install_job_renew_test_" + Date.now();
  const collection: Collection<PluginInstallJob> = client.db(dbName).collection("plugin_install_jobs");
  try {
    await ensurePluginInstallJobIndexes(collection);
    await enqueuePluginInstallJob(collection, { tenantId: "tenant-a", pluginId: "notes", actorId: "owner-a" });
    const claimed = await claimPluginInstallJob(collection, "worker-a", new Date(), 5_000);
    assert.ok(claimed);
    assert.equal(await renewPluginInstallJobLease(collection, claimed, "worker-a", new Date(), 10_000), true);
    const renewed = await collection.findOne({ id: claimed.id });
    assert.ok(renewed?.leaseUntil && renewed.leaseUntil.getTime() > claimed.leaseUntil!.getTime());
    await collection.updateOne({ id: claimed.id }, { $set: { leaseUntil: new Date(Date.now() - 1) } });
    const reclaimed = await claimPluginInstallJob(collection, "worker-b");
    assert.ok(reclaimed);
    assert.equal(await renewPluginInstallJobLease(collection, claimed, "worker-a"), false);
    assert.equal(await completePluginInstallJob(collection, claimed, "worker-a", "0.1.0"), false);
    assert.equal(await completePluginInstallJob(collection, reclaimed, "worker-b", "0.1.0"), true);
  } finally {
    await client.db(dbName).dropDatabase();
    await client.close();
  }
});
