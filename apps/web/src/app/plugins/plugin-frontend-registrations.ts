import { documentsFrontend } from "../documents/documents.frontend";
import { connectedDevicesFrontend } from "../connected-devices/connected-devices.frontend";
import { timeTrackingFrontend } from "../time-tracking/time-tracking.frontend";

export const PLUGIN_FRONTEND_REGISTRATIONS = [documentsFrontend, connectedDevicesFrontend, timeTrackingFrontend] as const;
