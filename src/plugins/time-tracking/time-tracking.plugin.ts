import type { BeePlugin } from "../../core/types.js";
import { TimeTrackingRepository } from "./time-tracking.repository.js";
import { registerTimeTrackingRoutes } from "./time-tracking.controller.js";

const timeTrackingIndexes = [
  { key: { tenantId: 1, id: 1 }, options: { unique: true, name: "time_tracking_tenant_session_unique" } },
  { key: { tenantId: 1, userId: 1, startedAt: -1 }, options: { name: "time_tracking_user_history" } },
  { key: { tenantId: 1, userId: 1 }, options: { unique: true, partialFilterExpression: { active: true }, name: "time_tracking_one_active_session" } }
] as const;

export const timeTrackingPlugin: BeePlugin = {
  manifest: { requiredServices: ["mongoDbName","sessionIdSecret"], optionalServices: [],
    name: "time-tracking",
    version: "0.2.2",
    description: "Employee time clock, breaks and work-session history",
    dependencies: ["auth", "organizations"],
    scope: "tenant",
    activationPolicy: "automatic",
    frontend: { routes: [] }
  },
  tenantMigrations: [{
    id: "001_create_time_tracking_indexes",
    checksum: "cab33997679133194d812b3f7ef827097ca45a925dcfcc55083a58bc90321b37",
    phase: "install",
    async up(db) {
      for (const index of timeTrackingIndexes) {
        await db.collection("tenant_time_tracking_sessions").createIndex(index.key as Record<string, number>, index.options);
      }
    },
    async down(db) {
      for (const index of timeTrackingIndexes) {
        try {
          await db.collection("tenant_time_tracking_sessions").dropIndex(index.options.name);
        } catch (error) {
          if (![26, 27].includes((error as { code?: number }).code ?? 0)) throw error;
        }
      }
    }
  }],
  async initialize(ctx) {
    const db = ctx.mongoClient.db(String(ctx.config.mongoDbName ?? "bee_core"));
    const repository = new TimeTrackingRepository(db);
    await repository.initializeIndexes();
    await registerTimeTrackingRoutes(ctx, repository);
    ctx.logger.info("Time Tracking initialized: clock, weekly schedules and correction review.");
  }
};
