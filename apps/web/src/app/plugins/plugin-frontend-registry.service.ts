import { Injectable, type Type } from "@angular/core";
import { PLUGIN_FRONTEND_REGISTRATIONS } from "./plugin-frontend-registrations";

export type BeePluginFrontendContext = {
  tenantId: string;
  role: string;
  accessToken: string;
  section: string;
};

export type BeePluginNavigationChild = { id: string; label: string; labelEs: string; route: string };
export type BeePluginNavigation = {
  id: string;
  label: string;
  labelEs: string;
  icon: string;
  group: string;
  route?: string;
  children?: BeePluginNavigationChild[];
};

export type BeePluginFrontendRegistration = {
  pluginId: string;
  component: Type<unknown>;
  inputs: (context: BeePluginFrontendContext) => Record<string, unknown>;
  navigation: BeePluginNavigation;
  translations?: { en: Record<string, string>; es: Record<string, string> };
};

/** Generic host contract. Feature modules own and contribute their registrations. */
@Injectable({ providedIn: "root" })
export class BeePluginFrontendRegistry {
  private readonly registrations = new Map<string, BeePluginFrontendRegistration>(
    PLUGIN_FRONTEND_REGISTRATIONS.map(registration => [registration.pluginId, registration])
  );

  resolve(pluginId: string): BeePluginFrontendRegistration | undefined {
    return this.registrations.get(pluginId);
  }

  navigation(activePluginIds: readonly string[]): BeePluginNavigation[] {
    const active = new Set(activePluginIds);
    return [...this.registrations.values()].filter(item => active.has(item.pluginId)).map(item => item.navigation);
  }

  pluginForSection(sectionId: string): string | undefined {
    for (const item of this.registrations.values()) {
      if (item.navigation.id === sectionId || item.navigation.children?.some(child => child.id === sectionId)) return item.pluginId;
    }
    return undefined;
  }

  routeForSection(sectionId: string): string | undefined {
    for (const item of this.registrations.values()) {
      if (item.navigation.id === sectionId) return item.navigation.route;
      const child = item.navigation.children?.find(entry => entry.id === sectionId);
      if (child) return child.route;
    }
    return undefined;
  }

  sectionForPath(path: string): string | undefined {
    for (const item of this.registrations.values()) {
      if (item.navigation.route === path) return item.navigation.id;
      const child = item.navigation.children?.find(entry => entry.route === path);
      if (child) return child.id;
    }
    return undefined;
  }

  navigationGroupForSection(sectionId: string): string | undefined {
    for (const item of this.registrations.values()) {
      if (item.navigation.id === sectionId || item.navigation.children?.some(child => child.id === sectionId)) return item.navigation.id;
    }
    return undefined;
  }

  defaultSection(navigationId: string): string | undefined {
    const navigation = this.registrations.get(navigationId)?.navigation;
    return navigation?.children?.[0]?.id ?? navigation?.id;
  }

  labelForSection(sectionId: string, language: "en" | "es"): string | undefined {
    for (const item of this.registrations.values()) {
      if (item.navigation.id === sectionId) return language === "es" ? item.navigation.labelEs : item.navigation.label;
      const child = item.navigation.children?.find(entry => entry.id === sectionId);
      if (child) return language === "es" ? child.labelEs : child.label;
    }
    return undefined;
  }
}
