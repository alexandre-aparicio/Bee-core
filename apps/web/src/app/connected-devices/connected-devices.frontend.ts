import { BeeConnectedDevicesComponent } from "./connected-devices.component";
import type { BeePluginFrontendRegistration } from "../plugins/plugin-frontend-registry.service";

export const connectedDevicesFrontend: BeePluginFrontendRegistration = {
  pluginId: "connected-devices",
  component: BeeConnectedDevicesComponent,
  inputs: context => ({ tenantId: context.tenantId, role: context.role, accessToken: context.accessToken }),
  navigation: { id: "connected-devices", label: "Connected Devices", labelEs: "Dispositivos conectados", icon: "infrastructure", group: "WORKSPACE", route: "/dashboard/connected-devices" }
};
