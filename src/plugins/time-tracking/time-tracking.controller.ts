import { requireAuth, requireTenantPermissions } from "../auth/auth.guard.js";
import { requireInstalledPlugin } from "../../core/plugin-entitlements.js";
import type { TimeTrackingRepository } from "./time-tracking.repository.js";
import { createTimeTrackingHandlers } from "./time-tracking.handlers.js";

/** Thin controller: creates handlers and mounts the plugin routes on Fastify. */
export async function registerTimeTrackingRoutes(ctx: any, repository: TimeTrackingRepository): Promise<void> {
  const secret = String(ctx.config.sessionIdSecret ?? ctx.config.jwtSecret ?? "");
  const read = [requireAuth(repository.db, "dashboard", secret), requireTenantPermissions("time-tracking.read"), requireInstalledPlugin(repository.db, "time-tracking")];
  const clock = [requireAuth(repository.db, "dashboard", secret), requireTenantPermissions("time-tracking.read", "time-tracking.clock"), requireInstalledPlugin(repository.db, "time-tracking")];
  const manage = [requireAuth(repository.db, "dashboard", secret), requireTenantPermissions("time-tracking.manage"), requireInstalledPlugin(repository.db, "time-tracking")];
  const handlers = createTimeTrackingHandlers(repository, secret);

  ctx.server.get("/time-tracking/me/status", { preHandler: read }, handlers.status);
  ctx.server.get("/time-tracking/me/sessions", { preHandler: read }, handlers.sessions);
  ctx.server.post("/time-tracking/clock-in", { preHandler: clock }, handlers.clockIn);
  ctx.server.post("/time-tracking/break-start", { preHandler: clock }, handlers.breakStart);
  ctx.server.post("/time-tracking/break-end", { preHandler: clock }, handlers.breakEnd);
  ctx.server.post("/time-tracking/clock-out", { preHandler: clock }, handlers.clockOut);

  ctx.server.get("/time-tracking/me/schedule", { preHandler: read }, handlers.mySchedule);
  ctx.server.get("/time-tracking/team/members", { preHandler: manage }, handlers.teamMembers);
  ctx.server.get("/time-tracking/team/schedules", { preHandler: manage }, handlers.teamSchedules);
  ctx.server.put("/time-tracking/team/schedules/:userId", { preHandler: manage }, handlers.saveTeamSchedule);
  ctx.server.delete("/time-tracking/team/schedules/:userId", { preHandler: manage }, handlers.deleteTeamSchedule);

  ctx.server.post("/time-tracking/me/corrections", { preHandler: clock }, handlers.requestCorrection);
  ctx.server.get("/time-tracking/me/corrections", { preHandler: read }, handlers.myCorrections);
  ctx.server.get("/time-tracking/team/corrections", { preHandler: manage }, handlers.teamCorrections);
  ctx.server.patch("/time-tracking/team/corrections/:correctionId", { preHandler: manage }, handlers.reviewCorrection);
}
