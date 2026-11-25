import { Injectable } from '@angular/core';
import { CORE_EN, CORE_ES } from './catalogs/core.catalog';
import { SETTINGS_EN, SETTINGS_ES } from './catalogs/settings.catalog';

export type BeeLanguage = 'en' | 'es';
export interface BeeLanguageOption { code: BeeLanguage; label: string; nativeLabel: string; }
export interface BeeLanguagePreferences {
  languages: BeeLanguageOption[];
  userLanguage: BeeLanguage | null;
  teamDefaultLanguage: BeeLanguage;
  effectiveLanguage: BeeLanguage;
  canManageTeamDefault: boolean;
}

@Injectable({ providedIn: 'root' })
export class BeeI18nService {
  private readonly catalogs = new Map<string, Record<string, string>>();
  private readonly activeNamespaces = new Set<string>(['core', 'settings']);
  locale: BeeLanguage = 'en';
  preferences: BeeLanguagePreferences | null = null;

  constructor() {
    this.registerCatalog('core', 'en', CORE_EN);
    this.registerCatalog('core', 'es', CORE_ES);
    this.registerCatalog('settings', 'en', SETTINGS_EN);
    this.registerCatalog('settings', 'es', SETTINGS_ES);
    this.applyDocumentLanguage();
  }

  registerCatalog(namespace: string, language: BeeLanguage, messages: Record<string, string>): void {
    const key = namespace.toLowerCase() + ':' + language;
    this.catalogs.set(key, { ...(this.catalogs.get(key) ?? {}), ...messages });
  }

  setInstalledModules(moduleIds: string[]): void {
    this.activeNamespaces.clear();
    this.activeNamespaces.add('core');
    this.activeNamespaces.add('settings');
    for (const id of moduleIds) this.activeNamespaces.add(String(id).toLowerCase());
  }

  t(input: string): string {
    const separator = input.indexOf(':');
    const namespace = separator > 0 ? input.slice(0, separator).toLowerCase() : 'core';
    const key = separator > 0 ? input.slice(separator + 1) : input;
    if (!this.activeNamespaces.has(namespace)) return key;
    const current = this.catalogs.get(namespace + ':' + this.locale);
    const fallback = this.catalogs.get(namespace + ':en');
    return current?.[key] ?? fallback?.[key] ?? key;
  }

  async loadPreferences(accessToken: string): Promise<void> {
    if (!accessToken || typeof fetch === 'undefined') return;
    try {
      const response = await fetch('/api/i18n/preferences', { credentials: 'same-origin', headers: { authorization: 'Bearer ' + accessToken } });
      if (!response.ok) return;
      const preferences = await response.json() as BeeLanguagePreferences;
      if (preferences.effectiveLanguage !== 'en' && preferences.effectiveLanguage !== 'es') return;
      this.preferences = preferences;
      this.setLocale(preferences.effectiveLanguage);
    } catch {
      // Keep the English fallback when localization preferences are unavailable.
    }
  }

  setLocale(language: BeeLanguage): void {
    if (language !== 'en' && language !== 'es') return;
    this.locale = language;
    this.applyDocumentLanguage();
  }

  updatePreferences(preferences: Partial<BeeLanguagePreferences>): void {
    this.preferences = { ...(this.preferences ?? {
      languages: [{ code: 'en', label: 'English', nativeLabel: 'English' }, { code: 'es', label: 'Spanish', nativeLabel: 'Español' }],
      userLanguage: null, teamDefaultLanguage: 'en', effectiveLanguage: 'en', canManageTeamDefault: false
    }), ...preferences };
    if (preferences.effectiveLanguage) this.setLocale(preferences.effectiveLanguage);
  }

  private applyDocumentLanguage(): void {
    if (typeof document !== 'undefined') document.documentElement.lang = this.locale;
  }
}