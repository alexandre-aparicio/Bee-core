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

      <div class="bee-template-manager__fields">
        @if (target !== 'public') {
          <article class="bee-template-card">
            <h3>01 · Dashboard</h3><p>Private workspace</p>
            <label>Dashboard template<select [disabled]="engine.hasAuthenticatedSession && !engine.canManageTemplates" [ngModel]="engine.getSelection().dashboard" (ngModelChange)="selectTemplate('dashboard',$event)">@for(item of engine.list('dashboard');track item.id){<option [value]="item.id">{{item.name}}</option>}</select></label>
            <img [src]="engine.getActive('dashboard').previewUrl" [alt]="engine.getActive('dashboard').name + ' dashboard preview'">
          </article>
        }
        @if (target !== 'dashboard') {
          <article class="bee-template-card">
            <h3>02 · Public Website</h3><p>Customer-facing experience</p>
            <label>Public website template<select [disabled]="engine.hasAuthenticatedSession && !engine.canManageTemplates" [ngModel]="engine.getSelection().public" (ngModelChange)="selectTemplate('public',$event)">@for(item of engine.list('public');track item.id){<option [value]="item.id">{{item.name}}</option>}</select></label>
            <img [src]="engine.getActive('public').previewUrl" [alt]="engine.getActive('public').name + ' website preview'">
          </article>
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
          <p>Install a trusted template package before selecting it. Each template includes a visual preview of its layout.</p>
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

    </section>
  `,
  styles: [`
    .bee-template-manager__fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .bee-template-card{min-width:0;padding:13px;border:1px solid var(--border,#8885);border-radius:12px}
    .bee-template-card h3{font-size:13px;margin:0}.bee-template-card p{font-size:10px;opacity:.6;margin:3px 0 12px}
    .bee-template-card label{display:grid;gap:6px;font-size:10px;font-weight:600}
    .bee-template-card select{width:100%;padding:8px;border:1px solid var(--border,#8885);border-radius:8px;background:transparent;color:inherit}
    .bee-template-card img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;margin-top:10px;border:1px solid var(--border,#8885);border-radius:9px;background:var(--bg,#8881)}
    @media(max-width:640px){.bee-template-manager__fields{grid-template-columns:1fr}}
  `]
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


  discardPreview(): void { this.engine.cancelPreview(); }
  publishPreview(): void { this.engine.commitPreview(); }
  selectTemplate(target: BeeTemplateTarget, id: string): void {
    if (this.engine.canManageTemplates) this.engine.preview(target, id);
    else this.engine.activate(target, id);
  }
}
