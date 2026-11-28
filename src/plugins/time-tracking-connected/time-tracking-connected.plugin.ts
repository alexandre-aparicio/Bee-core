import type { BeePlugin } from "../../core/types.js";
import type { Db } from "mongodb";
import type { PluginAccessService } from "../../core/plugin-services.js";
import { TimeTrackingRepository } from "../time-tracking/time-tracking.repository.js";
import { createTimeTrackingHandlers } from "../time-tracking/time-tracking.handlers.js";
import { hashDeviceSecret, hasConnectedDeviceCapability, isConnectedDeviceOwnerActive } from "../connected-devices/connected-devices.service.js";
import type { ConnectedDeviceRecord } from "../connected-devices/connected-devices.repository.js";

export const timeTrackingConnectedPlugin: BeePlugin = {
  manifest: {
    name: "time-tracking-connected",
    version: "0.1.2",
    description: "Connected-device actions for Control Horario",
    dependencies: ["connected-devices", "time-tracking"],
    requiredServices: ["mongoDbName", "sessionIdSecret"],
    optionalServices: [],
    scope: "tenant",
    activationPolicy: "manual"
  },

  async initialize(ctx) {
    const db: Db = ctx.mongoClient.db(String(ctx.config.mongoDbName ?? "bee_core"));
    const secret = String(ctx.config.sessionIdSecret ?? "");
    const access = ctx.services?.get<PluginAccessService>("core.plugin-access");
    if (!access || secret.length < 32) {
      throw new Error("Time Tracking Connected requires Core plugin access and the session secret.");
    }

    const repository = new TimeTrackingRepository(db);
    await repository.initializeIndexes();
    const handlers = createTimeTrackingHandlers(repository, secret);

    const authenticate = async (request: any, reply: any): Promise<ConnectedDeviceRecord | null> => {
      const header = String(request.headers.authorization ?? "");
      const credential = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
      if (credential.length < 40 || credential.length > 256) {
        reply.code(401).send({ error: "A valid connected-device credential is required." });
        return null;
      }
      const device = await db.collection<ConnectedDeviceRecord>("connected_devices")
        .findOne({ credentialHash: hashDeviceSecret(credential), status: "active" });
      if (!device || !await isConnectedDeviceOwnerActive(access, device) ||
          !await access.isPluginAvailable(device.tenantId, "connected-devices") ||
          !await access.isPluginAvailable(device.tenantId, "time-tracking") ||
          !await access.isPluginAvailable(device.tenantId, "time-tracking-connected")) {
        reply.code(401).send({ error: "The device is invalid, revoked or its required modules are unavailable." });
        return null;
      }
      return device;
    };

    const authorize = async (request: any, reply: any, capability: string, operation: "read" | "clock") => {
      const device = await authenticate(request, reply);
      if (!device) return null;
      if (!await hasConnectedDeviceCapability(db, access, device.tenantId, device.id, capability)) {
        reply.code(403).send({ error: "This device is not authorized for the requested Control Horario action." });
        return null;
      }
      if (!await access.isTenantUserActive(device.tenantId, device.ownerUserId)) {
        reply.code(403).send({ error: "The linked company membership is no longer active." });
        return null;
      }
      // The current main-branch host contract exposes active membership but not
      // effective user permissions to plugins. Fail closed for custom/guest roles.
      const membership = await db.collection<{ role?: string; status?: string }>("memberships")
        .findOne({ tenantId: device.tenantId, userId: device.ownerUserId, status: "active" });
      const role = String(membership?.role ?? "");
      const allowedRoles = operation === "read"
        ? ["owner", "admin", "manager", "member"]
        : ["owner", "admin", "manager", "member"];
      if (!membership || !allowedRoles.includes(role)) {
        reply.code(403).send({ error: "The linked user does not have the required Control Horario role." });
        return null;
      }
      return device;
    };

    const input = (request: any, device: ConnectedDeviceRecord) => ({
      tenantId: device.tenantId,
      userId: device.ownerUserId,
      operationId: String(request.body?.operationId ?? ""),
      limit: request.query?.limit === undefined ? undefined : Number(request.query.limit)
    });
    const invoke = async (handler: (request: any, reply: any) => Promise<unknown> | unknown,
      request: any, reply: any, device: ConnectedDeviceRecord) => {
      let statusCode = 200, sent = false, body: unknown;
      const internalReply = {
        code(code: number) { statusCode = code; return this; },
        send(value: unknown) { sent = true; body = value; return value; }
      };
      const internalRequest = {
        body: { ...input(request, device), source: "android" },
        query: { limit: request.query?.limit },
        tenantContext: {
          tenantId: device.tenantId,
          userId: device.ownerUserId,
          sessionId: "",
          sessionExpiresAt: new Date(Date.now() + 60_000),
          permissions: []
        }
      };
      const result = await handler(internalRequest, internalReply);
      return reply.code(statusCode).send(sent ? body : result);
    };

    ctx.server.post("/time-tracking-connected/device/clock-in", async (request: any, reply: any) => {
      const device = await authorize(request, reply, "time-tracking.clock-in", "clock");
      if (!device) return;
      return invoke(handlers.clockIn, request, reply, device);
    });
    ctx.server.post("/time-tracking-connected/device/clock-out", async (request: any, reply: any) => {
      const device = await authorize(request, reply, "time-tracking.clock-out", "clock");
      if (!device) return;
      return invoke(handlers.clockOut, request, reply, device);
    });
    ctx.server.get("/time-tracking-connected/device/status", async (request: any, reply: any) => {
      const device = await authorize(request, reply, "time-tracking.records.read", "read");
      if (!device) return;
      return invoke(handlers.status, request, reply, device);
    });
    ctx.server.get("/time-tracking-connected/device/sessions", async (request: any, reply: any) => {
      const device = await authorize(request, reply, "time-tracking.records.read", "read");
      if (!device) return;
      return invoke(handlers.sessions, request, reply, device);
    });

    ctx.logger.info("Time Tracking Connected initialized: device endpoints registered.");
  }
};
