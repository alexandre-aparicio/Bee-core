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

export type TimeTrackingDeviceOperation = "clock" | "read";
export type TimeTrackingDeviceAuthorizer = (
  input: Pick<TimeTrackingDeviceInput, "tenantId" | "userId">,
  operation: TimeTrackingDeviceOperation
) => Promise<boolean>;

export interface TimeTrackingDeviceApi {
  clockIn(input: TimeTrackingDeviceInput): Promise<TimeTrackingDeviceResult>;
  clockOut(input: TimeTrackingDeviceInput): Promise<TimeTrackingDeviceResult>;
  status(input: TimeTrackingDeviceInput): Promise<TimeTrackingDeviceResult>;
  sessions(input: TimeTrackingDeviceInput): Promise<TimeTrackingDeviceResult>;
}

type DeviceHandler = (request: any, reply: any) => Promise<unknown> | unknown;

/**
 * Internal service boundary for trusted device extensions. It reuses the
 * Control Horario handlers, but performs package, membership and effective
 * permission checks before any business operation is executed.
 */
export function createTimeTrackingDeviceApi(
  handlers: {
    clockIn: DeviceHandler;
    clockOut: DeviceHandler;
    status: DeviceHandler;
    sessions: DeviceHandler;
  },
  authorize: TimeTrackingDeviceAuthorizer
): TimeTrackingDeviceApi {
  const invoke = async (
    handler: DeviceHandler,
    input: TimeTrackingDeviceInput,
    operation: TimeTrackingDeviceOperation
  ): Promise<TimeTrackingDeviceResult> => {
    if (!input.tenantId || !input.userId || !await authorize(input, operation)) {
      return { statusCode: 403, body: { error: "The linked user is not authorized for this Control Horario operation." } };
    }

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
    clockIn: input => invoke(handlers.clockIn, input, "clock"),
    clockOut: input => invoke(handlers.clockOut, input, "clock"),
    status: input => invoke(handlers.status, input, "read"),
    sessions: input => invoke(handlers.sessions, input, "read")
  };
}
