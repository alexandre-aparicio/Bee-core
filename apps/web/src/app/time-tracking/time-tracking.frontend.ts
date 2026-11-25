import { provideBeePluginFrontend } from "../plugins/plugin-frontend-registry.service";
import { TIME_TRACKING_EN, TIME_TRACKING_ES } from "./time-tracking.catalog";

export const TIME_TRACKING_FRONTEND_PROVIDER = provideBeePluginFrontend({
  id: "time-tracking",
  loadComponent: async () => (await import("./time-tracking.component")).BeeTimeTrackingComponent,
  navigation: [
    { id: "time-tracking", labelKey: "time-tracking:nav.title", icon: "activity", group: "WORKSPACE", route: "/dashboard/time-tracking", defaultChild: "time-tracking-day" },
    { id: "time-tracking-day", parentId: "time-tracking", labelKey: "time-tracking:nav.myDay", icon: "clock", group: "WORKSPACE", route: "/dashboard/time-tracking/my_jorney" },
    { id: "time-tracking-schedule", parentId: "time-tracking", labelKey: "time-tracking:nav.schedules", icon: "calendar", group: "WORKSPACE", route: "/dashboard/time-tracking/schedule", visibleForRoles: ["owner", "admin", "manager", "super_admin"] },
    { id: "time-tracking-schedule", parentId: "time-tracking", labelKey: "time-tracking:nav.mySchedule", icon: "calendar", group: "WORKSPACE", route: "/dashboard/time-tracking/schedule", visibleForRoles: ["member", "guest"] },
    { id: "time-tracking-history", parentId: "time-tracking", labelKey: "time-tracking:nav.history", icon: "history", group: "WORKSPACE", route: "/dashboard/time-tracking/history", visibleForRoles: ["member", "guest"] },
    { id: "time-tracking-requests", parentId: "time-tracking", labelKey: "time-tracking:nav.issues", icon: "clipboard-list", group: "WORKSPACE", route: "/dashboard/time-tracking/requests", visibleForRoles: ["owner", "admin", "manager", "super_admin"] },
    { id: "time-tracking-requests", parentId: "time-tracking", labelKey: "time-tracking:nav.myRequests", icon: "clipboard-list", group: "WORKSPACE", route: "/dashboard/time-tracking/requests", visibleForRoles: ["member", "guest"] }
  ],
  inputs: context => ({ tenantId: context.tenantId, role: context.role, accessToken: context.accessToken, section: context.section }),
  translations: { en: TIME_TRACKING_EN, es: TIME_TRACKING_ES }
});
