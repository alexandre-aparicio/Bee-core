import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BeeI18nService } from '../i18n/bee-i18n.service';
import { BeeIconComponent } from '../core/icons/bee-icon.component';

type CompanyProfile = {
  legalName: string; taxId: string; email: string; phone: string; website: string;
  addressLine1: string; addressLine2: string; city: string; region: string;
  postalCode: string; country: string; industry: string; description: string;
};
const EMPTY_PROFILE: CompanyProfile = {
  legalName: '', taxId: '', email: '', phone: '', website: '',
  addressLine1: '', addressLine2: '', city: '', region: '',
  postalCode: '', country: '', industry: '', description: ''
};

@Component({
  selector: 'bee-company-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, BeeIconComponent],
  template: `
    <section class="bee-company" aria-label="Company profile">
      @if (loading) {
        <div class="bee-company__loading" role="status">
          <span class="bee-company__spinner" aria-hidden="true"></span>
          <span>{{t('company.loading')}}</span>
        </div>
      } @else {
        @if (error) {
          <div class="bee-company__notice bee-company__notice--error" role="alert">
            <span>{{error}}</span>
            <button type="button" class="bee-company__button bee-company__button--secondary" (click)="load()">
              <bee-icon name="refresh" size="14px" aria-hidden="true"></bee-icon>{{t('company.retry')}}
            </button>
          </div>
        }
        @if (saved) {
          <div class="bee-company__notice bee-company__notice--success" role="status">
            <bee-icon name="check" size="15px" aria-hidden="true"></bee-icon>{{t('company.saved')}}
          </div>
        }

        <div class="bee-company__identity">
          <div class="bee-company__identity-mark" aria-hidden="true"><bee-icon name="company" size="24px"></bee-icon></div>
          <div class="bee-company__identity-copy">
            <span class="bee-company__eyebrow">{{t('company.profile')}}</span>
            <h2>{{companyName || tenantName}}</h2>
            <p>{{profile.industry || t('company.industry')}}</p>
          </div>
          <span class="bee-company__scope">{{t('company.scope')}}</span>
        </div>

        <form class="bee-company__form" (ngSubmit)="save()">
          <section class="bee-company__section">
            <header class="bee-company__section-head">
              <div><h3>{{t('company.basic')}}</h3><p>{{t('company.basicDescription')}}</p></div>
              <bee-icon name="building2" size="18px" aria-hidden="true"></bee-icon>
            </header>
            <div class="bee-company__fields">
              <label class="bee-company__field bee-company__field--wide">
                <span>{{t('company.name')}}</span>
                <input [(ngModel)]="companyName" [disabled]="!canEdit" name="companyName" maxlength="120" required autocomplete="organization">
              </label>
              <label class="bee-company__field">
                <span>{{t('company.legalName')}}</span>
                <input [(ngModel)]="profile.legalName" [disabled]="!canEdit" name="legalName" maxlength="160" autocomplete="off">
              </label>
              <label class="bee-company__field">
                <span>{{t('company.taxId')}}</span>
                <input [(ngModel)]="profile.taxId" [disabled]="!canEdit" name="taxId" maxlength="80" autocomplete="off">
              </label>
              <label class="bee-company__field">
                <span>{{t('company.industry')}}</span>
                <input [(ngModel)]="profile.industry" [disabled]="!canEdit" name="industry" maxlength="120">
              </label>
              <label class="bee-company__field bee-company__field--wide">
                <span>{{t('company.description')}}</span>
                <textarea [(ngModel)]="profile.description" [disabled]="!canEdit" name="description" rows="3" maxlength="1000"></textarea>
              </label>
            </div>
          </section>

          <section class="bee-company__section">
            <header class="bee-company__section-head">
              <div><h3>{{t('company.contact')}}</h3><p>{{t('company.contactDescription')}}</p></div>
              <bee-icon name="mail" size="18px" aria-hidden="true"></bee-icon>
            </header>
            <div class="bee-company__fields bee-company__fields--contact">
              <label class="bee-company__field">
                <span>{{t('company.email')}}</span>
                <input [(ngModel)]="profile.email" [disabled]="!canEdit" name="email" type="email" maxlength="160" autocomplete="email">
              </label>
              <label class="bee-company__field">
                <span>{{t('company.phone')}}</span>
                <input [(ngModel)]="profile.phone" [disabled]="!canEdit" name="phone" type="tel" maxlength="60" autocomplete="tel">
              </label>
              <label class="bee-company__field bee-company__field--wide">
                <span>{{t('company.website')}}</span>
                <input [(ngModel)]="profile.website" [disabled]="!canEdit" name="website" type="url" maxlength="240" placeholder="https://" autocomplete="url">
              </label>
            </div>
          </section>

          <section class="bee-company__section">
            <header class="bee-company__section-head">
              <div><h3>{{t('company.address')}}</h3><p>{{t('company.addressDescription')}}</p></div>
              <bee-icon name="globe" size="18px" aria-hidden="true"></bee-icon>
            </header>
            <div class="bee-company__fields">
              <label class="bee-company__field bee-company__field--wide">
                <span>{{t('company.addressLine1')}}</span>
                <input [(ngModel)]="profile.addressLine1" [disabled]="!canEdit" name="addressLine1" maxlength="180" autocomplete="address-line1">
              </label>
              <label class="bee-company__field bee-company__field--wide">
                <span>{{t('company.addressLine2')}}</span>
                <input [(ngModel)]="profile.addressLine2" [disabled]="!canEdit" name="addressLine2" maxlength="180" autocomplete="address-line2">
              </label>
              <label class="bee-company__field">
                <span>{{t('company.city')}}</span>
                <input [(ngModel)]="profile.city" [disabled]="!canEdit" name="city" maxlength="120" autocomplete="address-level2">
              </label>
              <label class="bee-company__field">
                <span>{{t('company.region')}}</span>
                <input [(ngModel)]="profile.region" [disabled]="!canEdit" name="region" maxlength="120" autocomplete="address-level1">
              </label>
              <label class="bee-company__field">
                <span>{{t('company.postalCode')}}</span>
                <input [(ngModel)]="profile.postalCode" [disabled]="!canEdit" name="postalCode" maxlength="40" autocomplete="postal-code">
              </label>
              <label class="bee-company__field">
                <span>{{t('company.country')}}</span>
                <input [(ngModel)]="profile.country" [disabled]="!canEdit" name="country" maxlength="120" autocomplete="country-name">
              </label>
            </div>
          </section>

          <footer class="bee-company__footer">
            <p>{{canEdit ? t('company.note') : t('company.readOnly')}}</p>
            @if (canEdit) {
              <div class="bee-company__footer-actions">
                @if (dirty) {
                  <span class="bee-company__unsaved">{{t('company.unsaved')}}</span>
                }
                <button type="submit" class="bee-company__button bee-company__button--primary" [disabled]="saving || !dirty || !companyName.trim()">
                  @if (saving) { <span class="bee-company__button-spinner" aria-hidden="true"></span> }
                  {{saving ? t('company.saving') : t('company.save')}}
                </button>
              </div>
            }
          </footer>
        </form>
      }
    </section>
  `,
  styles: [`
    :host{display:block;width:100%;min-width:0;color:inherit}
    .bee-company{display:grid;gap:16px;min-width:0;color:var(--bee-text,inherit)}
    .bee-company__identity{display:flex;align-items:center;gap:14px;padding:18px 20px;border:1px solid var(--border);border-radius:14px;background:var(--panel);min-width:0}
    .bee-company__identity-mark{width:46px;height:46px;display:grid;place-items:center;flex:none;border:1px solid color-mix(in srgb,var(--purple) 32%,var(--border));border-radius:12px;background:color-mix(in srgb,var(--purple) 10%,var(--panel));color:var(--purple)}
    .bee-company__identity-copy{min-width:0;flex:1}
    .bee-company__eyebrow{display:block;color:var(--muted);font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px}
    .bee-company__identity h2{font-size:18px;line-height:1.3;font-weight:650;margin:0;overflow-wrap:anywhere}
    .bee-company__identity p{font-size:12px;color:var(--muted);margin:4px 0 0}
    .bee-company__scope{flex:none;padding:6px 10px;border:1px solid var(--border);border-radius:999px;color:var(--muted);font-size:11px}
    .bee-company__form{display:grid;gap:14px;min-width:0}
    .bee-company__section{min-width:0;padding:20px;border:1px solid var(--border);border-radius:14px;background:var(--panel)}
    .bee-company__section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:18px}
    .bee-company__section-head h3{font-size:14px;line-height:1.4;font-weight:650;margin:0}
    .bee-company__section-head p{font-size:12px;line-height:1.5;color:var(--muted);margin:4px 0 0}
    .bee-company__section-head>bee-icon{color:var(--muted);margin-top:2px}
    .bee-company__fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 18px}
    .bee-company__field{display:grid;gap:7px;min-width:0;color:var(--muted);font-size:12px;font-weight:600}
    .bee-company__field--wide{grid-column:1/-1}
    .bee-company__field input,.bee-company__field textarea{box-sizing:border-box;width:100%;min-width:0;min-height:42px;padding:10px 12px;border:1px solid var(--border);border-radius:9px;background:var(--bg);color:inherit;font:inherit;font-size:13px;font-weight:450;outline:none;transition:border-color .16s,box-shadow .16s,background .16s}
    .bee-company__field textarea{min-height:88px;resize:vertical;line-height:1.5}
    .bee-company__field input::placeholder,.bee-company__field textarea::placeholder{color:var(--muted)}
    .bee-company__field input:focus-visible,.bee-company__field textarea:focus-visible{border-color:var(--purple);box-shadow:0 0 0 3px color-mix(in srgb,var(--purple) 22%,transparent)}
    .bee-company__field input:disabled,.bee-company__field textarea:disabled{opacity:.72;cursor:not-allowed}
    .bee-company__footer{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:4px 2px 2px}
    .bee-company__footer>p{margin:0;color:var(--muted);font-size:11px;line-height:1.5}
    .bee-company__footer-actions{display:flex;align-items:center;justify-content:flex-end;gap:12px}
    .bee-company__unsaved{font-size:11px;color:var(--bee-status-warning)}
    .bee-company__button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:9px 15px;border:1px solid transparent;border-radius:9px;font:inherit;font-size:12px;font-weight:650;cursor:pointer;transition:background .16s,border-color .16s,opacity .16s}
    .bee-company__button:focus-visible{outline:2px solid var(--purple);outline-offset:2px}
    .bee-company__button:disabled{opacity:.48;cursor:not-allowed}
    .bee-company__button--primary{background:var(--purple);color:var(--bee-action-text);border-color:var(--purple)}
    .bee-company__button--primary:hover:not(:disabled){filter:brightness(1.08)}
    .bee-company__button--secondary{background:var(--panel);color:inherit;border-color:var(--border)}
    .bee-company__button--secondary:hover:not(:disabled){background:var(--bg)}
    .bee-company__notice{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 14px;border:1px solid var(--border);border-radius:10px;font-size:12px}
    .bee-company__notice--error{color:var(--bee-status-danger);border-color:color-mix(in srgb,var(--bee-status-danger) 35%,var(--border));background:color-mix(in srgb,var(--bee-status-danger) 7%,var(--panel))}
    .bee-company__notice--success{justify-content:flex-start;color:var(--bee-status-success);border-color:color-mix(in srgb,var(--bee-status-success) 30%,var(--border));background:color-mix(in srgb,var(--bee-status-success) 7%,var(--panel))}
    .bee-company__loading{display:flex;align-items:center;gap:12px;padding:28px 20px;border:1px solid var(--border);border-radius:14px;background:var(--panel);color:var(--muted);font-size:12px}
    .bee-company__spinner,.bee-company__button-spinner{width:15px;height:15px;border:2px solid color-mix(in srgb,var(--muted) 28%,transparent);border-top-color:var(--purple);border-radius:50%;animation:bee-company-spin .8s linear infinite}
    .bee-company__button-spinner{width:12px;height:12px;border-color:currentColor;border-top-color:transparent}
    @keyframes bee-company-spin{to{transform:rotate(360deg)}}
    @media(max-width:700px){.bee-company__identity{align-items:flex-start;flex-wrap:wrap;padding:16px}.bee-company__scope{margin-inline-start:60px}.bee-company__section{padding:16px}.bee-company__fields{grid-template-columns:1fr;gap:14px}.bee-company__field--wide{grid-column:auto}.bee-company__footer{align-items:flex-start;flex-direction:column}.bee-company__footer-actions{width:100%;justify-content:space-between}.bee-company__button--primary{margin-inline-start:auto}}
    @media(prefers-reduced-motion:reduce){.bee-company__spinner,.bee-company__button-spinner{animation:none}.bee-company__field input,.bee-company__field textarea,.bee-company__button{transition:none}}
  `]
})
export class CompanyProfileComponent implements OnChanges {
  @Input() tenantId = '';
  @Input() role = '';
  @Input() accessToken = '';
  @Input() tenantName = 'Company';

