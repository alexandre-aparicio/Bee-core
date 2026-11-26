import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BeeI18nService } from '../i18n/bee-i18n.service';
import { Component, Input, OnChanges } from '@angular/core';
import { BeeTemplateManagerComponent } from '../templates/template-manager.component';
import { PlatformIdentityComponent } from './platform-identity.component';
import { BeeIconComponent } from '../core/icons/bee-icon.component';

type SettingGroup = { title: string; description: string; fields: string[]; note: string };

@Component({
  selector: 'bee-settings-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule, BeeTemplateManagerComponent, PlatformIdentityComponent, BeeIconComponent],
  template: `
    <section class="settings-workspace">
      <header class="settings-workspace__heading">
        <div class="bee-company__identity-copy">
          <span class="bee-company__eyebrow">{{scope === 'platform' ? 'Settings / Platform' : 'Settings / Organization'}}</span>
          <h1>{{sectionTitle}}</h1><p>{{sectionDescription}}</p>
        </div>
      </header>

      @if (section === 'general') {
        <div class="settings-workspace__general">
          <article class="settings-workspace__card settings-workspace__card--identity">
            <bee-platform-identity [accessToken]="accessToken" [editable]="scope === 'platform'"></bee-platform-identity>
          </article>
          <article class="settings-workspace__card">
            <div class="settings-workspace__card-heading"><span class="bee-company__identity-mark" aria-hidden="true"><bee-icon name="themes" size="24px"></bee-icon></span><div><h2>Appearance</h2><p>Themes, branding, typography and global visual preferences.</p></div></div>
            <bee-template-manager target="all"></bee-template-manager>
          </article>
          <article class="settings-workspace__card settings-workspace__card--preferences">
            <div class="settings-workspace__card-heading"><span class="bee-company__identity-mark" aria-hidden="true"><bee-icon name="settings" size="24px"></bee-icon></span><div><h2>Platform Preferences</h2><p>Platform-wide experience and interaction preferences.</p></div></div>
            <div class="settings-workspace__preference-list">
              <div><strong>Notifications</strong><span>Global notification and alert experience.</span></div>
              <div><strong>Interface behavior</strong><span>General navigation and interaction preferences.</span></div>
              <div><strong>User experience</strong><span>Small quality-of-life defaults across the platform.</span></div>
            </div>
            <p class="settings-workspace__notice">Preference controls are not connected to a settings API yet.</p>
          </article>
          <article class="settings-workspace__card settings-workspace__card--defaults">
            <div class="settings-workspace__card-heading"><span class="bee-company__identity-mark" aria-hidden="true"><bee-icon name="general" size="24px"></bee-icon></span><div><h2>Platform Defaults</h2><p>Global fallback values and policies inherited by modules, tenants and applications unless explicitly overridden.</p></div></div>
            <nav class="settings-workspace__default-tabs" aria-label="Platform Defaults sections">
              @for (tab of defaultTabs; track tab.id) {
                <button type="button" [class.is-active]="activeDefaultsTab===tab.id" [attr.aria-selected]="activeDefaultsTab===tab.id" (click)="activeDefaultsTab=tab.id"><span>{{tab.number}}</span>{{tab.label}}</button>
              }
            </nav>
            @for (tab of defaultTabs; track tab.id) {
              @if (activeDefaultsTab===tab.id) {
                <section class="settings-workspace__default-panel">
                  <div class="settings-workspace__default-intro"><h3>{{tab.title}}</h3><p>{{tab.description}}</p></div>
                  <div class="settings-workspace__default-groups">
                    @for (group of tab.groups; track group.title) {
                      <div class="settings-workspace__default-group">
                        <h4>{{group.title}}</h4><p>{{group.description}}</p>
                        <div class="settings-workspace__default-fields">
                          @for (field of group.fields; track field) {
                            <label>{{field}}<span class="settings-workspace__unavailable">Not configured · settings API unavailable</span></label>
                          }
                        </div>
                      </div>
                    }
                  </div>
                  <p class="settings-workspace__notice">{{tab.note}}</p>
                </section>
              }
            }
          </article>
        </div>
      } @else if (section === 'localization') {
        <article class="settings-workspace__card settings-workspace__language">
          <div class="settings-workspace__card-heading"><span class="bee-company__identity-mark" aria-hidden="true"><bee-icon name="localization" size="24px"></bee-icon></span><div><h2>{{tr('localization.title')}}</h2><p>{{tr('localization.description')}}</p></div></div>
          @if(languageLoading){<p class="settings-workspace__notice">{{tr('localization.loading')}}</p>}
          @else {
            <div class="settings-workspace__language-grid">
              <label>{{tr('localization.teamTitle')}}
                <small>{{tr('localization.teamDescription')}}</small>
                <select [(ngModel)]="teamDefaultLanguage" [disabled]="!canManageTeamDefault">
                  <option value="en">{{tr('localization.english')}}</option>
                  <option value="es">{{tr('localization.spanish')}}</option>
                </select>
              </label>
              <label>{{tr('localization.userTitle')}}
                <small>{{tr('localization.userDescription')}}</small>
                <select [(ngModel)]="userLanguage">
                  <option value="">{{tr('localization.inherit')}}</option>
                  <option value="en">{{tr('localization.english')}}</option>
                  <option value="es">{{tr('localization.spanish')}}</option>
                </select>
              </label>
            </div>
            @if(!canManageTeamDefault){<p class="settings-workspace__notice">{{tr('localization.permission')}}</p>}
            @if(languageError){<p class="settings-workspace__language-error bee-status--danger">{{languageError}}</p>}
            @if(languageMessage){<p class="settings-workspace__language-success bee-status--success">{{languageMessage}}</p>}
            <button type="button" class="settings-workspace__language-save" [disabled]="languageSaving" (click)="saveLanguagePreferences()">{{languageSaving ? '…' : tr('localization.save')}}</button>
          }
        </article>
      } @else {
        <div class="settings-workspace__groups">
          @for (group of groups; track group.title) {
            <article class="settings-workspace__card">
              <div class="settings-workspace__card-heading"><span class="settings-workspace__icon">{{icon}}</span><div><h2>{{group.title}}</h2><p>{{group.description}}</p></div></div>
              <div class="settings-workspace__fields">
                @for (field of group.fields; track field) {
                  <label>{{field}}<div class="settings-workspace__unavailable">Not configured · backend setting unavailable</div></label>
                }
              </div>
              <p class="settings-workspace__notice">{{group.note}}</p>
            </article>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    :host{display:block;width:100%;min-width:0;color:inherit}.settings-workspace{display:block;width:100%;max-width:none;min-width:0;box-sizing:border-box}.settings-workspace__heading{display:flex;align-items:center;margin:4px 0 25px;padding:0;border:0;border-radius:0;background:transparent;min-width:0}.bee-company__identity-mark{width:46px;height:46px;display:grid;place-items:center;flex:none;border:1px solid color-mix(in srgb,var(--bee-accent) 32%,var(--bee-border));border-radius:12px;background:color-mix(in srgb,var(--bee-accent) 10%,var(--bee-surface));color:var(--bee-accent)}.bee-company__identity-copy{min-width:0;flex:1}.bee-company__eyebrow{display:block;color:var(--bee-text-muted);font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px}.settings-workspace__heading h1{font-size:18px;line-height:1.3;font-weight:650;margin:0;overflow-wrap:anywhere}.settings-workspace__heading p{font-size:12px;color:var(--bee-text-muted);margin:4px 0 0;max-width:720px;line-height:1.5}.settings-workspace__scope{border:1px solid var(--bee-border);border-radius:30px;padding:7px 11px;font-size:11px;opacity:.75;white-space:nowrap}.settings-workspace__general,.settings-workspace__groups{display:grid;gap:16px;grid-template-columns:repeat(2,minmax(0,1fr))}.settings-workspace__language{max-width:900px}.settings-workspace__language-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.settings-workspace__language-grid label{display:grid;gap:8px;font-size:12px;font-weight:700}.settings-workspace__language-grid small{font-size:11px;line-height:1.5;font-weight:400;opacity:.65}.settings-workspace__language-grid select{min-height:40px;padding:9px 11px;border:1px solid var(--bee-border);border-radius:9px;background:var(--bee-surface);color:inherit;font:inherit}.settings-workspace__language-save{margin-top:18px;padding:10px 16px;border:0;border-radius:9px;background:var(--bee-accent);color:var(--bee-accent-text);font-weight:700;cursor:pointer}.settings-workspace__language-save:disabled{opacity:.55}.settings-workspace__language-error,.settings-workspace__language-success{font-size:12px;margin:12px 0 0}.settings-workspace__language-error{color:var(--bee-status-danger)}.settings-workspace__language-success{color:var(--bee-status-success)}.settings-workspace__card{min-width:0;padding:21px;border:1px solid var(--bee-border);border-radius:16px;background:var(--bee-surface)}.settings-workspace__card--identity{padding:0;border:0;background:transparent}.settings-workspace__card-heading{display:flex;gap:13px;align-items:flex-start;margin-bottom:18px}.settings-workspace__icon{display:grid;place-items:center;flex:0 0 42px;width:42px;height:42px;border-radius:12px;background:var(--bee-accent);color:var(--bee-accent-text);font-size:19px}.settings-workspace__card h2{font-size:17px;margin:2px 0 5px}.settings-workspace__card-heading p{font-size:12px;line-height:1.55;opacity:.68;margin:0}.settings-workspace__fields{display:grid;gap:12px}.settings-workspace__fields label{display:grid;gap:6px;font-size:12px;font-weight:600}.settings-workspace__fields input,.settings-workspace__unavailable{width:100%;box-sizing:border-box;min-height:38px;padding:9px 11px;border:1px solid var(--bee-border);border-radius:9px;background:transparent;color:inherit;font:inherit;font-size:12px}.settings-workspace__fields input:disabled{opacity:.72}.settings-workspace__unavailable{display:flex;align-items:center;opacity:.58;font-weight:400}.settings-workspace__notice{font-size:11px;line-height:1.55;opacity:.58;margin:14px 0 0}.settings-workspace__general article:nth-child(1){grid-column:1/-1;min-width:0}.settings-workspace__general article:nth-child(2){grid-column:1;min-width:0}.settings-workspace__general article:nth-child(3){grid-column:2;min-width:0}.settings-workspace__general article:nth-child(4){grid-column:1/-1;min-width:0}.settings-workspace__general article:nth-child(2) bee-template-manager{display:block;min-width:0}.settings-workspace__preference-list{display:grid;gap:10px}.settings-workspace__preference-list>div{display:grid;gap:4px;padding:12px;border:1px solid var(--bee-border);border-radius:11px}.settings-workspace__preference-list strong{font-size:12px}.settings-workspace__preference-list span{font-size:11px;opacity:.65;line-height:1.5}.settings-workspace__groups{grid-template-columns:repeat(2,minmax(0,1fr))}.settings-workspace__default-tabs{display:flex;gap:4px;padding:0 14px;margin:0 0 16px;border-bottom:1px solid var(--bee-border);overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;scrollbar-color:var(--bee-accent) transparent;scrollbar-gutter:stable}.settings-workspace__default-tabs::-webkit-scrollbar{height:3px}.settings-workspace__default-tabs::-webkit-scrollbar-track{background:transparent}.settings-workspace__default-tabs::-webkit-scrollbar-thumb{background:var(--bee-accent);border-radius:999px}.settings-workspace__default-tabs::-webkit-scrollbar-thumb:hover{background:var(--bee-accent)}.settings-workspace__default-tabs button{flex:1;min-width:max-content;display:flex;align-items:center;justify-content:center;gap:7px;padding:12px 10px;border:0;border-bottom:2px solid transparent;background:transparent;color:inherit;font:600 11px Arial,sans-serif;opacity:.62;cursor:pointer;white-space:nowrap}.settings-workspace__default-tabs button span{font-size:9px;opacity:.55}.settings-workspace__default-tabs button.is-active{border-bottom-color:var(--bee-accent);opacity:1;color:var(--bee-accent)}.settings-workspace__default-intro{margin:0 0 16px}.settings-workspace__default-intro h3{font-size:15px;margin:0 0 5px}.settings-workspace__default-intro p,.settings-workspace__default-group p{font-size:12px;opacity:.65;line-height:1.55;margin:0}.settings-workspace__default-groups{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.settings-workspace__default-group{border:1px solid var(--bee-border);border-radius:12px;padding:14px;min-width:0}.settings-workspace__default-group h4{font-size:13px;margin:0 0 5px}.settings-workspace__default-fields{display:grid;gap:10px;margin-top:13px}.settings-workspace__default-fields label{display:grid;gap:5px;font-size:11px;font-weight:600}.settings-workspace__default-fields .settings-workspace__unavailable{font-weight:400;font-size:11px;min-height:34px}.settings-workspace__card--defaults{grid-column:1/-1;min-width:0}.settings-workspace__card--defaults .settings-workspace__notice{margin-top:16px}@media(max-width:760px){.settings-workspace__general,.settings-workspace__groups,.settings-workspace__language-grid{grid-template-columns:1fr}.settings-workspace__general article:nth-child(1),.settings-workspace__general article:nth-child(2),.settings-workspace__general article:nth-child(3),.settings-workspace__general article:nth-child(4){grid-column:auto}.settings-workspace__heading{align-items:flex-start;flex-wrap:wrap;padding:15px}.settings-workspace__heading .bee-company__identity-copy{flex-basis:100%}}
  `]
})
export class SettingsWorkspaceComponent implements OnChanges {
  constructor(private readonly i18n: BeeI18nService) {}
  tr(key: string): string { return this.i18n.t('settings:' + key); }
  languageLoading = false;
  languageSaving = false;
  languageError = '';
  languageMessage = '';
  userLanguage: '' | 'en' | 'es' = '';
  teamDefaultLanguage: 'en' | 'es' = 'en';
  canManageTeamDefault = false;
  private languageLoadKey = '';
  @Input() section = 'general';
  @Input() scope: 'platform' | 'tenant' = 'tenant';
  @Input() tenantName = 'Active tenant';
  @Input() accessToken = '';
  groups: SettingGroup[] = [];
  activeDefaultsTab = 'regional';
  defaultTabs = [
    {id:'regional',number:'01',label:'Regional',title:'Regional & localization',description:'Default language, locale, timezone and regional formatting.',groups:[{title:'Language & region',description:'Defaults used when an app or tenant does not define its own.',fields:['Locale','Timezone','First day of week']},{title:'Formatting',description:'Regional formatting conventions.',fields:['Date format','Time format (12/24-hour)','Decimal and thousands separators','Default currency']}],note:'The default team language is configured in Settings → Localization. Locale, timezone and regional formatting will be connected to the regional settings service separately.'},
    {id:'security',number:'02',label:'Security',title:'Security defaults',description:'Baseline security policies that modules and tenants should inherit unless explicitly overridden.',groups:[{title:'Authentication & sessions',description:'Baseline sign-in and session policy.',fields:['Default session lifetime','Failed sign-in lockout policy','MFA policy baseline','Password policy']},{title:'API & access',description:'Default protection for platform endpoints.',fields:['Default API access policy (deny by default)','CORS policy','Security headers','Rate-limit baseline']}],note:'These controls must be backed by the authentication and policy services before they can be applied.'},
    {id:'runtime',number:'03',label:'Runtime',title:'Runtime behavior',description:'Default execution settings and resilient behavior for core services and plugins.',groups:[{title:'Execution',description:'Baseline limits for background and plugin operations.',fields:['Default timeout','Maximum concurrent operations','Worker baseline','Plugin execution limit']},{title:'Reliability',description:'Default behavior when an operation fails.',fields:['Retry count','Retry/backoff strategy','Error handling policy','Graceful shutdown behavior']}],note:'Runtime controls are not active from this UI. They need runtime configuration support and safe validation.'},
    {id:'data',number:'04',label:'Data Policy',title:'Data retention & cleanup',description:'Platform-wide retention and cleanup defaults for operational data.',groups:[{title:'Retention',description:'Default lifecycle for operational records.',fields:['Log retention period','Event retention period','Temporary record retention','Audit data retention']},{title:'Storage & cleanup',description:'Default limits and cleanup behavior.',fields:['Temporary file policy','Default storage quota','Automated cleanup schedule','Data deletion policy']}],note:'Retention must be implemented by scheduled cleanup jobs and storage/database services; no policy is being simulated.'},
    {id:'observability',number:'05',label:'Observability',title:'Observability defaults',description:'How the platform records, measures and exposes its own operational health.',groups:[{title:'Logs & diagnostics',description:'Default diagnostic visibility.',fields:['Default log level','Error reporting','Correlation IDs','Health-check policy']},{title:'Metrics & alerts',description:'Monitoring defaults for core services.',fields:['Metrics collection','Telemetry opt-in policy','Default alert thresholds','Monitoring destinations']}],note:'Logging and monitoring defaults will require a configuration contract with the runtime and observability providers.'},
    {id:'capabilities',number:'06',label:'Capabilities',title:'Platform capabilities',description:'Global availability switches and guardrails for optional platform functionality.',groups:[{title:'Core features',description:'Globally allow or restrict optional core capabilities.',fields:['Dynamic plugin registration','Connected devices','Background jobs','External integrations']},{title:'Platform interfaces',description:'Availability defaults for external-facing features.',fields:['Webhooks','Public API','Public registration','Realtime events']}],note:'This tab is an inventory of candidate capability defaults. It does not enable or disable features until backend support is implemented.'}
  ];
  currentDomain = window.location.host;
  sectionTitle = 'General';
  sectionDescription = 'Manage platform identity, appearance and default behavior.';
  icon = '⚙';

