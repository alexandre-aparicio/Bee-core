
import { TIME_TRACKING_EN, TIME_TRACKING_ES } from "../i18n/catalogs/modules/time-tracking.catalog";
import type { BeePluginFrontendRegistration } from "../plugins/plugin-frontend-registry.service";

export const timeTrackingFrontend: BeePluginFrontendRegistration = {
  pluginId: "time-tracking",
  loadComponent: () => import("./time-tracking.component").then(module => module.BeeTimeTrackingComponent),
  inputs: context => ({ tenantId: context.tenantId, role: context.role, accessToken: context.accessToken, section: context.section }),
  translations: { en: TIME_TRACKING_EN, es: TIME_TRACKING_ES },
  navigation: {
    id: "time-tracking", label: TIME_TRACKING_EN.title, labelEs: TIME_TRACKING_ES.title, icon: "activity", group: "WORKSPACE", aliases: ["/dashboard/time-tracking"],
    children: [
      { id: "time-tracking-day", label: "My day", labelEs: "Mi jornada", route: "/dashboard/time-tracking/my_jorney" },
      { id: "time-tracking-schedule", label: "My schedule", labelEs: "Mi horario", route: "/dashboard/time-tracking/schedule", labelsByRole: { owner: { en: "Schedules", es: "Horarios" }, admin: { en: "Schedules", es: "Horarios" }, manager: { en: "Schedules", es: "Horarios" }, super_admin: { en: "Schedules", es: "Horarios" } } },
      { id: "time-tracking-history", label: "My history", labelEs: "Mi historial", route: "/dashboard/time-tracking/history", visibleRoles: ["member", "guest"] },
      { id: "time-tracking-requests", label: "My requests", labelEs: "Mis solicitudes", route: "/dashboard/time-tracking/requests", labelsByRole: { owner: { en: "Incidents", es: "Incidencias" }, admin: { en: "Incidents", es: "Incidencias" }, manager: { en: "Incidents", es: "Incidencias" }, super_admin: { en: "Incidents", es: "Incidencias" } } }
    ]
  }
};
