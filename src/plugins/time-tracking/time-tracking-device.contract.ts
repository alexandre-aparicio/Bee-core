export type TimeTrackingDeviceInput = {
  tenantId: string;
  userId: string;
  operationId?: string;
  limit?: number;
};

export type TimeTrackingDeviceResult = {
  statusCode: number;
  body: unknown;
};

export interface TimeTrackingDeviceApi {
  clockIn(input: TimeTrackingDeviceInput): Promise<TimeTrackingDeviceResult>;
  clockOut(input: TimeTrackingDeviceInput): Promise<TimeTrackingDeviceResult>;
  status(input: TimeTrackingDeviceInput): Promise<TimeTrackingDeviceResult>;
  sessions(input: TimeTrackingDeviceInput): Promise<TimeTrackingDeviceResult>;
}

type DeviceHandler = (request: any, reply: any) => Promise<unknown> | unknown;

/** Adapter preserving the existing Control Horario handler rules and response codes. */
export function createTimeTrackingDeviceApi(handlers: {
  clockIn: DeviceHandler;
  clockOut: DeviceHandler;
  status: DeviceHandler;
  sessions: DeviceHandler;
}): TimeTrackingDeviceApi {
  const invoke = async (handler: DeviceHandler, input: TimeTrackingDeviceInput): Promise<TimeTrackingDeviceResult> => {
    let statusCode = 200;
    let sent = false;
    let body: unknown;
    const reply = {
      code(code: number) { statusCode = code; return this; },
      send(value: unknown) { sent = true; body = value; return value; }
    };
    const request = {
      body: { operationId: input.operationId, source: "android" },
      query: { limit: input.limit },
      tenantContext: { tenantId: input.tenantId, userId: input.userId }
    };
    const result = await handler(request, reply);
    return { statusCode, body: sent ? body : result };
  };

  return {
    clockIn: input => invoke(handlers.clockIn, input),
    clockOut: input => invoke(handlers.clockOut, input),
    status: input => invoke(handlers.status, input),
    sessions: input => invoke(handlers.sessions, input)
  };
}