  private readonly definitions: Record<string, {title:string;description:string;icon:string;groups:SettingGroup[]}> = {
    plans: {title:'Plans & Licensing',description:'Manage commercial plans, pricing, subscriptions and license entitlements.',icon:'◇',groups:[
      {title:'Plans and pricing',description:'Commercial plan catalogue and billing terms.',fields:['Plan catalogue','Prices and billing intervals','Plan feature limits'],note:'No plan or price records are exposed by the current API; no sample commercial data is shown.'},
      {title:'Subscriptions and licenses',description:'Tenant subscriptions, license status and entitlement lifecycle.',fields:['Subscription lifecycle','License assignments','Renewals and usage entitlements'],note:'Subscription and licensing operations require billing persistence and authorized service endpoints.'}
    ]},
    security: {title:'Security',description:'Manage authentication, sessions, security policies, audit, privacy and data retention.',icon:'⌑',groups:[
      {title:'Authentication and sessions',description:'Identity controls and active session policy.',fields:['Authentication providers and MFA policy','Session lifetime and revocation policy','Password and sign-in policy'],note:'The existing authentication endpoints remain authoritative; these global policy controls are not yet configurable here.'},
      {title:'Governance and privacy',description:'Security audit, compliance controls and personal-data lifecycle.',fields:['Security audit and compliance policy','Privacy and data subject controls','Data retention and deletion schedule'],note:'Audit events are available in the existing Activity view. This section does not duplicate that log; policy and retention APIs are not implemented.'}
    ]},
    infrastructure: {title:'Infrastructure',description:'Review runtime, storage, queues, logs, services and backup operations.',icon:'⌁',groups:[
      {title:'Runtime and services',description:'Application runtime and service health configuration.',fields:['Runtime environment and deployment profile','Service registry and health policy','Resource limits and scaling'],note:'The current API exposes application health only; infrastructure inventory and controls need an operations service.'},
      {title:'Storage and operations',description:'File storage, background queues, logs and backup lifecycle.',fields:['Storage provider and capacity','Queue workers and processing policy','Log retention and backup schedule'],note:'File storage paths and database settings are server-side environment configuration, not editable dashboard settings.'}
    ]},
    localization: {title:'Localization',description:'Manage supported languages, regions, currencies and regional formats.',icon:'◎',groups:[
      {title:'Languages and regions',description:'Available interface languages and regional defaults.',fields:['Enabled languages','Default language and fallback','Supported regions and locale'],note:'The current API does not expose a persisted localization catalogue; values cannot be changed from this screen.'},
      {title:'Currency and formats',description:'Currency, number, date, time and timezone conventions.',fields:['Supported currencies and default currency','Number and date formats','Timezone and week-start convention'],note:'These controls require tenant/platform localization settings and persistence before they can be enabled.'}
    ]}
  };

