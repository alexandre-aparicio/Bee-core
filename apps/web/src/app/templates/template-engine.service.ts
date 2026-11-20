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

@Injectable({ providedIn: 'root' })
export class BeeTemplateEngine {
  private readonly registry = new Map<string, BeeTemplateManifest>();
  private selection: BeeTemplateSelection = this.readSelection();
  private selectionRevision = 0;
  private stream?: EventSource;
  themeTokens: Record<string, string> = { ...DEFAULT_THEME_TOKENS };

  constructor() {
    for (const manifest of BUILT_IN_TEMPLATES) this.register(manifest);
    if (!this.registry.has(this.selection.public) || this.registry.get(this.selection.public)?.target !== 'public') this.selection.public = DEFAULT_SELECTION.public;
    if (!this.registry.has(this.selection.dashboard) || this.registry.get(this.selection.dashboard)?.target !== 'dashboard') this.selection.dashboard = DEFAULT_SELECTION.dashboard;
    this.apply();
    void this.restoreRemoteSelection();
  }

  list(target?: BeeTemplateTarget): BeeTemplateManifest[] {
    return [...this.registry.values()].filter(item => !target || item.target === target);
  }

  getSelection(): BeeTemplateSelection {
    return { ...this.selection };
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
    const manifest = this.registry.get(templateId);
    if (!manifest || manifest.target !== target) throw new Error('Template is not registered for this surface');
    this.selection = { ...this.selection, [target]: templateId };
    this.selectionRevision++;
    this.persist();
    this.apply();
    void this.persistRemoteSelection();
  }

  uninstall(templateId: string): void {
    const manifest = this.registry.get(templateId);
    if (!manifest) return;
    if (manifest.builtIn) throw new Error('Built-in templates cannot be removed');
    if (this.selection.public === templateId || this.selection.dashboard === templateId) throw new Error('Deactivate a template before removing it');
    this.registry.delete(templateId);
  }


  private storageKey(): string {
    if (typeof localStorage === 'undefined') return STORAGE_KEY;
    try { const session = JSON.parse(localStorage.getItem('bee-auth') || 'null') as { user?: { tenantId?: string } } | null; return `${STORAGE_KEY}:${session?.user?.tenantId || 'anonymous'}`; } catch { return `${STORAGE_KEY}:anonymous`; }
  }

  private authToken(): string | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const session = JSON.parse(localStorage.getItem('bee-auth') || 'null') as { accessToken?: string } | null;
      return typeof session?.accessToken === 'string' ? session.accessToken : null;
    } catch { return null; }
  }

  private async restoreRemoteSelection(): Promise<void> {
    const token = this.authToken();
    if (!token || typeof fetch === 'undefined') return;
    const revision = this.selectionRevision;
    try {
      const response = await fetch('/api/templates/preferences', { headers: { authorization: `Bearer ${token}` } });
      if (!response.ok || revision !== this.selectionRevision) return;
      const payload = await response.json() as { selection?: Partial<BeeTemplateSelection> };
      const remote = payload.selection;
      if (!remote) return;
      const publicId = remote.public;
      const dashboardId = remote.dashboard;
      if (publicId && this.registry.get(publicId)?.target === 'public') this.selection.public = publicId;
      if (dashboardId && this.registry.get(dashboardId)?.target === 'dashboard') this.selection.dashboard = dashboardId;
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
      const payload = await response.json() as { tokens?: Record<string, string> };
      if (payload.tokens) this.applyThemeTokens(payload.tokens);
    } catch { /* Keep the last known theme when offline. */ }
  }

  async saveThemeTokens(tokens: Record<string, string>): Promise<boolean> {
    const token = this.authToken();
    if (!token || typeof fetch === 'undefined') return false;
    const safeTokens: Record<string, string> = {};
    for (const key of THEME_TOKEN_KEYS) {
      const value = tokens[key];
      if (value !== undefined && /^#[0-9a-fA-F]{6}$/.test(value)) safeTokens[key] = value;
    }
    if (!Object.keys(safeTokens).length) return false;
    const response = await fetch('/api/templates/theme', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ tokens: safeTokens }) });
    if (!response.ok) return false;
    const payload = await response.json() as { tokens?: Record<string, string> };
    if (payload.tokens) this.applyThemeTokens(payload.tokens);
    return true;
  }

  private applyThemeTokens(tokens: Record<string, string>): void {
    for (const key of THEME_TOKEN_KEYS) {
      const value = tokens[key];
      if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)) {
        this.themeTokens[key] = value;
        if (typeof document !== 'undefined') document.documentElement.style.setProperty(key, value);
      }
    }
  }

  private async connectRemoteEvents(): Promise<void> {
    const token = this.authToken();
    if (!token || typeof fetch === 'undefined' || typeof EventSource === 'undefined' || this.stream) return;
    try {
      const ticketResponse = await fetch('/api/templates/stream-ticket', { method: 'POST', headers: { authorization: `Bearer ${token}` } });
      if (!ticketResponse.ok) return;
      const ticket = await ticketResponse.json() as { ticket?: string };
      if (!ticket.ticket) return;
      this.stream = new EventSource(`/api/templates/events?ticket=${encodeURIComponent(ticket.ticket)}`);
      this.stream.addEventListener('template-update', (event: MessageEvent) => {
        try {
          const update = JSON.parse(event.data) as { type?: string; selection?: Partial<BeeTemplateSelection>; tokens?: Record<string, string> };
          if (update.selection) {
            if (this.registry.get(update.selection.public || '')?.target === 'public') this.selection.public = update.selection.public!;
            if (this.registry.get(update.selection.dashboard || '')?.target === 'dashboard') this.selection.dashboard = update.selection.dashboard!;
            this.persist(); this.apply();
          }
          if (update.tokens) this.applyThemeTokens(update.tokens);
        } catch { /* Ignore malformed server events. */ }
      });
      this.stream.onerror = () => { this.stream?.close(); this.stream = undefined; };
    } catch { /* SSE is an enhancement; local UI remains usable. */ }
  }

  private async persistRemoteSelection(): Promise<void> {
    const token = this.authToken();
    if (!token || typeof fetch === 'undefined') return;
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
