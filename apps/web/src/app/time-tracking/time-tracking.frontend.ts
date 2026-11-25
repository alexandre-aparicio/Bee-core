import { BeeTimeTrackingComponent } from "./time-tracking.component";
import type { BeePluginFrontendRegistration } from "../plugins/plugin-frontend-registry.service";

export const timeTrackingFrontend: BeePluginFrontendRegistration = {
  pluginId: "time-tracking",
  component: BeeTimeTrackingComponent,
  inputs: context => ({ tenantId: context.tenantId, role: context.role, accessToken: context.accessToken, section: context.section }),
  navigation: {
    id: "time-tracking", label: "Time Tracking", labelEs: "Control Horario", icon: "activity", group: "WORKSPACE",
    children: [
      { id: "time-tracking-day", label: "My day", labelEs: "Mi jornada", route: "/dashboard/time-tracking/my_jorney" },
      { id: "time-tracking-schedule", label: "Schedule", labelEs: "Horarios", route: "/dashboard/time-tracking/schedule" },
      { id: "time-tracking-history", label: "History", labelEs: "Mi historial", route: "/dashboard/time-tracking/history" },
      { id: "time-tracking-requests", label: "Requests", labelEs: "Mis solicitudes", route: "/dashboard/time-tracking/requests" }
    ]
  }
};
