import { Injectable } from '@angular/core';
import type { BeeTemplateManifest, BeeTemplateSelection, BeeTemplateTarget } from './template.types';
import { BUILT_IN_TEMPLATES, PACKAGE_TEMPLATES, PACKAGE_THEME_TOKENS, BASE_TEMPLATE_IDS } from './packages';

const STORAGE_KEY = 'bee-template-selection';
const DEFAULT_SELECTION: BeeTemplateSelection = { public: 'aurora', dashboard: 'midnight' };
export type BeeThemeMode = 'light' | 'dark';
const THEME_MODE_KEY = 'bee-template-mode';
const DEFAULT_THEME_TOKENS: Record<string, string> = { '--bg': '#080a12', '--panel': '#10131e', '--muted': '#8991a4', '--border': '#303447', '--purple': '#8c72ff', '--cyan': '#69e5d4' };
const THEME_TOKEN_KEYS = Object.keys(DEFAULT_THEME_TOKENS);


@Injectable({ providedIn: 'root' })
export class BeeTemplateEngine {
  private readonly registry = new Map<string, BeeTemplateManifest>();
  private selection: BeeTemplateSelection = this.readSelection();
  private installedTemplateIds = new Set<string>(BASE_TEMPLATE_IDS);
  private previewSnapshot?: { selection: BeeTemplateSelection; tokens: Record<string, string>; customized: boolean };
  private previewThemePackage: string | null = null;
  private selectionRevision = 0;
  private stream?: EventSource;
  private reconnecting = false;
  themeTokens: Record<string, string> = { ...DEFAULT_THEME_TOKENS };
  private accessToken: string | null = null;
  private userRoles: string[] = [];
  private platformRole: string | null = null;
  private tenantScope: string | null = null;

  constructor() {
    for (const manifest of [...BUILT_IN_TEMPLATES, ...PACKAGE_TEMPLATES]) this.register(manifest);
    if (!this.registry.has(this.selection.public) || this.registry.get(this.selection.public)?.target !== 'public' || !this.installedTemplateIds.has(this.selection.public)) this.selection.public = DEFAULT_SELECTION.public;
    if (!this.registry.has(this.selection.dashboard) || this.registry.get(this.selection.dashboard)?.target !== 'dashboard' || !this.installedTemplateIds.has(this.selection.dashboard)) this.selection.dashboard = DEFAULT_SELECTION.dashboard;
    this.apply();
    if (this.authToken()) void this.restoreRemoteSelection();
    else void this.restorePublicTenant();
  }

  list(target?: BeeTemplateTarget): BeeTemplateManifest[] {
    return [...this.registry.values()].filter(item => this.installedTemplateIds.has(item.id) && (!target || item.target === target));
  }

  get hasAuthenticatedSession(): boolean { return this.authToken() !== null; }

  get canManageTemplates(): boolean { return this.userRoles.includes('admin') || this.platformRole === 'superadmin'; }

  setAuthSession(session: { accessToken?: string; tenantId?: string; user?: { roles?: string[]; platformRole?: string; tenantId?: string } } | null): void {
    this.accessToken = typeof session?.accessToken === 'string' ? session.accessToken : null;
    this.userRoles = Array.isArray(session?.user?.roles) ? session.user.roles : [];
    this.platformRole = session?.user?.platformRole ?? null;
    this.tenantScope = session?.user?.tenantId || session?.tenantId || null;
    if (this.accessToken) void this.restoreRemoteSelection();
    else {
      this.stream?.close();
      this.stream = undefined;
      void this.restorePublicTenant();
    }
  }

  catalog(target?: BeeTemplateTarget): BeeTemplateManifest[] {
    return PACKAGE_TEMPLATES.filter(item => !target || item.target === target);
  }

  isInstalled(templateId: string): boolean { return this.installedTemplateIds.has(templateId); }

  get hasPendingPreview(): boolean { return this.previewSnapshot !== undefined; }

