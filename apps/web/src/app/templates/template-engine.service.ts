import { Injectable } from '@angular/core';
import type { BeeTemplateManifest, BeeTemplateSelection, BeeTemplateTarget } from './template.types';

const STORAGE_KEY = 'bee-template-selection';

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
    } catch {
      // Local selection remains the offline fallback.
    }
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
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<BeeTemplateSelection>;
      return {
        public: typeof saved.public === 'string' ? saved.public : DEFAULT_SELECTION.public,
        dashboard: typeof saved.dashboard === 'string' ? saved.dashboard : DEFAULT_SELECTION.dashboard
      };
    } catch {
      return { ...DEFAULT_SELECTION };
    }
  }

  private persist(): void {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(this.selection));
  }
}
