import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BeeTemplateEngine } from './template-engine.service';
import type { BeeTemplateTarget } from './template.types';

@Component({
  selector: 'bee-template-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="bee-template-manager" aria-label="Template manager">
      <div class="bee-template-manager__heading">
        <div><span class="bee-template-manager__eyebrow">APPEARANCE</span><strong>Templates</strong></div>
        <span class="bee-template-manager__status">Live preview</span>
      </div>
      <div class="bee-template-manager__fields">
        <label>Public website
          <select [disabled]="engine.hasAuthenticatedSession && !engine.canManageTemplates" [ngModel]="engine.getSelection().public" (ngModelChange)="selectTemplate('public', $event)">
            <option *ngFor="let item of engine.list('public')" [value]="item.id">{{ item.name }}</option>
          </select>
        </label>
        <label>Dashboard
          <select [disabled]="engine.hasAuthenticatedSession && !engine.canManageTemplates" [ngModel]="engine.getSelection().dashboard" (ngModelChange)="selectTemplate('dashboard', $event)">
            <option *ngFor="let item of engine.list('dashboard')" [value]="item.id">{{ item.name }}</option>
          </select>
        </label>
      </div>
      @if (engine.hasPendingPreview) {
        <div class="bee-template-manager__preview-actions">
          <span>Preview only · changes are not published yet</span>
          <div><button type="button" (click)="discardPreview()">Discard preview</button><button type="button" (click)="publishPreview()">Apply template changes</button></div>
        </div>
      }
      @if (engine.canManageTemplates) {
        <div class="bee-template-manager__theme">
          <strong>Live theme tokens</strong>
          <div class="bee-template-manager__colors">
            <label>Background <input type="color" [ngModel]="engine.themeTokens['--bg']" (ngModelChange)="updateToken('--bg', $event)"></label>
            <label>Panels <input type="color" [ngModel]="engine.themeTokens['--panel']" (ngModelChange)="updateToken('--panel', $event)"></label>
            <label>Muted <input type="color" [ngModel]="engine.themeTokens['--muted']" (ngModelChange)="updateToken('--muted', $event)"></label>
            <label>Border <input type="color" [ngModel]="engine.themeTokens['--border']" (ngModelChange)="updateToken('--border', $event)"></label>
            <label>Accent <input type="color" [ngModel]="engine.themeTokens['--purple']" (ngModelChange)="updateToken('--purple', $event)"></label>
            <label>Secondary <input type="color" [ngModel]="engine.themeTokens['--cyan']" (ngModelChange)="updateToken('--cyan', $event)"></label>
          </div>
          <button type="button" class="bee-template-manager__save" [disabled]="saving" (click)="saveTheme()">{{ saving ? 'Saving…' : 'Save live theme' }}</button>
          @if (saveMessage) { <span class="bee-template-manager__message">{{ saveMessage }}</span> }
        </div>
        <div class="bee-template-manager__catalog">
          <strong>Template package catalog</strong>
          <p>Install trusted design packages for this tenant. They become available immediately to connected sessions.</p>
          @for (item of engine.catalog(); track item.id) {
            <div class="bee-template-package">
              <div><b>{{ item.name }}</b><small>{{ item.target }} · v{{ item.version }}</small><span>{{ item.description }}</span></div>
              @if (engine.isInstalled(item.id)) {
                <button type="button" [disabled]="installingId === item.id || isActive(item.id)" (click)="uninstall(item.id)">{{ installingId === item.id ? 'Working…' : isActive(item.id) ? 'Active' : 'Uninstall' }}</button>
              } @else {
                <button type="button" [disabled]="installingId === item.id" (click)="install(item.id)">{{ installingId === item.id ? 'Installing…' : 'Install' }}</button>
              }
            </div>
          }
          @if (packageMessage) { <span class="bee-template-manager__message">{{ packageMessage }}</span> }
        </div>
      }
      <p>Public and dashboard templates are selected independently. The tenant brand palette is shared across both surfaces and pushed to connected sessions without rebuilding or restarting the app.</p>
    </section>
  `,
})
export class BeeTemplateManagerComponent {
  saving = false;
  saveMessage = '';
  private draftTokens: Record<string, string> = {};
  installingId = '';
  packageMessage = '';

  constructor(readonly engine: BeeTemplateEngine) {}

  updateToken(key: string, value: string): void {
    this.draftTokens[key] = value;
    this.engine.themeTokens[key] = value;
    if (typeof document !== 'undefined') { document.documentElement.style.setProperty(key, value); document.body.dataset['beeCustomTheme'] = 'true'; }
  }

  async saveTheme(): Promise<void> {
    this.saving = true;
    this.saveMessage = '';
    try {
      const saved = await this.engine.saveThemeTokens(this.draftTokens);
      this.saveMessage = saved ? 'Applied to this tenant.' : 'Could not save theme.';
      if (saved) this.draftTokens = {};
    } catch {
      this.saveMessage = 'Could not save theme.';
    } finally {
      this.saving = false;
    }
  }

  isActive(id: string): boolean {
    const selection = this.engine.getCommittedSelection();
    return selection.public === id || selection.dashboard === id;
  }

  async install(id: string): Promise<void> {
    this.installingId = id; this.packageMessage = '';
    try { this.packageMessage = await this.engine.installTemplate(id) ? 'Package installed for this tenant.' : 'Package installation failed.'; }
    catch { this.packageMessage = 'Package installation failed.'; }
    finally { this.installingId = ''; }
  }

  async uninstall(id: string): Promise<void> {
    this.installingId = id; this.packageMessage = '';
    try { this.packageMessage = await this.engine.uninstallTemplate(id) ? 'Package removed from this tenant.' : 'Package could not be removed.'; }
    catch { this.packageMessage = 'Package could not be removed.'; }
    finally { this.installingId = ''; }
  }

  discardPreview(): void {
    this.engine.cancelPreview();
    this.draftTokens = {};
  }

  publishPreview(): void {
    this.engine.commitPreview();
    this.draftTokens = {};
  }

  selectTemplate(target: BeeTemplateTarget, id: string): void {
    if (this.engine.canManageTemplates) this.engine.preview(target, id);
    else this.engine.activate(target, id);
  }
}