  preview(target: BeeTemplateTarget, templateId: string): void {
    if (!this.canManageTemplates) return;
    const manifest = this.registry.get(templateId);
    if (!manifest || manifest.target !== target || !this.installedTemplateIds.has(templateId)) throw new Error('Template is not installed for this surface');
    if (!this.previewSnapshot) {
      this.previewSnapshot = {
        selection: { ...this.selection },
        tokens: { ...this.themeTokens },
        customized: typeof document !== 'undefined' && document.body.dataset['beeCustomTheme'] === 'true'
      };
    }
    this.selection = { ...this.selection, [target]: templateId };
    this.selectionRevision++;
    this.previewThemePackage = target === 'public' && PACKAGE_THEME_TOKENS[templateId] ? templateId : null;
    const previewTokens = this.previewThemePackage ? PACKAGE_THEME_TOKENS[this.previewThemePackage] : null;
    if (previewTokens) this.applyThemeTokens(previewTokens, 'public');
    else this.restorePreviewTokens();
    this.apply();
    setTimeout(() => {
      this.apply();
      if (previewTokens) this.applyThemeTokens(previewTokens, 'public');
    }, 0);
  }

  commitPreview(): void {
    if (!this.previewSnapshot) return;
    const packageId = this.previewThemePackage;
    this.previewSnapshot = undefined;
    this.previewThemePackage = null;
    this.selectionRevision++;
    this.persist();
    void this.persistRemoteSelection();
    if (packageId) void this.saveThemeTokens(this.themeTokens, 'public');
  }

  cancelPreview(): void {
    if (!this.previewSnapshot) return;
    const snapshot = this.previewSnapshot;
    this.previewSnapshot = undefined;
    this.previewThemePackage = null;
    this.selection = { ...snapshot.selection };
    this.themeTokens = { ...snapshot.tokens };
    this.persist();
    if (typeof document !== 'undefined') {
      if (snapshot.customized) this.applyThemeTokens(snapshot.tokens, 'public');
      else this.clearThemeTokens('public');
    }
    this.apply();
    setTimeout(() => {
      this.apply();
      if (snapshot.customized) this.applyThemeTokens(snapshot.tokens, 'public');
      else this.clearThemeTokens('public');
    }, 0);
  }

  private restorePreviewTokens(): void {
    if (!this.previewSnapshot) return;
    this.themeTokens = { ...this.previewSnapshot.tokens };
    if (this.previewSnapshot.customized) this.applyThemeTokens(this.previewSnapshot.tokens, 'public');
    else this.clearThemeTokens('public');
  }

  getSelection(): BeeTemplateSelection {
    return { ...this.selection };
  }

  getCommittedSelection(): BeeTemplateSelection {
    return { ...(this.previewSnapshot?.selection ?? this.selection) };
  }

  getActive(target: BeeTemplateTarget): BeeTemplateManifest {
    const active = this.registry.get(this.selection[target]);
    return active?.target === target ? active : this.list(target)[0];
  }

