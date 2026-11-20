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
          <select [ngModel]="engine.getSelection().public" (ngModelChange)="activate('public', $event)">
            <option *ngFor="let item of engine.list('public')" [value]="item.id">{{ item.name }}</option>
          </select>
        </label>
        <label>Dashboard
          <select [ngModel]="engine.getSelection().dashboard" (ngModelChange)="activate('dashboard', $event)">
            <option *ngFor="let item of engine.list('dashboard')" [value]="item.id">{{ item.name }}</option>
          </select>
        </label>
      </div>
      @if (engine.hasAuthenticatedSession) {
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
      }
      <p>Each surface has an independent theme. Saved design tokens are pushed to connected sessions in this tenant without rebuilding or restarting the app.</p>
    </section>
  `,
})
export class BeeTemplateManagerComponent {
  saving = false;
  saveMessage = '';
  private draftTokens: Record<string, string> = {};

  constructor(readonly engine: BeeTemplateEngine) {}

  updateToken(key: string, value: string): void {
    this.draftTokens[key] = value;
    this.engine.themeTokens[key] = value;
    if (typeof document !== 'undefined') document.documentElement.style.setProperty(key, value);
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

  activate(target: BeeTemplateTarget, id: string): void {
    this.engine.activate(target, id);
  }
}
