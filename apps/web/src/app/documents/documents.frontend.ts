import { BeeDocumentsComponent } from "./documents.component";
import { DOCUMENTS_EN, DOCUMENTS_ES } from "../i18n/catalogs/modules/documents.catalog";
import type { BeePluginFrontendRegistration } from "../plugins/plugin-frontend-registry.service";

export const documentsFrontend: BeePluginFrontendRegistration = {
  pluginId: "documents",
  component: BeeDocumentsComponent,
  inputs: context => ({ tenantId: context.tenantId, accessToken: context.accessToken }),
  translations: { en: DOCUMENTS_EN, es: DOCUMENTS_ES },
  navigation: { id: "documents", label: "Documents", labelEs: "Documentos", icon: "documentation", group: "WORKSPACE", route: "/dashboard/documents" }
};
