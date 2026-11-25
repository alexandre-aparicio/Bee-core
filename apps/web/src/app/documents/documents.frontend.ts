import { provideBeePluginFrontend } from "../plugins/plugin-frontend-registry.service";
import { DOCUMENTS_EN, DOCUMENTS_ES } from "../i18n/catalogs/modules/documents.catalog";

export const DOCUMENTS_FRONTEND_PROVIDER = provideBeePluginFrontend({
  id: "documents",
  loadComponent: async () => (await import("./documents.component")).BeeDocumentsComponent,
  navigation: [{ id: "documents", labelKey: "documents:nav.documents", icon: "documentation", group: "WORKSPACE", route: "/dashboard/documents" }],
  inputs: context => ({ tenantId: context.tenantId, accessToken: context.accessToken }),
  translations: { en: DOCUMENTS_EN, es: DOCUMENTS_ES }
});
