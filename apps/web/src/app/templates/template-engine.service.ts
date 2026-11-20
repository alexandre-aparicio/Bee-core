import { Injectable } from '@angular/core';
import type { BeeTemplateManifest, BeeTemplateSelection, BeeTemplateTarget } from './template.types';

const STORAGE_KEY = 'bee-template-selection';
const DEFAULT_THEME_TOKENS: Record<string, string> = { '--bg': '#080a12', '--panel': '#10131e', '--muted': '#8991a4', '--border': '#303447', '--purple': '#8c72ff', '--cyan': '#69e5d4' };
const THEME_TOKEN_KEYS = Object.keys(DEFAULT_THEME_TOKENS);

const BUILT_IN_TEMPLATES: BeeTemplateManifest[] = [
  { id: 'aurora', name: 'Aurora', version: '1.0.0', target: 'public', description: 'Dark, expressive public experience.', builtIn: true, layout: 'public.aurora', slots: ['header', 'hero', 'content', 'footer'] },
  { id: 'editorial', name: 'Editorial', version: '1.0.0', target: 'public', description: 'Light, content-first public experience.', builtIn: true, layout: 'public.editorial', slots: ['header', 'hero', 'content', 'footer'] },
  { id: 'midnight', name: 'Midnight', version: '1.0.0', target: 'dashboard', description: 'Dark workspace with high-contrast panels.', builtIn: true, layout: 'dashboard.midnight', slots: ['sidebar', 'topbar', 'content', 'widgets'] },
  { id: 'paper', name: 'Paper', version: '1.0.0', target: 'dashboard', description: 'Light workspace for long working sessions.', builtIn: true, layout: 'dashboard.paper', slots: ['sidebar', 'topbar', 'content', 'widgets'] }
];

const DEFAULT_SELECTION: BeeTemplateSelection = { public: 'aurora', dashboard: 'midnight' };
const BASE_TEMPLATE_IDS = ['aurora', 'editorial', 'midnight', 'paper'];
const PACKAGE_TEMPLATES: BeeTemplateManifest[] = [
  { id: 'studio', name: 'Studio', version: '1.0.0', target: 'public', description: 'Warm editorial landing page with a bright accent palette.', builtIn: false, layout: 'public.studio', slots: ['header', 'hero', 'content', 'footer'] },
  { id: 'glass', name: 'Glass', version: '1.0.0', target: 'dashboard', description: 'Soft glass workspace with cool blue and violet accents.', builtIn: false, layout: 'dashboard.glass', slots: ['sidebar', 'topbar', 'content', 'widgets'] }
];
const PACKAGE_THEME_TOKENS: Record<string, Record<string, string>> = {
  studio: { '--bg': '#f4f0e9', '--panel': '#fffaf2', '--muted': '#756e65', '--border': '#ded5c8', '--purple': '#b85d3b', '--cyan': '#397d78' },
  glass: { '--bg': '#101827', '--panel': '#1b2940', '--muted': '#a2b1c7', '--border': '#40516b', '--purple': '#8b9dff', '--cyan': '#69d9e8' }
};

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

  get canManageTemplates(): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
      const session = JSON.parse(localStorage.getItem('bee-auth') || 'null') as { user?: { roles?: string[] } } | null;
      return Array.isArray(session?.user?.roles) && session.user.roles.includes('admin');
    } catch { return false; }
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
    this.previewThemePackage = PACKAGE_THEME_TOKENS[templateId] ? templateId : null;
    if (this.previewThemePackage) this.applyThemeTokens(PACKAGE_THEME_TOKENS[this.previewThemePackage]);
    else this.restorePreviewTokens();
    this.apply();
  }

  commitPreview(): void {
    if (!this.previewSnapshot) return;
    const packageId = this.previewThemePackage;
    this.previewSnapshot = undefined;
    this.previewThemePackage = null;
    this.selectionRevision++;
    this.persist();
    void this.persistRemoteSelection();
    if (packageId) void this.saveThemeTokens(this.themeTokens);
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
      for (const [key, value] of Object.entries(snapshot.tokens)) document.documentElement.style.setProperty(key, value);
      if (snapshot.customized) document.body.dataset['beeCustomTheme'] = 'true';
      else delete document.body.dataset['beeCustomTheme'];
    }
    this.apply();
  }

  private restorePreviewTokens(): void {
    if (!this.previewSnapshot) return;
    this.themeTokens = { ...this.previewSnapshot.tokens };
    if (typeof document !== 'undefined') {
      for (const [key, value] of Object.entries(this.previewSnapshot.tokens)) document.documentElement.style.setProperty(key, value);
      if (this.previewSnapshot.customized) document.body.dataset['beeCustomTheme'] = 'true';
      else delete document.body.dataset['beeCustomTheme'];
    }
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
    if (PACKAGE_THEME_TOKENS[templateId]) void this.saveThemeTokens(PACKAGE_THEME_TOKENS[templateId]);
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
    if (typeof localStorage === 'undefined') return STORAGE_KEY;
    try { const session = JSON.parse(localStorage.getItem('bee-auth') || 'null') as { user?: { tenantId?: string } } | null; const scope = session?.user?.tenantId || (typeof window !== 'undefined' ? `host-${window.location.hostname}` : 'anonymous'); return `${STORAGE_KEY}:${scope}`; } catch { return `${STORAGE_KEY}:${typeof window !== 'undefined' ? `host-${window.location.hostname}` : 'anonymous'}`; }
  }

  private authToken(): string | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const session = JSON.parse(localStorage.getItem('bee-auth') || 'null') as { accessToken?: string } | null;
      return typeof session?.accessToken === 'string' ? session.accessToken : null;
    } catch { return null; }
  }

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
      if (payload.tokens && payload.customized) this.applyThemeTokens(payload.tokens);
      await this.connectPublicEvents();
    } catch { /* The built-in public template is the offline fallback. */ }
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
      await this.restoreRemoteTheme();
      await this.connectRemoteEvents();
    } catch {
      // Local selection remains the offline fallback.
    }
  }

  private async restoreRemoteTheme(): Promise<void> {
    const token = this.authToken();
    if (!token || typeof fetch === 'undefined') return;
    try {
      const response = await fetch('/api/templates/theme', { headers: { authorization: `Bearer ${token}` } });
      if (!response.ok) return;
      const payload = await response.json() as { tokens?: Record<string, string>; customized?: boolean };
      if (payload.tokens && payload.customized) this.applyThemeTokens(payload.tokens);
    } catch { /* Keep the last known theme when offline. */ }
  }

  async saveThemeTokens(tokens: Record<string, string>): Promise<boolean> {
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
    if (payload.tokens) this.applyThemeTokens(payload.tokens);
    return true;
  }

  private applyThemeTokens(tokens: Record<string, string>): void {
    for (const key of THEME_TOKEN_KEYS) {
      const value = tokens[key];
      if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)) {
        this.themeTokens[key] = value;
        if (typeof document !== 'undefined') { document.documentElement.style.setProperty(key, value); document.body.dataset['beeCustomTheme'] = 'true'; }
      }
    }
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

  private apply(): void {
    if (typeof document === 'undefined') return;
    document.body.dataset['beePublicTemplate'] = this.selection.public;
    document.body.dataset['beeDashboardTemplate'] = this.selection.dashboard;
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