  private async loadLanguagePreferences(): Promise<void> {
    const key = this.accessToken + ':' + this.section;
    if (this.languageLoadKey === key || !this.accessToken) return;
    this.languageLoadKey = key;
    this.languageLoading = true;
    this.languageError = '';
    try {
      const response = await fetch('/api/i18n/preferences', { credentials: 'same-origin', headers: { authorization: 'Bearer ' + this.accessToken } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load language preferences.');
      this.userLanguage = result.userLanguage ?? '';
      this.teamDefaultLanguage = result.teamDefaultLanguage === 'es' ? 'es' : 'en';
      this.canManageTeamDefault = result.canManageTeamDefault === true;
      this.i18n.updatePreferences(result);
    } catch (error) {
      this.languageError = error instanceof Error ? error.message : this.tr('localization.error');
      this.languageLoadKey = '';
    } finally {
      this.languageLoading = false;
    }
  }

  async saveLanguagePreferences(): Promise<void> {
    if (!this.accessToken || this.languageSaving) return;
    this.languageSaving = true;
    this.languageError = '';
    this.languageMessage = '';
    try {
      const personal = await fetch('/api/i18n/preferences', {
        method: 'PUT', credentials: 'same-origin',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + this.accessToken },
        body: JSON.stringify({ language: this.userLanguage || null })
      });
      const personalResult = await personal.json();
      if (!personal.ok) throw new Error(personalResult.error || this.tr('localization.error'));
      if (this.canManageTeamDefault) {
        const team = await fetch('/api/i18n/team-default', {
          method: 'PUT', credentials: 'same-origin',
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + this.accessToken },
          body: JSON.stringify({ language: this.teamDefaultLanguage })
        });
        const teamResult = await team.json();
        if (!team.ok) throw new Error(teamResult.error || this.tr('localization.error'));
      }
      await this.i18n.loadPreferences(this.accessToken);
      this.languageMessage = this.tr('localization.saved');
    } catch (error) {
      this.languageError = error instanceof Error ? error.message : this.tr('localization.error');
    } finally {
      this.languageSaving = false;
    }
  }

  ngOnChanges(): void {
    if (this.section === 'localization' && this.accessToken) void this.loadLanguagePreferences();
    if (this.section === 'general') {
      this.sectionTitle = 'General';
      this.sectionDescription = this.scope === 'platform' ? 'Manage global platform identity, appearance and defaults.' : 'Manage this tenant’s identity, appearance and workspace defaults.';
      this.groups = [];
      return;
    }
    if (this.section === 'localization') {
      this.sectionTitle = this.tr('localization.title');
      this.sectionDescription = this.tr('localization.description');
      this.groups = [];
      return;
    }
    const definition = this.definitions[this.section] ?? this.definitions.security;
    this.sectionTitle = definition.title;
    this.sectionDescription = definition.description;
    this.icon = definition.icon;
    this.groups = definition.groups;
  }
}
