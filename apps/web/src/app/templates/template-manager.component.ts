import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BeeTemplateEngine } from './template-engine.service';
import type { BeeTemplateTarget } from './template.types';

@Component({
  selector: 'bee-template-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="bee-template-manager bee-dashboard-card" aria-label="Template manager">
      <div class="bee-template-manager__heading">
        <div>
          <span class="bee-template-manager__eyebrow">TEMPLATES</span>
          <strong>{{target === 'dashboard' ? 'Dashboard template' : target === 'public' ? 'Website template' : 'Template library'}}</strong>
        </div>
        <span class="bee-template-manager__status">Preview before applying</span>
      </div>

      <div class="bee-template-manager__mode-controls">
        @if (target !== 'dashboard') {
          <div class="bee-template-mode">
            <span>Website · {{engine.getActive('public').name}}</span>
            <div role="group" aria-label="Website appearance mode">
              <button type="button" [class.active]="mode('public') === 'light'" (click)="setMode('public','light')">☀ Light</button>
              <button type="button" [class.active]="mode('public') === 'dark'" (click)="setMode('public','dark')">☾ Dark</button>
            </div>
          </div>
        }
        @if (target !== 'public') {
          <div class="bee-template-mode">
            <span>Dashboard · {{engine.getActive('dashboard').name}}</span>
            <div role="group" aria-label="Dashboard appearance mode">
              <button type="button" [class.active]="mode('dashboard') === 'light'" (click)="setMode('dashboard','light')">☀ Light</button>
              <button type="button" [class.active]="mode('dashboard') === 'dark'" (click)="setMode('dashboard','dark')">☾ Dark</button>
            </div>
          </div>
        }
      </div>

      <div class="bee-template-manager__fields">
        @if (target !== 'dashboard') {
          <label>Website template
            <select [disabled]="engine.hasAuthenticatedSession && !engine.canManageTemplates"
              [ngModel]="engine.getSelection().public"
              (ngModelChange)="selectTemplate('public', $event)">
              <option *ngFor="let item of engine.list('public')" [value]="item.id">{{ item.name }}</option>
            </select>
          </label>
        }
        @if (target !== 'public') {
          <label>Dashboard template
            <select [disabled]="engine.hasAuthenticatedSession && !engine.canManageTemplates"
              [ngModel]="engine.getSelection().dashboard"
              (ngModelChange)="selectTemplate('dashboard', $event)">
              <option *ngFor="let item of engine.list('dashboard')" [value]="item.id">{{ item.name }}</option>
            </select>
          </label>
        }
      </div>

      @if (engine.hasPendingPreview) {
        <div class="bee-template-manager__preview-actions">
          <span>Preview only · changes are not published</span>
          <div>
            <button type="button" (click)="discardPreview()">Discard</button>
            <button type="button" (click)="publishPreview()">Apply template</button>
          </div>
        </div>
      }

      <div class="bee-template-manager__catalog">
          <strong>Available template packages</strong>
          <p>Install a trusted template package before selecting it. Each template owns its predefined visual identity and supported appearance modes.</p>
          @if (!engine.canManageTemplates) { <p class="bee-template-manager__message">Template options are available to tenant administrators and platform superadministrators.</p> }
          @for (item of engine.catalog(target === 'all' ? undefined : target); track item.id) {
            <div class="bee-template-package">
              <div>
                <b>{{item.name}}</b>
                <small>{{item.target}} · v{{item.version}}</small>
                <span>{{item.description}}</span>
              </div>
              @if (engine.isInstalled(item.id)) {
                <button type="button" [disabled]="!engine.canManageTemplates || installingId === item.id || isActive(item.id,item.target)" (click)="uninstall(item.id)">
                  {{installingId === item.id ? 'Working…' : isActive(item.id,item.target) ? 'Active' : 'Uninstall'}}
                </button>
              } @else {
                <button type="button" [disabled]="!engine.canManageTemplates || installingId === item.id" (click)="install(item.id)">
                  {{installingId === item.id ? 'Installing…' : 'Install'}}
                </button>
              }
            </div>
          }
          @if (packageMessage) { <span class="bee-template-manager__message">{{packageMessage}}</span> }
        </div>

      <p>Template packages define layout and a controlled palette. Users do not choose arbitrary colors. Dashboard light/dark appearance is a mode of the selected template, not a separate color editor. Business plugins remain independent and contribute features through registered slots.</p>
    </section>
  `,
})
export class BeeTemplateManagerComponent {
  @Input() target: 'dashboard' | 'public' | 'all' = 'all';
  installingId = '';
  packageMessage = '';

  constructor(readonly engine: BeeTemplateEngine) {}

  isActive(id: string, target: BeeTemplateTarget): boolean {
    return this.engine.getCommittedSelection()[target] === id;
  }

  async install(id: string): Promise<void> {
    this.installingId = id;
    this.packageMessage = '';
    try {
      this.packageMessage = await this.engine.installTemplate(id)
        ? 'Template installed for this company.'
        : 'Template installation failed.';
    } catch {
      this.packageMessage = 'Template installation failed.';
    } finally {
      this.installingId = '';
    }
  }

  async uninstall(id: string): Promise<void> {
    this.installingId = id;
    this.packageMessage = '';
    try {
      this.packageMessage = await this.engine.uninstallTemplate(id)
        ? 'Template removed from this company.'
        : 'Template could not be removed.';
    } catch {
      this.packageMessage = 'Template could not be removed.';
    } finally {
      this.installingId = '';
    }
  }

  mode(target: BeeTemplateTarget): 'light' | 'dark' { return this.engine.getMode(target); }
  setMode(target: BeeTemplateTarget, mode: 'light' | 'dark'): void { this.engine.setMode(target, mode); }

  discardPreview(): void { this.engine.cancelPreview(); }
  publishPreview(): void { this.engine.commitPreview(); }
  selectTemplate(target: BeeTemplateTarget, id: string): void {
    if (this.engine.canManageTemplates) this.engine.preview(target, id);
    else this.engine.activate(target, id);
  }
}
