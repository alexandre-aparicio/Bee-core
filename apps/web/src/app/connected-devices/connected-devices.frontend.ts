
import type { BeePluginFrontendRegistration } from "../plugins/plugin-frontend-registry.service";

export const connectedDevicesFrontend: BeePluginFrontendRegistration = {
  pluginId: "connected-devices",
  loadComponent: () => import("./connected-devices.component").then(module => module.BeeConnectedDevicesComponent),
  inputs: context => ({ tenantId: context.tenantId, role: context.role, accessToken: context.accessToken }),
  navigation: { id: "connected-devices", label: "Connected Devices", labelEs: "Dispositivos conectados", icon: "infrastructure", group: "WORKSPACE", route: "/dashboard/connected-devices" }
};
