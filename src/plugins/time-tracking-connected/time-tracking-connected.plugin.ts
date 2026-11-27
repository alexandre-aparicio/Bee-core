import type { BeePlugin } from "../../core/types.js";
import type { PluginAccessService } from "../../core/plugin-services.js";
import type { ConnectedDeviceCapabilities } from "../connected-devices/capability-registry.js";
import type { TimeTrackingDeviceApi } from "../time-tracking/time-tracking-device.contract.js";

type DeviceAuthenticator = {
  authenticateDevice(request: any, reply: any): Promise<any>;
  hasCapability(tenantId: string, deviceId: string, capability: string): Promise<boolean>;
};

/**
 * Reference adapter between Connected Devices and the independent Time Tracking
 * business plugin. It contributes device scopes but never changes pairing or
 * device identity ownership.
 */
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
    const access = ctx.services?.get<PluginAccessService>("core.plugin-access");
    const registry = ctx.services?.get<ConnectedDeviceCapabilities>("connected-devices.capabilities");
    const deviceAuth = ctx.services?.get<DeviceAuthenticator>("connected-devices.device-auth");
    const timeTracking = ctx.services?.get<TimeTrackingDeviceApi>("time-tracking.device-api");
    if (!access || !registry || !deviceAuth || !timeTracking) {
      throw new Error("Time Tracking Connected requires the Connected Devices capability and device-auth contracts.");
    }

    registry.register("time-tracking-connected", [
      {
        id: "time-tracking.clock-in",
        label: "Registrar entrada",
        description: "Permite iniciar la jornada del usuario propietario del dispositivo.",
        group: "Control Horario",
        order: 10,
        operations: ["clock-in"],
        requiresPlugins: ["connected-devices", "time-tracking"]
      },
      {
        id: "time-tracking.clock-out",
        label: "Registrar salida",
        description: "Permite finalizar la jornada activa del usuario propietario del dispositivo.",
        group: "Control Horario",
        order: 20,
        operations: ["clock-out"],
        requiresPlugins: ["connected-devices", "time-tracking"]
      },
      {
        id: "time-tracking.records.read",
        label: "Consultar registros",
        description: "Permite consultar el estado y el historial propio de jornada.",
        group: "Control Horario",
        order: 30,
        operations: ["status", "sessions"],
        requiresPlugins: ["connected-devices", "time-tracking"]
      }
    ]);

    const authorize = async (request: any, reply: any, capability: string) => {
      const device = await deviceAuth.authenticateDevice(request, reply);
      if (!device) return null;
      const [extensionAvailable, granted] = await Promise.all([
        access.isPluginAvailable(device.tenantId, "time-tracking-connected"),
        deviceAuth.hasCapability(device.tenantId, device.id, capability)
      ]);
      if (!extensionAvailable || !granted) {
        reply.code(403).send({ error: "This device is not authorized for the requested Control Horario action." });
        return null;
      }
      // Control Horario owns effective role, custom-role and restriction checks.
      // The business service repeats these checks immediately before executing.
      return device;
    };
    const operationInput = (request: any, device: any) => ({
      tenantId: device.tenantId,
      userId: device.ownerUserId,
      operationId: String(request.body?.operationId ?? ""),
      limit: request.query?.limit === undefined ? undefined : Number(request.query.limit)
    });
    const sendResult = (reply: any, result: { statusCode: number; body: unknown }) => reply.code(result.statusCode).send(result.body);

    ctx.server.post("/time-tracking-connected/device/clock-in", async (request: any, reply: any) => {
      const device = await authorize(request, reply, "time-tracking.clock-in");
      if (!device) return;
      return sendResult(reply, await timeTracking.clockIn(operationInput(request, device)));
    });
    ctx.server.post("/time-tracking-connected/device/clock-out", async (request: any, reply: any) => {
      const device = await authorize(request, reply, "time-tracking.clock-out");
      if (!device) return;
      return sendResult(reply, await timeTracking.clockOut(operationInput(request, device)));
    });
    ctx.server.get("/time-tracking-connected/device/status", async (request: any, reply: any) => {
      const device = await authorize(request, reply, "time-tracking.records.read");
      if (!device) return;
      return sendResult(reply, await timeTracking.status(operationInput(request, device)));
    });
    ctx.server.get("/time-tracking-connected/device/sessions", async (request: any, reply: any) => {
      const device = await authorize(request, reply, "time-tracking.records.read");
      if (!device) return;
      return sendResult(reply, await timeTracking.sessions(operationInput(request, device)));
    });

    ctx.logger.info("Time Tracking Connected initialized: three extension capabilities registered.");
  }
};
