import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';
import { BeeTemplateManagerComponent } from '../templates/template-manager.component';
import { PlatformIdentityComponent } from './platform-identity.component';

type SettingGroup = { title: string; description: string; fields: string[]; note: string };

@Component({
  selector: 'bee-settings-workspace',
  standalone: true,
  imports: [CommonModule, BeeTemplateManagerComponent, PlatformIdentityComponent],
  template: `
    <section class="settings-workspace">
      <header class="settings-workspace__heading">
        <div><span class="settings-workspace__eyebrow">{{scope === 'platform' ? 'GLOBAL PLATFORM' : 'ACTIVE TENANT'}}</span>
          <h1>{{sectionTitle}}</h1><p>{{sectionDescription}}</p></div>
        <span class="settings-workspace__scope">{{scope === 'platform' ? 'Platform-wide' : tenantName}}</span>
      </header>

      @if (section === 'general') {
        <div class="settings-workspace__general">
          <article class="settings-workspace__card settings-workspace__card--identity">
            <bee-platform-identity [accessToken]="accessToken" [editable]="scope === 'platform'"></bee-platform-identity>
          </article>
          <article class="settings-workspace__card">
            <div class="settings-workspace__card-heading"><span class="settings-workspace__icon">◈</span><div><h2>Appearance</h2><p>Themes, branding, typography and global visual preferences.</p></div></div>
            <bee-template-manager target="all"></bee-template-manager>
          </article>
          <article class="settings-workspace__card settings-workspace__card--defaults">
            <div class="settings-workspace__card-heading"><span class="settings-workspace__icon">⚙</span><div><h2>Platform Defaults</h2><p>Global fallback values and policies inherited by modules, tenants and applications unless explicitly overridden.</p></div></div>
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
    :host{display:block;color:inherit}.settings-workspace{max-width:1180px}.settings-workspace__heading{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin:4px 0 25px}.settings-workspace__eyebrow{font-size:10px;letter-spacing:.16em;opacity:.58;font-weight:700}.settings-workspace__heading h1{font-size:clamp(26px,3vw,36px);margin:9px 0 6px}.settings-workspace__heading p{margin:0;opacity:.7;max-width:720px;line-height:1.6}.settings-workspace__scope{border:1px solid var(--border,#8885);border-radius:30px;padding:7px 11px;font-size:11px;opacity:.75;white-space:nowrap}.settings-workspace__general,.settings-workspace__groups{display:grid;gap:16px;grid-template-columns:repeat(2,minmax(0,1fr))}.settings-workspace__card{min-width:0;padding:21px;border:1px solid var(--border,#8885);border-radius:16px;background:var(--panel,#8881)}.settings-workspace__card--identity{padding:0;border:0;background:transparent}.settings-workspace__card-heading{display:flex;gap:13px;align-items:flex-start;margin-bottom:18px}.settings-workspace__icon{display:grid;place-items:center;flex:0 0 42px;width:42px;height:42px;border-radius:12px;background:var(--purple,#777);color:white;font-size:19px}.settings-workspace__card h2{font-size:17px;margin:2px 0 5px}.settings-workspace__card-heading p{font-size:12px;line-height:1.55;opacity:.68;margin:0}.settings-workspace__fields{display:grid;gap:12px}.settings-workspace__fields label{display:grid;gap:6px;font-size:12px;font-weight:600}.settings-workspace__fields input,.settings-workspace__unavailable{width:100%;box-sizing:border-box;min-height:38px;padding:9px 11px;border:1px solid var(--border,#8885);border-radius:9px;background:transparent;color:inherit;font:inherit;font-size:12px}.settings-workspace__fields input:disabled{opacity:.72}.settings-workspace__unavailable{display:flex;align-items:center;opacity:.58;font-weight:400}.settings-workspace__notice{font-size:11px;line-height:1.55;opacity:.58;margin:14px 0 0}.settings-workspace__general article:nth-child(1){grid-column:1/-1;min-width:0}.settings-workspace__general article:nth-child(2){grid-column:auto;min-width:0}.settings-workspace__general article:nth-child(2) bee-template-manager{display:block;min-width:0}.settings-workspace__groups{grid-template-columns:repeat(2,minmax(0,1fr))}.settings-workspace__default-tabs{display:flex;gap:6px;overflow:auto;padding:0 0 10px;margin:0 0 16px;border-bottom:1px solid var(--border,#8885)}.settings-workspace__default-tabs button{flex:none;display:flex;align-items:center;gap:7px;border:1px solid transparent;background:transparent;color:inherit;padding:10px 12px;border-radius:10px;font:inherit;font-size:12px;opacity:.68;cursor:pointer;white-space:nowrap}.settings-workspace__default-tabs button span{font-size:10px;opacity:.55}.settings-workspace__default-tabs button.is-active{background:var(--panel,#8882);border-color:var(--border,#8885);opacity:1;color:var(--purple,#777)}.settings-workspace__default-intro{margin:0 0 16px}.settings-workspace__default-intro h3{font-size:15px;margin:0 0 5px}.settings-workspace__default-intro p,.settings-workspace__default-group p{font-size:12px;opacity:.65;line-height:1.55;margin:0}.settings-workspace__default-groups{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.settings-workspace__default-group{border:1px solid var(--border,#8885);border-radius:12px;padding:14px;min-width:0}.settings-workspace__default-group h4{font-size:13px;margin:0 0 5px}.settings-workspace__default-fields{display:grid;gap:10px;margin-top:13px}.settings-workspace__default-fields label{display:grid;gap:5px;font-size:11px;font-weight:600}.settings-workspace__default-fields .settings-workspace__unavailable{font-weight:400;font-size:11px;min-height:34px}.settings-workspace__card--defaults{grid-column:1/-1}.settings-workspace__card--defaults .settings-workspace__notice{margin-top:16px}@media(max-width:760px){.settings-workspace__general,.settings-workspace__groups{grid-template-columns:1fr}.settings-workspace__general article:nth-child(1){grid-column:auto}.settings-workspace__general article:nth-child(2){grid-column:auto}.settings-workspace__heading{flex-direction:column}}
  `]
})
export class SettingsWorkspaceComponent implements OnChanges {
  @Input() section = 'general';
  @Input() scope: 'platform' | 'tenant' = 'tenant';
  @Input() tenantName = 'Active tenant';
  @Input() accessToken = '';
  groups: SettingGroup[] = [];\n  activeDefaultsTab = 'regional';\n  defaultTabs = [\n    {id:'regional',number:'01',label:'Regional',title:'Regional & localization',description:'Default language, locale, timezone and regional formatting.',groups:[{title:'Language & region',description:'Defaults used when an app or tenant does not define its own.',fields:['Default language','Locale','Timezone','First day of week']},{title:'Formatting',description:'Regional formatting conventions.',fields:['Date format','Time format (12/24-hour)','Decimal and thousands separators','Default currency']}],note:'These values are presented as planned platform defaults. They are not persisted yet; a settings API is required.'},\n    {id:'security',number:'02',label:'Security',title:'Security defaults',description:'Baseline security policies that modules and tenants should inherit unless explicitly overridden.',groups:[{title:'Authentication & sessions',description:'Baseline sign-in and session policy.',fields:['Default session lifetime','Failed sign-in lockout policy','MFA policy baseline','Password policy']},{title:'API & access',description:'Default protection for platform endpoints.',fields:['Default API access policy (deny by default)','CORS policy','Security headers','Rate-limit baseline']}],note:'These controls must be backed by the authentication and policy services before they can be applied.'},\n    {id:'runtime',number:'03',label:'Runtime',title:'Runtime behavior',description:'Default execution settings and resilient behavior for core services and plugins.',groups:[{title:'Execution',description:'Baseline limits for background and plugin operations.',fields:['Default timeout','Maximum concurrent operations','Worker baseline','Plugin execution limit']},{title:'Reliability',description:'Default behavior when an operation fails.',fields:['Retry count','Retry/backoff strategy','Error handling policy','Graceful shutdown behavior']}],note:'Runtime controls are not active from this UI. They need runtime configuration support and safe validation.'},\n    {id:'data',number:'04',label:'Data Policy',title:'Data retention & cleanup',description:'Platform-wide retention and cleanup defaults for operational data.',groups:[{title:'Retention',description:'Default lifecycle for operational records.',fields:['Log retention period','Event retention period','Temporary record retention','Audit data retention']},{title:'Storage & cleanup',description:'Default limits and cleanup behavior.',fields:['Temporary file policy','Default storage quota','Automated cleanup schedule','Data deletion policy']}],note:'Retention must be implemented by scheduled cleanup jobs and storage/database services; no policy is being simulated.'},\n    {id:'observability',number:'05',label:'Observability',title:'Observability defaults',description:'How the platform records, measures and exposes its own operational health.',groups:[{title:'Logs & diagnostics',description:'Default diagnostic visibility.',fields:['Default log level','Error reporting','Correlation IDs','Health-check policy']},{title:'Metrics & alerts',description:'Monitoring defaults for core services.',fields:['Metrics collection','Telemetry opt-in policy','Default alert thresholds','Monitoring destinations']}],note:'Logging and monitoring defaults will require a configuration contract with the runtime and observability providers.'},\n    {id:'capabilities',number:'06',label:'Capabilities',title:'Platform capabilities',description:'Global availability switches and guardrails for optional platform functionality.',groups:[{title:'Core features',description:'Globally allow or restrict optional core capabilities.',fields:['Dynamic plugin registration','Connected devices','Background jobs','External integrations']},{title:'Platform interfaces',description:'Availability defaults for external-facing features.',fields:['Webhooks','Public API','Public registration','Realtime events']}],note:'This tab is an inventory of candidate capability defaults. It does not enable or disable features until backend support is implemented.'}\n  ];
  currentDomain = window.location.host;
  sectionTitle = 'General';
  sectionDescription = 'Manage platform identity, appearance and default behavior.';
  icon = '⚙';

  private readonly definitions: Record<string, {title:string;description:string;icon:string;groups:SettingGroup[]}> = {
    integrations: {title:'Integrations',description:'Manage global connectors, service credentials, SMTP and notification channels.',icon:'⌘',groups:[
      {title:'Connected services',description:'External connectors and provider availability.',fields:['Connector registry','Provider connection status','Webhook endpoints'],note:'Connector inventory and connection management require an integrations API.'},
      {title:'Credentials and email',description:'Global credentials, SMTP delivery and notification routing.',fields:['Global API credentials','SMTP host and sender identity','Email and notification channels'],note:'Secrets are intentionally not displayed. Credential storage, rotation and delivery tests require backend support.'}
    ]},
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

  ngOnChanges(): void {
    if (this.section === 'general') {
      this.sectionTitle = 'General';
      this.sectionDescription = this.scope === 'platform' ? 'Manage global platform identity, appearance and defaults.' : 'Manage this tenant’s identity, appearance and workspace defaults.';
      this.groups = [];
      return;
    }
    const definition = this.definitions[this.section] ?? this.definitions.integrations;
    this.sectionTitle = definition.title;
    this.sectionDescription = definition.description;
    this.icon = definition.icon;
    this.groups = definition.groups;
  }
}
