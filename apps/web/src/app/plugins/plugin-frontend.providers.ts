import { DOCUMENTS_FRONTEND_PROVIDER } from "../documents/documents.frontend";
import { CONNECTED_DEVICES_FRONTEND_PROVIDER } from "../connected-devices/connected-devices.frontend";
import { TIME_TRACKING_FRONTEND_PROVIDER } from "../time-tracking/time-tracking.frontend";
import { provideBeePluginFrontend } from "./plugin-frontend-registry.service";
import { ORGANIZATION_EN, ORGANIZATION_ES } from "../i18n/catalogs/modules/organization.catalog";
import { MARKETPLACE_EN, MARKETPLACE_ES } from "../i18n/catalogs/modules/marketplace.catalog";
import { NOTIFICATIONS_EN, NOTIFICATIONS_ES } from "../i18n/catalogs/modules/notifications.catalog";
import { MAIL_EN, MAIL_ES } from "../i18n/catalogs/modules/mail.catalog";
import { FILES_EN, FILES_ES } from "../i18n/catalogs/modules/files.catalog";
import { PLATFORM_ADMIN_EN, PLATFORM_ADMIN_ES } from "../i18n/catalogs/modules/platform-admin.catalog";

const coreModuleCatalogProviders = [
  provideBeePluginFrontend({ id: "organization", alwaysActive: true, translations: { en: ORGANIZATION_EN, es: ORGANIZATION_ES } }),
  provideBeePluginFrontend({ id: "marketplace", alwaysActive: true, translations: { en: MARKETPLACE_EN, es: MARKETPLACE_ES } }),
  provideBeePluginFrontend({ id: "notifications", alwaysActive: true, translations: { en: NOTIFICATIONS_EN, es: NOTIFICATIONS_ES } }),
  provideBeePluginFrontend({ id: "mail", alwaysActive: true, translations: { en: MAIL_EN, es: MAIL_ES } }),
  provideBeePluginFrontend({ id: "files", alwaysActive: true, translations: { en: FILES_EN, es: FILES_ES } }),
  provideBeePluginFrontend({ id: "platform-admin", alwaysActive: true, translations: { en: PLATFORM_ADMIN_EN, es: PLATFORM_ADMIN_ES } })
];

export const BEE_PLUGIN_FRONTEND_PROVIDERS = [
  DOCUMENTS_FRONTEND_PROVIDER,
  CONNECTED_DEVICES_FRONTEND_PROVIDER,
  TIME_TRACKING_FRONTEND_PROVIDER,
  ...coreModuleCatalogProviders
];
