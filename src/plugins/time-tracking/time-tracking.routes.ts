import { requireAuth, requireTenantPermissions, type AuthenticatedRequest } from "../auth/auth.guard.js";
import type { PluginAccessService } from "../../core/plugin-services.js";
import type { TimeTrackingRepository } from "./time-tracking.repository.js";
import { createTimeTrackingHandlers } from "./time-tracking.handlers.js";

/** Plugin-owned HTTP boundary: applies Core identity, entitlement and permission checks before handlers. */
export async function registerTimeTrackingRoutes(ctx: any, repository: TimeTrackingRepository, access: PluginAccessService): Promise<void> {
  const secret = String(ctx.config.sessionIdSecret ?? ctx.config.jwtSecret ?? "");
  const requireAvailable = async (request: any, reply: any) => {
    const tenant = (request as AuthenticatedRequest).tenantContext;
    if (!tenant || !await access.isPluginAvailable(tenant.tenantId, "time-tracking")) {
      return reply.code(403).send({ error: "Control Horario is not entitled, installed or enabled for this company." });
    }
    if (!await access.isTenantUserActive(tenant.tenantId, tenant.userId)) {
      return reply.code(403).send({ error: "The current company membership is no longer active." });
    }
  };
  const read = [requireAuth(repository.db, "dashboard", secret), requireAvailable, requireTenantPermissions("time-tracking.read")];
  const clock = [requireAuth(repository.db, "dashboard", secret), requireAvailable, requireTenantPermissions("time-tracking.read", "time-tracking.clock")];
  const manage = [requireAuth(repository.db, "dashboard", secret), requireAvailable, requireTenantPermissions("time-tracking.manage")];
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
