import { Inject, Injectable, InjectionToken, Optional, type Provider, type Type } from "@angular/core";
import { BeeI18nService } from "../i18n/bee-i18n.service";

export type BeePluginFrontendContext = {
  tenantId: string;
  role: string;
  accessToken: string;
  section: string;
};

export type BeePluginNavigationItem = {
  id: string;
  labelKey: string;
  icon: string;
  group: string;
  route: string;
  parentId?: string;
  defaultChild?: string;
  visibleForRoles?: string[];
};

export type BeePluginFrontendRegistration = {
  id: string;
  loadComponent?: () => Promise<Type<unknown>>;
  navigation?: BeePluginNavigationItem[];
  inputs?: (context: BeePluginFrontendContext) => Record<string, unknown>;
  translations?: { en: Record<string, string>; es: Record<string, string> };
  alwaysActive?: boolean;
};

export const BEE_PLUGIN_FRONTEND_REGISTRATIONS = new InjectionToken<BeePluginFrontendRegistration[]>("BEE_PLUGIN_FRONTEND_REGISTRATIONS");

export function provideBeePluginFrontend(registration: BeePluginFrontendRegistration): Provider {
  return { provide: BEE_PLUGIN_FRONTEND_REGISTRATIONS, useValue: registration, multi: true };
}

export type ResolvedBeePluginNavigationItem = BeePluginNavigationItem & {
  pluginId: string;
  children: ResolvedBeePluginNavigationItem[];
};

@Injectable({ providedIn: "root" })
export class BeePluginFrontendRegistry {
  private readonly registrations = new Map<string, BeePluginFrontendRegistration>();

  constructor(
    @Optional() @Inject(BEE_PLUGIN_FRONTEND_REGISTRATIONS) registrations: BeePluginFrontendRegistration[] | null,
    private readonly i18n: BeeI18nService
  ) {
    for (const registration of registrations ?? []) this.register(registration);
    this.setActivePlugins([]);
  }

  register(registration: BeePluginFrontendRegistration): void {
    const id = registration.id.trim().toLowerCase();
    if (!id || id !== registration.id || this.registrations.has(id)) throw new Error("Invalid or duplicate plugin frontend registration: " + registration.id);
    this.registrations.set(id, registration);
    if (registration.translations) {
      this.i18n.registerCatalog(id, "en", registration.translations.en);
      this.i18n.registerCatalog(id, "es", registration.translations.es);
    }
  }

  resolve(pluginId: string): BeePluginFrontendRegistration | undefined {
    return this.registrations.get(pluginId.toLowerCase());
  }

  setActivePlugins(pluginIds: string[]): void {
    const active = new Set(pluginIds.map(id => id.toLowerCase()));
    for (const registration of this.registrations.values()) if (registration.alwaysActive) active.add(registration.id);
    this.i18n.setInstalledModules([...active]);
  }

  getNavigationItems(pluginIds: string[], role = "member"): ResolvedBeePluginNavigationItem[] {
    const active = new Set(pluginIds.map(id => id.toLowerCase()));
    const result: ResolvedBeePluginNavigationItem[] = [];
    for (const registration of this.registrations.values()) {
      if (!active.has(registration.id)) continue;
      const entries = (registration.navigation ?? []).filter(item => !item.visibleForRoles || item.visibleForRoles.includes(role));
      for (const item of entries.filter(entry => !entry.parentId)) {
        const children = entries.filter(entry => entry.parentId === item.id).map(child => ({ ...child, pluginId: registration.id, children: [] }));
        result.push({ ...item, pluginId: registration.id, children });
      }
      for (const item of entries.filter(entry => entry.parentId && !entries.some(parent => parent.id === entry.parentId))) {
        result.push({ ...item, pluginId: registration.id, children: [] });
      }
    }
    return result;
  }

  getRoutes(pluginIds: string[], role = "member"): Record<string, string> {
    const entries: Array<[string, string]> = [];
    for (const item of this.getNavigationItems(pluginIds, role)) {
      entries.push([item.id, item.route]);
      for (const child of item.children) entries.push([child.id, child.route]);
    }
    return Object.fromEntries(entries);
  }

  getPluginIdForSection(section: string, pluginIds: string[], role = "member"): string | undefined {
    return this.getNavigationItems(pluginIds, role).find(item => item.id === section || item.children.some(child => child.id === section))?.pluginId;
  }

  getParentMenuId(section: string, pluginIds: string[], role = "member"): string | undefined {
    const parent = this.getNavigationItems(pluginIds, role).find(item => item.children.some(child => child.id === section));
    return parent?.id;
  }

  getDefaultSection(menuId: string, pluginIds: string[], role = "member"): string | undefined {
    return this.getNavigationItems(pluginIds, role).find(item => item.id === menuId)?.defaultChild;
  }

  hasSection(section: string, pluginIds: string[], role = "member"): boolean {
    return this.getPluginIdForSection(section, pluginIds, role) !== undefined;
  }
}
