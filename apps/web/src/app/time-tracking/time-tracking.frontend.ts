
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
      { id: "time-tracking-day", label: TIME_TRACKING_EN.my_day, labelEs: TIME_TRACKING_ES.my_day, route: "/dashboard/time-tracking/my_jorney" },
      { id: "time-tracking-schedule", label: TIME_TRACKING_EN.my_schedule, labelEs: TIME_TRACKING_ES.my_schedule, route: "/dashboard/time-tracking/schedule", labelsByRole: { owner: { en: TIME_TRACKING_EN.nav_schedules, es: TIME_TRACKING_ES.nav_schedules }, admin: { en: TIME_TRACKING_EN.nav_schedules, es: TIME_TRACKING_ES.nav_schedules }, manager: { en: TIME_TRACKING_EN.nav_schedules, es: TIME_TRACKING_ES.nav_schedules }, super_admin: { en: TIME_TRACKING_EN.nav_schedules, es: TIME_TRACKING_ES.nav_schedules } } },
      { id: "time-tracking-history", label: TIME_TRACKING_EN.history, labelEs: TIME_TRACKING_ES.history, route: "/dashboard/time-tracking/history", visibleRoles: ["member", "guest"] },
      { id: "time-tracking-requests", label: TIME_TRACKING_EN.my_requests, labelEs: TIME_TRACKING_ES.my_requests, route: "/dashboard/time-tracking/requests", labelsByRole: { owner: { en: TIME_TRACKING_EN.nav_incidents, es: TIME_TRACKING_ES.nav_incidents }, admin: { en: TIME_TRACKING_EN.nav_incidents, es: TIME_TRACKING_ES.nav_incidents }, manager: { en: TIME_TRACKING_EN.nav_incidents, es: TIME_TRACKING_ES.nav_incidents }, super_admin: { en: TIME_TRACKING_EN.nav_incidents, es: TIME_TRACKING_ES.nav_incidents } } }
    ]
  }
};