  companyName = '';
  profile: CompanyProfile = { ...EMPTY_PROFILE };
  loading = false;
  saving = false;
  error = '';
  saved = false;
  private loadKey = '';
  private original = '';

  constructor(private i18n: BeeI18nService) {}

  get canEdit(): boolean {
    return ['owner', 'admin', 'super_admin'].includes((this.role || '').toLowerCase());
  }
  get dirty(): boolean {
    return JSON.stringify({ name: this.companyName, profile: this.profile }) !== this.original;
  }
  t(key: string): string { return this.i18n.t('organization:' + key); }

  ngOnChanges(): void {
    const key = this.tenantId + ':' + this.accessToken;
    if (!this.tenantId || key === this.loadKey) return;
    this.loadKey = key;
    void this.load();
  }

  async load(): Promise<void> {
    if (!this.tenantId) return;
    this.loading = true;
    this.error = '';
    this.saved = false;
    try {
      const response = await fetch('/api/companies/' + encodeURIComponent(this.tenantId) + '/profile', {
        credentials: 'same-origin',
        headers: { authorization: 'Bearer ' + this.accessToken }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || this.t('company.errorLoad'));
      this.companyName = data.name || this.tenantName;
      this.profile = { ...EMPTY_PROFILE, ...data.profile };
      this.original = this.snapshot();
    } catch {
      this.error = this.t('company.errorLoad');
    } finally {
      this.loading = false;
    }
  }

  async save(): Promise<void> {
    if (this.saving || !this.canEdit || !this.dirty || !this.companyName.trim()) return;
    this.saving = true;
    this.error = '';
    this.saved = false;
    try {
      const response = await fetch('/api/companies/' + encodeURIComponent(this.tenantId) + '/profile', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + this.accessToken },
        body: JSON.stringify({ name: this.companyName, profile: this.profile })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || this.t('company.errorSave'));
      this.companyName = data.name || this.companyName;
      this.profile = { ...EMPTY_PROFILE, ...data.profile };
      this.original = this.snapshot();
      this.saved = true;
    } catch {
      this.error = this.t('company.errorSave');
    } finally {
      this.saving = false;
    }
  }

  private snapshot(): string {
    return JSON.stringify({ name: this.companyName, profile: this.profile });
  }
}
