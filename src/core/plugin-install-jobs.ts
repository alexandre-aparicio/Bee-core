import { randomUUID } from "node:crypto";
import type { Collection, Document } from "mongodb";

export type PluginInstallJob = Document & {
  id: string;
  tenantId: string;
  pluginId: string;
  actorId: string;
  action: "install" | "uninstall";
  status: "queued" | "running" | "succeeded" | "failed";
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  updatedAt: Date;
  nextRunAt: Date;
  leaseUntil?: Date;
  workerId?: string;
  startedAt?: Date;
  finishedAt?: Date;
  result?: { version: string };
  error?: string;
  activeKey?: string;
};

export async function ensurePluginInstallJobIndexes(collection: Collection<PluginInstallJob>): Promise<void> {
  await collection.createIndex({ id: 1 }, { unique: true, name: "plugin_install_job_id_unique" });
  await collection.createIndex({ tenantId: 1, createdAt: -1 }, { name: "plugin_install_job_tenant_created" });
  await collection.createIndex({ status: 1, nextRunAt: 1, leaseUntil: 1, createdAt: 1 }, { name: "plugin_install_job_claim" });
  await collection.createIndex({ activeKey: 1 }, {
    unique: true,
    name: "plugin_install_job_active_unique",
    partialFilterExpression: { activeKey: { $type: "string" } }
  });
}

export async function enqueuePluginLifecycleJob(
  collection: Collection<PluginInstallJob>,
  input: { tenantId: string; pluginId: string; actorId: string; action: "install" | "uninstall" }
): Promise<{ job: PluginInstallJob; created: boolean }> {
  const activeKey = input.tenantId + ":" + input.pluginId;
  const existing = await collection.findOne({ activeKey });
  if (existing) return { job: existing, created: false };
  const now = new Date();
  const job: PluginInstallJob = {
    id: randomUUID(),
    ...input,
    status: "queued",
    attempts: 0,
    maxAttempts: 3,
    createdAt: now,
    updatedAt: now,
    nextRunAt: now,
    activeKey
  };
  try {
    await collection.insertOne(job);
    return { job, created: true };
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    const concurrent = await collection.findOne({ activeKey });
    if (!concurrent) throw error;
    return { job: concurrent, created: false };
  }
}

export async function enqueuePluginInstallJob(
  collection: Collection<PluginInstallJob>,
  input: { tenantId: string; pluginId: string; actorId: string }
): Promise<{ job: PluginInstallJob; created: boolean }> {
  return enqueuePluginLifecycleJob(collection, { ...input, action: "install" });
}

export async function enqueuePluginUninstallJob(
  collection: Collection<PluginInstallJob>,
  input: { tenantId: string; pluginId: string; actorId: string }
): Promise<{ job: PluginInstallJob; created: boolean }> {
  return enqueuePluginLifecycleJob(collection, { ...input, action: "uninstall" });
}

export async function claimPluginInstallJob(
  collection: Collection<PluginInstallJob>,
  workerId: string,
  now = new Date(),
  leaseMs = 60_000
): Promise<PluginInstallJob | null> {
  return collection.findOneAndUpdate(
    {
      $or: [
        { status: "queued", nextRunAt: { $lte: now } },
        { status: "running", leaseUntil: { $lte: now } }
      ]
    },
    {
      $set: { status: "running", workerId, leaseUntil: new Date(now.getTime() + leaseMs), startedAt: now, updatedAt: now },
      $inc: { attempts: 1 }
    },
    { sort: { createdAt: 1 }, returnDocument: "after" }
  );
}

export async function renewPluginInstallJobLease(
  collection: Collection<PluginInstallJob>,
  job: PluginInstallJob,
  workerId: string,
  now = new Date(),
  leaseMs = 60_000
): Promise<boolean> {
  const result = await collection.updateOne(
    { id: job.id, status: "running", workerId, leaseUntil: { $gt: now } },
    { $set: { leaseUntil: new Date(now.getTime() + leaseMs), updatedAt: now } }
  );
  return result.modifiedCount === 1;
}

export async function completePluginInstallJob(
  collection: Collection<PluginInstallJob>,
  job: PluginInstallJob,
  workerId: string,
  version: string
): Promise<boolean> {
  const result = await collection.updateOne(
    { id: job.id, status: "running", workerId },
    {
      $set: { status: "succeeded", result: { version }, finishedAt: new Date(), updatedAt: new Date() },
      $unset: { activeKey: "", leaseUntil: "", workerId: "", error: "" }
    }
  );
  return result.modifiedCount === 1;
}

export async function failPluginInstallJob(
  collection: Collection<PluginInstallJob>,
  job: PluginInstallJob,
  workerId: string,
  error: unknown
): Promise<void> {
  const message = (error instanceof Error ? error.message : "Plugin installation failed").slice(0, 500);
  const terminal = job.attempts >= job.maxAttempts;
  const now = new Date();
  await collection.updateOne(
    { id: job.id, status: "running", workerId },
    terminal
      ? {
          $set: { status: "failed", error: message, finishedAt: now, updatedAt: now },
          $unset: { activeKey: "", leaseUntil: "", workerId: "" }
        }
      : {
          $set: { status: "queued", error: message, nextRunAt: new Date(now.getTime() + 2 ** job.attempts * 1000), updatedAt: now },
          $unset: { leaseUntil: "", workerId: "" }
        }
  );
}
