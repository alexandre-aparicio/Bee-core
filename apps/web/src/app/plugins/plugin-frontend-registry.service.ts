import { Injectable, type Type } from "@angular/core";
import { PLUGIN_FRONTEND_REGISTRATIONS } from "./plugin-frontend-registrations";
import { createFrontendRegistrationMap } from "./plugin-frontend-registration-map";

export type BeePluginFrontendContext = {
  tenantId: string;
  role: string;
  accessToken: string;
  section: string;
};

export type BeePluginNavigationChild = { id: string; label: string; labelEs: string; route: string; visibleRoles?: string[]; labelsByRole?: Record<string,{en?:string;es?:string}> };
export type BeePluginNavigation = {
  id: string;
  label: string;
  labelEs: string;
  icon: string;
  group: string;
  route?: string;
  aliases?: string[];
  children?: BeePluginNavigationChild[];
};

export type BeePluginFrontendRegistration = {
  pluginId: string;
  loadComponent: () => Promise<Type<unknown>>;
  inputs: (context: BeePluginFrontendContext) => Record<string, unknown>;
  navigation: BeePluginNavigation;
  translations?: { en: Record<string, string>; es: Record<string, string> };
};

/** Generic host contract. Feature modules own and contribute their registrations. */
@Injectable({ providedIn: "root" })
export class BeePluginFrontendRegistry {
  private readonly registrations = createFrontendRegistrationMap<BeePluginFrontendRegistration>(PLUGIN_FRONTEND_REGISTRATIONS);
  private readonly remoteNavigation = new Map<string, BeePluginNavigation>();
  private readonly remoteRuntimeRefs = new Map<string, string>();

  /** Navigation for signed ZIP frontends is supplied by the tenant-authorized package catalogue. */
  setRemoteNavigation(entries: Array<{ pluginId: string; runtimeRef?: string; navigation: BeePluginNavigation }>): void {
    this.remoteNavigation.clear();
    this.remoteRuntimeRefs.clear();
    for (const entry of entries) {
      const pluginId = String(entry.pluginId ?? "");
      const navigation = entry.navigation;
      if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(pluginId) ||
          navigation?.id !== pluginId ||
          typeof navigation.route !== "string" ||
          !navigation.route.startsWith("/dashboard/") ||
          navigation.route.startsWith("//") ||
          navigation.route.includes("..") ||
          navigation.route.includes("?") ||
          navigation.route.includes("#")) continue;
      this.remoteNavigation.set(pluginId, navigation);
      if (typeof entry.runtimeRef === "string" && entry.runtimeRef.length > 0) this.remoteRuntimeRefs.set(pluginId, entry.runtimeRef);
    }
  }

  runtimeReference(pluginId: string): string {
    return this.remoteRuntimeRefs.get(pluginId) ?? pluginId;
  }

  private navigationEntries(): Array<[string, BeePluginNavigation]> {
    return [
      ...[...this.registrations.values()].map(item => [item.pluginId, item.navigation] as [string, BeePluginNavigation]),
      ...this.remoteNavigation.entries()
    ];
  }

  resolve(pluginId: string): BeePluginFrontendRegistration | undefined {
    return this.registrations.get(pluginId);
  }

  navigation(activePluginIds: readonly string[]): BeePluginNavigation[] {
    const active = new Set(activePluginIds);
    return this.navigationEntries().filter(([pluginId]) => active.has(pluginId)).map(([, navigation]) => navigation);
  }

  pluginForSection(sectionId: string): string | undefined {
    for (const [pluginId, navigation] of this.navigationEntries()) {
      if (navigation.id === sectionId || navigation.children?.some(child => child.id === sectionId)) return pluginId;
    }
    return undefined;
  }

  routeForSection(sectionId: string): string | undefined {
    for (const [, navigation] of this.navigationEntries()) {
      if (navigation.id === sectionId) return navigation.route;
      const child = navigation.children?.find(entry => entry.id === sectionId);
      if (child) return child.route;
    }
    return undefined;
  }

  sectionForPath(path: string): string | undefined {
    for (const [, navigation] of this.navigationEntries()) {
      if (navigation.route === path) return navigation.children?.[0]?.id ?? navigation.id;
      if (navigation.aliases?.includes(path)) return navigation.children?.[0]?.id ?? navigation.id;
      const child = navigation.children?.find(entry => entry.route === path);
      if (child) return child.id;
    }
    return undefined;
  }

  navigationGroupForSection(sectionId: string): string | undefined {
    for (const [, navigation] of this.navigationEntries()) {
      if (navigation.id === sectionId || navigation.children?.some(child => child.id === sectionId)) return navigation.id;
    }
    return undefined;
  }

  defaultSection(navigationId: string): string | undefined {
    const navigation = this.navigationEntries().find(([pluginId]) => pluginId === navigationId)?.[1];
    return navigation?.children?.[0]?.id ?? navigation?.id;
  }

  labelForSection(sectionId: string, language: "en" | "es", role = ""): string | undefined {
    for (const [, navigation] of this.navigationEntries()) {
      if (navigation.id === sectionId) return language === "es" ? navigation.labelEs : navigation.label;
      const child = navigation.children?.find(entry => entry.id === sectionId);
      if (child) return child.labelsByRole?.[role]?.[language] ?? (language === "es" ? child.labelEs : child.label);
    }
    return undefined;
  }
}
