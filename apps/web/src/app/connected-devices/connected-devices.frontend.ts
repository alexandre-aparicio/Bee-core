import { provideBeePluginFrontend } from "../plugins/plugin-frontend-registry.service";
import { CONNECTED_DEVICES_EN, CONNECTED_DEVICES_ES } from "./connected-devices.catalog";

export const CONNECTED_DEVICES_FRONTEND_PROVIDER = provideBeePluginFrontend({
  id: "connected-devices",
  loadComponent: async () => (await import("./connected-devices.component")).BeeConnectedDevicesComponent,
  navigation: [{ id: "connected-devices", labelKey: "connected-devices:nav.connectedDevices", icon: "infrastructure", group: "WORKSPACE", route: "/dashboard/connected-devices" }],
  inputs: context => ({ tenantId: context.tenantId, role: context.role, accessToken: context.accessToken }),
  translations: { en: CONNECTED_DEVICES_EN, es: CONNECTED_DEVICES_ES }
});
