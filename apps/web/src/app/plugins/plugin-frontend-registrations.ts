import { connectedDevicesFrontend } from "../connected-devices/connected-devices.frontend";
import { documentsFrontend } from "../documents/documents.frontend";
import { timeTrackingFrontend } from "../time-tracking/time-tracking.frontend";

export const PLUGIN_FRONTEND_REGISTRATIONS = [documentsFrontend, timeTrackingFrontend, connectedDevicesFrontend] as const;
