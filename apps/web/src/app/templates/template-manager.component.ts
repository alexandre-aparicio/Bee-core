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
        <div class="bee-template-manager__catalog-heading">
          <div>
            <strong>Available template packages</strong>
            <p>Install a trusted template package before selecting it. Each template includes a visual preview of its layout.</p>
          </div>
          <span class="bee-template-manager__count">{{catalogPackages.length}} packages</span>
        </div>
        @if (!engine.canManageTemplates) { <p class="bee-template-manager__message">Template options are available to tenant administrators and platform superadministrators.</p> }
        <div class="bee-template-manager__package-grid">
          @for (item of visiblePackages; track item.id) {
            <article class="bee-template-package">
              <img class="bee-template-package__preview" [src]="item.previewUrl" [alt]="item.name + ' template preview'" loading="lazy">
              <div class="bee-template-package__body">
                <div class="bee-template-package__meta">
                  <b>{{item.name}}</b>
                  <small>{{item.target}} · v{{item.version}}</small>
                </div>
                <span class="bee-template-package__description">{{item.description}}</span>
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
            </article>
          }
        </div>
        @if (totalPages > 1) {
          <nav class="bee-template-manager__pagination" aria-label="Template package pages">
            <span class="bee-template-manager__page-summary">Showing {{pageStart + 1}}–{{pageEnd}} of {{catalogPackages.length}} packages</span>
            <div class="bee-template-manager__page-controls">
              <button type="button" class="bee-template-manager__page-arrow" [disabled]="currentPage === 1" (click)="previousPage()" aria-label="Previous page">‹ <span>Previous</span></button>
              @for (page of pageNumbers; track page) {
                <button type="button" class="bee-template-manager__page-number" [class.is-active]="currentPage === page" [attr.aria-current]="currentPage === page ? 'page' : null" [attr.aria-label]="'Page ' + page" (click)="goToPage(page)">{{page}}</button>
              }
              <button type="button" class="bee-template-manager__page-arrow" [disabled]="currentPage === totalPages" (click)="nextPage()" aria-label="Next page"><span>Next</span> ›</button>
            </div>
          </nav>
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
    .bee-template-manager__catalog{margin-top:22px}
    .bee-template-manager__catalog-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px}
    .bee-template-manager__catalog-heading>div{min-width:0}
    .bee-template-manager__catalog-heading p{font-size:12px;opacity:.65;margin:5px 0 0}
    .bee-template-manager__count{flex:none;padding:5px 9px;border:1px solid var(--border,#8885);border-radius:999px;font-size:11px;opacity:.75}
    .bee-template-manager__package-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .bee-template-package{display:flex;min-width:0;flex-direction:column;overflow:hidden;border:1px solid var(--border,#8885);border-radius:12px;background:var(--panel,transparent)}
    .bee-template-package__preview{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:var(--bg,#8881);border-bottom:1px solid var(--border,#8885)}
    .bee-template-package__body{display:flex;flex:1;flex-direction:column;align-items:flex-start;gap:9px;padding:12px}
    .bee-template-package__meta{display:flex;width:100%;align-items:center;justify-content:space-between;gap:8px}
    .bee-template-package__meta b{font-size:13px}.bee-template-package__meta small{font-size:10px;opacity:.6;white-space:nowrap}
    .bee-template-package__description{min-height:34px;font-size:11px;line-height:1.5;opacity:.72}
    .bee-template-package__body button{margin-top:auto}
    .bee-template-manager__pagination{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px;padding-top:13px;border-top:1px solid var(--border,#8885)}
    .bee-template-manager__page-summary{font-size:11px;opacity:.7}
    .bee-template-manager__page-controls{display:flex;align-items:center;gap:5px}
    .bee-template-manager__page-controls button{min-width:32px;height:32px;padding:0 8px;border:1px solid var(--border,#8885);border-radius:8px;background:transparent;color:inherit;font-size:12px}
    .bee-template-manager__page-controls button:disabled{opacity:.35;cursor:not-allowed}
    .bee-template-manager__page-controls .is-active{background:var(--purple,#8c72ff);border-color:var(--purple,#8c72ff);color:white}
    .bee-template-manager__page-arrow{white-space:nowrap}
    .bee-template-manager__page-arrow span{font-size:11px}
    @media(max-width:640px){.bee-template-manager__fields,.bee-template-manager__package-grid{grid-template-columns:1fr}.bee-template-manager__pagination{align-items:flex-start;flex-direction:column}.bee-template-manager__page-controls{width:100%;justify-content:space-between}.bee-template-manager__catalog-heading{align-items:center}}
  `]
})
export class BeeTemplateManagerComponent {
  @Input() target: 'dashboard' | 'public' | 'all' = 'all';
  installingId = '';
  packageMessage = '';
  currentPage = 1;
  readonly pageSize = 4;

  constructor(readonly engine: BeeTemplateEngine) {}

  get catalogPackages() {
    return this.engine.catalog(this.target === 'all' ? undefined : this.target);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.catalogPackages.length / this.pageSize));
  }

  get visiblePackages() {
    return this.catalogPackages.slice(this.pageStart, this.pageStart + this.pageSize);
  }

  get pageStart(): number {
    return (Math.min(this.currentPage, this.totalPages) - 1) * this.pageSize;
  }

  get pageEnd(): number {
    return Math.min(this.pageStart + this.pageSize, this.catalogPackages.length);
  }

  get pageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, index) => index + 1);
  }

  goToPage(page: number): void {
    this.currentPage = Math.max(1, Math.min(page, this.totalPages));
  }

  previousPage(): void { this.goToPage(this.currentPage - 1); }
  nextPage(): void { this.goToPage(this.currentPage + 1); }

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
