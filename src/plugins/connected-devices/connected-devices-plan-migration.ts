import type { Db, Document } from "mongodb";

const PLANS = ["starter", "pro", "enterprise"] as const;
const PLUGIN_ID = "connected-devices";
const MIGRATION_ID = "connected-devices-legacy-plan-inclusion-v1";

type Ledger = Document & {
  _id: string;
  planId: string;
  pluginId: string;
  state: "assigned" | "already-assigned" | "admin-removed";
  createdAt: Date;
};

/**
 * Restore the legacy bundled plan inclusion exactly once, after the signed ZIP
 * is installed and loaded. The ledger is deliberately permanent: an admin
 * removal must never be silently undone by a later startup.
 */
export async function migrateLegacyConnectedDevicesPlanAssignments(db: Db): Promise<void> {
  const packageRecord = await db.collection("platform_plugin_packages").findOne({
    pluginId: PLUGIN_ID,
    status: "installed",
    source: "zip",
    runtimeState: "loaded"
  });
  if (!packageRecord) return;

  const assignments = db.collection("plugin_plan_package_assignments");
  const ledger = db.collection<Ledger>("plugin_plan_package_assignment_migrations");

  for (const planId of PLANS) {
    const key = planId + ":" + PLUGIN_ID + ":" + MIGRATION_ID;
    const existingLedger = await ledger.findOne({ _id: key });
    if (existingLedger) continue;
    const adminDecision = await ledger.findOne({ _id: planId + ":" + PLUGIN_ID + ":admin-plan-selection-v1" });
    if (adminDecision?.state === "admin-removed") continue;

    const existingAssignment = await assignments.findOne({ planId, pluginId: PLUGIN_ID });
    if (existingAssignment) {
      await ledger.updateOne(
        { _id: key },
        { $setOnInsert: { _id: key, planId, pluginId: PLUGIN_ID, state: "already-assigned", createdAt: new Date() } },
        { upsert: true }
      );
      continue;
    }

    try {
      await assignments.updateOne(
        { planId, pluginId: PLUGIN_ID },
        { $setOnInsert: { planId, pluginId: PLUGIN_ID, source: "legacy-bundled-migration", createdAt: new Date(), createdBy: "system:legacy-bundled-migration" } },
        { upsert: true }
      );
      await ledger.updateOne(
        { _id: key },
        { $setOnInsert: { _id: key, planId, pluginId: PLUGIN_ID, state: "assigned", createdAt: new Date() } },
        { upsert: true }
      );
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      // A concurrent administrator/migration won the unique-key race. Record
      // the outcome only if another ledger writer has not already done so.
      const current = await ledger.findOne({ _id: key });
      if (!current) throw error;
    }
  }
}