  register(manifest: BeeTemplateManifest): void {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(manifest.id)) throw new Error('Invalid template id');
    if (!manifest.name.trim() || !manifest.version.trim() || !manifest.layout.trim()) throw new Error('Template manifest is incomplete');
    const existing = this.registry.get(manifest.id);
    if (existing) {
      if (existing.builtIn || existing.target !== manifest.target) throw new Error(`Template '${manifest.id}' is already registered`);
    }
    this.registry.set(manifest.id, { ...manifest, slots: [...manifest.slots] });
  }

  activate(target: BeeTemplateTarget, templateId: string): void {
    if (this.hasAuthenticatedSession && !this.canManageTemplates) return;
    const manifest = this.registry.get(templateId);
    if (!manifest || manifest.target !== target || !this.installedTemplateIds.has(templateId)) throw new Error('Template is not installed for this surface');
    this.selection = { ...this.selection, [target]: templateId };
    this.selectionRevision++;
    this.persist();
    this.apply();
    setTimeout(() => this.apply(), 0);
    if (target === 'public' && PACKAGE_THEME_TOKENS[templateId]) {
      setTimeout(() => this.applyThemeTokens(PACKAGE_THEME_TOKENS[templateId], 'public'), 0);
      void this.saveThemeTokens(PACKAGE_THEME_TOKENS[templateId], 'public');
    }
    void this.persistRemoteSelection();
  }

  async installTemplate(templateId: string): Promise<boolean> {
    const token = this.authToken();
    if (!token || !this.canManageTemplates || typeof fetch === 'undefined' || !PACKAGE_TEMPLATES.some(item => item.id === templateId)) return false;
    const response = await fetch('/api/templates/install', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ templateId }) });
    if (!response.ok) return false;
    const payload = await response.json() as { installedTemplates?: string[] };
    this.setInstalledTemplates(payload.installedTemplates);
    return true;
  }

  async uninstallTemplate(templateId: string): Promise<boolean> {
    const token = this.authToken();
    if (!token || !this.canManageTemplates || typeof fetch === 'undefined' || !PACKAGE_TEMPLATES.some(item => item.id === templateId)) return false;
    const response = await fetch(`/api/templates/install/${encodeURIComponent(templateId)}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
    if (!response.ok) return false;
    const payload = await response.json() as { installedTemplates?: string[] };
    this.setInstalledTemplates(payload.installedTemplates);
    return true;
  }

  private setInstalledTemplates(ids?: string[]): void {
    if (!Array.isArray(ids)) return;
    this.installedTemplateIds = new Set([...BASE_TEMPLATE_IDS, ...ids.filter(id => this.registry.has(id))]);
    for (const target of ['public', 'dashboard'] as const) {
      if (!this.installedTemplateIds.has(this.selection[target])) this.selection[target] = target === 'public' ? 'aurora' : 'midnight';
    }
    if (!this.previewSnapshot) this.persist();
    this.apply();
  }

  uninstall(templateId: string): void {
    const manifest = this.registry.get(templateId);
    if (!manifest) return;
    if (manifest.builtIn) throw new Error('Built-in templates cannot be removed');
    if (this.selection.public === templateId || this.selection.dashboard === templateId) throw new Error('Deactivate a template before removing it');
    this.registry.delete(templateId);
    this.installedTemplateIds.delete(templateId);
  }


  private storageKey(): string {
    const scope = this.tenantScope || (typeof window !== 'undefined' ? `host-${window.location.hostname}` : 'anonymous');
    return `${STORAGE_KEY}:${scope}`;
  }

  private authToken(): string | null { return this.accessToken; }

  private async restorePublicTenant(): Promise<void> {
    if (typeof fetch === 'undefined') return;
    try {
      const response = await fetch('/api/templates/public');
      if (!response.ok) return;
      const payload = await response.json() as { selection?: Partial<BeeTemplateSelection>; tokens?: Record<string, string>; customized?: boolean; installedTemplates?: string[] };
      this.setInstalledTemplates(payload.installedTemplates);
      if (payload.selection?.public && this.registry.get(payload.selection.public)?.target === 'public' && this.installedTemplateIds.has(payload.selection.public)) this.selection.public = payload.selection.public;
      if (payload.selection?.dashboard && this.registry.get(payload.selection.dashboard)?.target === 'dashboard' && this.installedTemplateIds.has(payload.selection.dashboard)) this.selection.dashboard = payload.selection.dashboard;
      this.apply();
      setTimeout(() => {
        this.apply();
        if (payload.tokens && payload.customized) this.applyThemeTokens(payload.tokens, 'public');
      }, 0);
      await this.connectPublicEvents();
    } catch { /* The built-in public template is the offline fallback. */ }
  }

  async refreshForActiveCompany(): Promise<void> {
    this.stream?.close();
    this.stream = undefined;
    this.selectionRevision++;
    await this.restoreRemoteSelection();
  }

  private async restoreRemoteSelection(): Promise<void> {
    const token = this.authToken();
    if (!token || typeof fetch === 'undefined') return;
    const revision = this.selectionRevision;
    try {
      const response = await fetch('/api/templates/preferences', { headers: { authorization: `Bearer ${token}` } });
      if (!response.ok || revision !== this.selectionRevision) return;
      const payload = await response.json() as { selection?: Partial<BeeTemplateSelection>; installedTemplates?: string[] };
      this.setInstalledTemplates(payload.installedTemplates);
      const remote = payload.selection;
      if (!remote) return;
      const publicId = remote.public;
      const dashboardId = remote.dashboard;
      if (publicId && this.registry.get(publicId)?.target === 'public' && this.installedTemplateIds.has(publicId)) this.selection.public = publicId;
      if (dashboardId && this.registry.get(dashboardId)?.target === 'dashboard' && this.installedTemplateIds.has(dashboardId)) this.selection.dashboard = dashboardId;
      this.persist();
      this.apply();
      setTimeout(() => this.apply(), 0);
      await this.connectRemoteEvents();
    } catch {
      // Local selection remains the offline fallback.
    }
  }

  async saveThemeTokens(tokens: Record<string, string>, target: BeeTemplateTarget = 'public'): Promise<boolean> {
    if (target !== 'public') return false;
    const token = this.authToken();
    if (!token || !this.canManageTemplates || typeof fetch === 'undefined') return false;
    const safeTokens: Record<string, string> = {};
    for (const key of THEME_TOKEN_KEYS) {
      const value = tokens[key];
      if (value !== undefined && /^#[0-9a-fA-F]{6}$/.test(value)) safeTokens[key] = value;
    }
    if (!Object.keys(safeTokens).length) return false;
    const response = await fetch('/api/templates/theme', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ tokens: safeTokens }) });
    if (!response.ok) return false;
    const payload = await response.json() as { tokens?: Record<string, string>; customized?: boolean };
    if (payload.tokens) this.applyThemeTokens(payload.tokens, 'public');
    return true;
  }

  private themeHost(target: BeeTemplateTarget): HTMLElement | null {
    if (typeof document === 'undefined') return null;
    const templateId = this.selection[target];
    return document.querySelector<HTMLElement>(`.bee-template-package-host--${templateId}`);
  }

  private clearThemeTokens(target: BeeTemplateTarget): void {
    const host = this.themeHost(target);
    if (host) for (const key of THEME_TOKEN_KEYS) host.style.removeProperty(key);
    if (typeof document !== 'undefined') delete document.body.dataset['beeCustomTheme'];
  }

  private applyThemeTokens(tokens: Record<string, string>, target: BeeTemplateTarget = 'public'): void {
    if (target !== 'public') return;
    const host = this.themeHost('public');
    for (const key of THEME_TOKEN_KEYS) {
      const value = tokens[key];
      if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)) {
        this.themeTokens[key] = value;
        host?.style.setProperty(key, value);
      }
    }
    if (typeof document !== 'undefined') document.body.dataset['beeCustomTheme'] = 'true';
  }

  private async connectRemoteEvents(): Promise<void> {
    const token = this.authToken();
    if (!token || typeof fetch === 'undefined' || typeof EventSource === 'undefined' || this.stream) return;
    try {
      const response = await fetch('/api/templates/stream-ticket', { method: 'POST', headers: { authorization: `Bearer ${token}` } });
      if (!response.ok) return;
      const payload = await response.json() as { ticket?: string };
      if (payload.ticket) this.openEventStream(payload.ticket);
    } catch { /* SSE is an enhancement; local UI remains usable. */ }
  }

  private async connectPublicEvents(): Promise<void> {
    if (typeof fetch === 'undefined' || typeof EventSource === 'undefined' || this.stream) return;
    try {
      const response = await fetch('/api/templates/public-stream-ticket', { method: 'POST' });
      if (!response.ok) return;
      const payload = await response.json() as { ticket?: string };
      if (payload.ticket) this.openEventStream(payload.ticket);
    } catch { /* Public theme updates can be loaded again on navigation. */ }
  }

  private openEventStream(ticket: string): void {
    this.stream = new EventSource(`/api/templates/events?ticket=${encodeURIComponent(ticket)}`);
    this.stream.addEventListener('template-update', (event: MessageEvent) => {
      try {
        const update = JSON.parse(event.data) as { type?: string; selection?: Partial<BeeTemplateSelection>; tokens?: Record<string, string>; customized?: boolean; installedTemplates?: string[] };
        if (update.installedTemplates && this.previewSnapshot) this.cancelPreview();
        if (update.selection && this.previewSnapshot) this.cancelPreview();
        if (update.installedTemplates) this.setInstalledTemplates(update.installedTemplates);
        if (update.selection) {
          if (this.registry.get(update.selection.public || '')?.target === 'public' && this.installedTemplateIds.has(update.selection.public!)) this.selection.public = update.selection.public!;
          if (this.registry.get(update.selection.dashboard || '')?.target === 'dashboard' && this.installedTemplateIds.has(update.selection.dashboard!)) this.selection.dashboard = update.selection.dashboard!;
          this.persist(); this.apply();
        }
        if (update.tokens && update.customized) this.applyThemeTokens(update.tokens);
      } catch { /* Ignore malformed server events. */ }
    });
    this.stream.onerror = () => {
      this.stream?.close();
      this.stream = undefined;
      if (this.reconnecting) return;
      this.reconnecting = true;
      setTimeout(() => {
        this.reconnecting = false;
        if (this.authToken()) void this.connectRemoteEvents();
        else void this.connectPublicEvents();
      }, 3000);
    };
  }

  private async persistRemoteSelection(): Promise<void> {
    const token = this.authToken();
    if (!token || !this.canManageTemplates || typeof fetch === 'undefined') return;
    try {
      await fetch('/api/templates/preferences', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(this.selection)
      });
    } catch {
      // Keep the local selection; the next successful activation can sync it.
    }
  }

  private modeStorageKey(target: BeeTemplateTarget): string {
    const scope = target === 'public'
      ? (typeof window !== 'undefined' ? `host-${window.location.hostname}` : 'public')
      : this.storageKey().replace(STORAGE_KEY, '');
    return `${THEME_MODE_KEY}:${target}:${this.selection[target]}:${scope}`;
  }

  getMode(target: BeeTemplateTarget): BeeThemeMode {
    if (typeof localStorage === 'undefined') return 'dark';
    const saved = localStorage.getItem(this.modeStorageKey(target));
    if (saved === 'light' || saved === 'dark') return saved;
    const manifest = this.registry.get(this.selection[target]);
    if (manifest?.defaultMode) return manifest.defaultMode;
    return ['editorial', 'studio', 'paper'].includes(this.selection[target]) ? 'light' : 'dark';
  }

  setMode(target: BeeTemplateTarget, mode: BeeThemeMode): void {
    if (mode !== 'light' && mode !== 'dark') return;
    const supportedModes = this.registry.get(this.selection[target])?.appearanceModes;
    if (supportedModes?.length && !supportedModes.includes(mode)) return;
    if (typeof localStorage !== 'undefined') localStorage.setItem(this.modeStorageKey(target), mode);
    this.apply();
  }

  toggleMode(target: BeeTemplateTarget): void {
    this.setMode(target, this.getMode(target) === 'dark' ? 'light' : 'dark');
  }

  private apply(): void {
    if (typeof document === 'undefined') return;
    document.body.dataset['beePublicTemplate'] = this.selection.public;
    document.body.dataset['beeDashboardTemplate'] = this.selection.dashboard;
    document.body.dataset['beePublicMode'] = this.getMode('public');
    document.body.dataset['beeDashboardMode'] = this.getMode('dashboard');
    const activeTarget: BeeTemplateTarget = window.location.pathname === '/dashboard' || window.location.pathname.startsWith('/dashboard/') ? 'dashboard' : 'public';
    document.documentElement.dataset['beeActiveTemplate'] = this.selection[activeTarget];
    document.documentElement.dataset['beeActiveMode'] = this.getMode(activeTarget);
    const publicHost = this.themeHost('public');
    const dashboardHost = this.themeHost('dashboard');
    if (publicHost) {
      publicHost.dataset['beeTemplate'] = this.selection.public;
      publicHost.dataset['beePublicMode'] = this.getMode('public');
    }
    if (dashboardHost) {
      dashboardHost.dataset['beeTemplate'] = this.selection.dashboard;
      dashboardHost.dataset['beeDashboardMode'] = this.getMode('dashboard');
    }
  }

  private readSelection(): BeeTemplateSelection {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_SELECTION };
    try {
      const saved = JSON.parse(localStorage.getItem(this.storageKey()) || '{}') as Partial<BeeTemplateSelection>;
      return {
        public: typeof saved.public === 'string' ? saved.public : DEFAULT_SELECTION.public,
        dashboard: typeof saved.dashboard === 'string' ? saved.dashboard : DEFAULT_SELECTION.dashboard
      };
    } catch {
      return { ...DEFAULT_SELECTION };
    }
  }

  private persist(): void {
    if (typeof localStorage !== 'undefined') localStorage.setItem(this.storageKey(), JSON.stringify(this.selection));
  }
}
