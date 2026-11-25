import { CommonModule } from "@angular/common";
import { Component, Input, OnInit } from "@angular/core";

type PlatformPackage = {
  id: string;
  pluginKey: string;
  name: string;
  description?: string | null;
  category?: string | null;
  version: string;
  dependencies?: string[];
  activationPolicy?: "automatic" | "manual";
  runtimeState?: string | null;
  publisher?: string | null;
  status: string;
  source: string;
};

type PackageTenantUsage = { pluginId: string; canRemove: boolean; installedCount: number; pendingJobCount: number; tenants: Array<{name:string;slug?:string|null;kind:string;companyStatus:string;installationStatus:string;version?:string|null}>; pendingJobs: Array<{tenantName:string;action:string;status:string}>; };

type PlatformPlan = {
  id: string;
  name: string;
  packageIds?: string[];
};

type PluginRecord = {
  id: string; name: string; version: string; description: string; category: string;
  system: boolean; entitled: boolean; installed: boolean; installedVersion?: string | null;
  accessSource?: string | null; dependencies?: string[]; purchasable?: boolean;
  packageSource?: string | null; runtimeState?: string | null; pluginKey?: string;
};

@Component({
  selector: "bee-plugin-settings",
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="plugin-settings">
      <header class="plugin-settings__page-header">
        <div class="plugin-settings__heading">
          <span class="plugin-settings__eyebrow">PLATFORM CONFIGURATION</span>
          <h2>{{detail ? detail.name : 'Plugins'}}</h2>
          <p>{{detail ? 'Plugin information and availability.' : 'Browse modules, manage installation and configure plan access.'}}</p>
        </div>
      </header>
      <div class="plugin-settings__toolbar" *ngIf="!detail">
        <div class="plugin-settings__toolbar-filters">
          <div class="plugin-settings__search">
            <span aria-hidden="true">⌕</span>
            <input type="search" [value]="search" (input)="search=$any($event.target).value" placeholder="Search modules…" aria-label="Search modules">
            <button *ngIf="search" type="button" (click)="search=''" aria-label="Clear search">×</button>
          </div>
          <select class="plugin-settings__type-filter" [value]="moduleTypeFilter" (change)="moduleTypeFilter=$any($event.target).value" aria-label="Filter modules by type">
            <option value="all">All modules</option>
            <option value="system">System modules</option>
            <option value="extension">Extensions</option>
          </select>
        </div>
        <div class="plugin-settings__toolbar-actions">
          <div class="plugin-settings__views" role="group" aria-label="Module display mode">
            <button type="button" [class.is-active]="view==='cards'" [attr.aria-pressed]="view==='cards'" (click)="view='cards'" aria-label="Card view" title="Card view"><span aria-hidden="true">▦</span></button>
            <button type="button" [class.is-active]="view==='table'" [attr.aria-pressed]="view==='table'" (click)="view='table'" aria-label="Table view" title="Table view"><span aria-hidden="true">☷</span></button>
          </div>
          <button *ngIf="isPlatformAdmin" type="button" class="plugin-settings__upload" (click)="loadPlatformPackages()" [disabled]="pluginPackagesLoading">{{pluginPackagesLoading ? 'Refreshing…' : '↻ Refresh packages'}}</button>
          <button *ngIf="isPlatformAdmin" type="button" class="plugin-settings__upload" (click)="pluginZipInput.click()" [disabled]="pluginUploadBusy">{{pluginUploadBusy ? 'Uploading…' : '＋ Upload plugin'}}</button>
          <input #pluginZipInput type="file" accept=".zip,application/zip" hidden (change)="uploadPluginZip($event)">
        </div>
      </div>

      <p *ngIf="loading" class="plugin-settings__state">Loading modules…</p>
      <p *ngIf="error" class="plugin-settings__error bee-status--danger" role="alert">{{error}}</p>
      <p *ngIf="packageError && !planConfigPlugin" class="plugin-settings__error bee-status--danger" role="alert">{{packageError}}</p>
      <p *ngIf="message" class="plugin-settings__message" role="status">{{message}}</p>

      <ng-container *ngIf="!loading && !error">
        <ng-container *ngIf="detail as plugin">
          <button type="button" class="plugin-settings__back" (click)="backToList()">← Back to modules</button>
          <article class="plugin-settings__detail">
            <div class="plugin-settings__detail-icon">{{plugin.system ? '◈' : '▣'}}</div>
            <div class="plugin-settings__detail-main">
              <div class="plugin-settings__name-line"><h3>{{plugin.name}}</h3><span>v{{plugin.version}}</span></div>
              <p>{{plugin.description || 'No description provided.'}}</p>
              <dl>
                <div><dt>Category</dt><dd>{{plugin.category || 'Uncategorized'}}</dd></div>
                <div><dt>Type</dt><dd>{{plugin.system ? 'System module' : 'Extension'}}</dd></div>
                <div><dt>Installation</dt><dd>{{plugin.installed ? 'Installed' : 'Not installed'}}</dd></div>
                <div><dt>Entitlement</dt><dd>{{plugin.entitled ? 'Available' : 'Not included'}}</dd></div>
                <div *ngIf="plugin.installedVersion"><dt>Installed version</dt><dd>{{plugin.installedVersion}}</dd></div>
                <div><dt>Access</dt><dd>{{plugin.accessSource || '—'}}</dd></div>
              </dl>
              <div *ngIf="plugin.dependencies?.length"><strong>Dependencies</strong><p>{{plugin.dependencies?.length}} required module(s)</p></div>
            </div>
          </article>
        </ng-container>

        <div *ngIf="!detail && plugins.length===0" class="plugin-settings__empty">
          <span class="plugin-settings__empty-icon">◇</span><strong>No modules available</strong><span>There are no modules in this catalogue yet.</span>
        </div>
        <div *ngIf="!detail && plugins.length && filteredPlugins.length===0" class="plugin-settings__empty">
          <strong>No matching modules</strong><span>Try another search or module type.</span>
          <button type="button" class="plugin-settings__text-button" (click)="search='';moduleTypeFilter='all'">Clear filters</button>
        </div>

        <div *ngIf="!detail && filteredPlugins.length && view==='cards'" class="plugin-settings__cards">
          <article class="plugin-settings__card" *ngFor="let plugin of filteredPlugins; trackBy: trackPlugin">
            <div class="plugin-settings__card-top">
              <div class="plugin-settings__card-icon">{{plugin.system ? '◈' : '▣'}}</div>
              <div class="plugin-settings__menu-wrap">
                <button type="button" class="plugin-settings__kebab" [attr.aria-label]="'Actions for '+plugin.name" [attr.aria-expanded]="openMenuId===plugin.id" (click)="toggleMenu(plugin.id)">⋮</button>
                <div class="plugin-settings__menu" *ngIf="openMenuId===plugin.id" role="menu">
                  <button *ngIf="isPlatformAdmin && platformPackageFor(plugin)" type="button" role="menuitem" (click)="openPlanConfig(plugin)">Configure plans</button>
                  <button *ngIf="isPlatformAdmin && platformPackageFor(plugin)?.source === 'zip'" type="button" role="menuitem" (click)="openPackageRemoval(plugin)">Remove platform package…</button>
                  <button *ngIf="canManage && plugin.entitled && !plugin.installed" type="button" role="menuitem" (click)="install(plugin)" [disabled]="busyId !== ''">{{busyId === plugin.id ? 'Installing…' : 'Install'}}</button>
                  <button *ngIf="canManage && plugin.installed && !plugin.system" type="button" role="menuitem" (click)="uninstall(plugin)" [disabled]="busyId !== ''">{{busyId === plugin.id ? 'Uninstalling…' : 'Uninstall'}}</button>
                  <button type="button" role="menuitem" (click)="openDetails(plugin)">Details</button>
                </div>
              </div>
            </div>
            <div class="plugin-settings__card-body">
              <div class="plugin-settings__name-line"><h3>{{plugin.name}}</h3><span>v{{plugin.version}}</span></div>
              <p>{{plugin.description || 'No description provided.'}}</p>
            </div>
            <div class="plugin-settings__meta">
              <span>{{plugin.category || 'Uncategorized'}}</span>
              <span>{{plugin.system ? 'System' : 'Extension'}}</span>
              <span class="plugin-settings__status" [class.is-installed]="plugin.installed" [class.bee-status--success]="plugin.installed">{{plugin.installed ? 'Installed' : 'Not installed'}}</span>
              <span *ngIf="plugin.packageSource" class="plugin-settings__status">{{plugin.packageSource}} · {{plugin.runtimeState || 'registered'}}</span>
            </div>
          </article>
        </div>

        <div *ngIf="!detail && filteredPlugins.length && view==='table'" class="plugin-settings__table-wrap">
          <table>
            <thead><tr><th>Module</th><th>Type</th><th>Category</th><th>Status</th><th><span class="plugin-settings__sr-only">Options</span></th></tr></thead>
            <tbody>
              <tr *ngFor="let plugin of filteredPlugins; trackBy: trackPlugin">
                <td><button type="button" class="plugin-settings__table-module" (click)="openDetails(plugin)"><span class="plugin-settings__table-icon">{{plugin.system ? '◈' : '▣'}}</span><span><strong>{{plugin.name}}</strong><small>v{{plugin.version}} · {{plugin.description || 'No description'}}</small></span></button></td>
                <td>{{plugin.system ? 'System' : 'Extension'}}</td>
                <td>{{plugin.category || 'Uncategorized'}}</td>
                <td><span class="plugin-settings__status" [class.is-installed]="plugin.installed" [class.bee-status--success]="plugin.installed">{{plugin.installed ? 'Installed' : 'Not installed'}}</span><small *ngIf="plugin.packageSource"> {{plugin.packageSource}} · {{plugin.runtimeState || 'registered'}}</small></td>
                <td>
                  <div class="plugin-settings__menu-wrap">
                    <button type="button" class="plugin-settings__kebab" [attr.aria-label]="'Actions for '+plugin.name" [attr.aria-expanded]="openMenuId===plugin.id" (click)="toggleMenu(plugin.id)">⋮</button>
                    <div class="plugin-settings__menu" *ngIf="openMenuId===plugin.id" role="menu">
                      <button *ngIf="isPlatformAdmin && platformPackageFor(plugin)" type="button" role="menuitem" (click)="openPlanConfig(plugin)">Configure plans</button>
                      <button *ngIf="isPlatformAdmin && platformPackageFor(plugin)?.source === 'zip'" type="button" role="menuitem" (click)="openPackageRemoval(plugin)">Remove platform package…</button>
                      <button *ngIf="canManage && plugin.entitled && !plugin.installed" type="button" role="menuitem" (click)="install(plugin)" [disabled]="busyId !== ''">Install</button>
                      <button *ngIf="canManage && plugin.installed && !plugin.system" type="button" role="menuitem" (click)="uninstall(plugin)" [disabled]="busyId !== ''">Uninstall</button>
                      <button type="button" role="menuitem" (click)="openDetails(plugin)">Details</button>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </ng-container>

      <div class="plugin-settings__overlay" *ngIf="planConfigPlugin as planPackage" (click)="closePlanConfig()">
        <section class="plugin-settings__plan-dialog" role="dialog" aria-modal="true" aria-labelledby="plugin-plan-title" (click)="$event.stopPropagation()" (keydown.escape)="closePlanConfig()" tabindex="-1">
          <header class="plugin-settings__plan-heading">
            <div><span class="plugin-settings__eyebrow">PLATFORM SETTINGS</span><h3 id="plugin-plan-title">Plan availability</h3><p>{{planPackage.name}} · v{{planPackage.version}}</p></div>
            <button type="button" class="plugin-settings__close" (click)="closePlanConfig()" aria-label="Close plan settings">×</button>
          </header>
          <p class="plugin-settings__plan-description">Choose which subscription plans can access this module. Tenant activation remains managed separately.</p>
          <p *ngIf="packageError" class="plugin-settings__error bee-status--danger" role="alert">{{packageError}}</p>
          <div class="plugin-settings__plan-list">
            <label *ngFor="let plan of platformPlans"><input type="checkbox" [checked]="packagePlanSelections[planPackage.pluginKey]?.includes(plan.id)" (change)="togglePackagePlan(planPackage,plan.id,$any($event.target).checked)"><span><strong>{{plan.name}}</strong><small>{{plan.packageIds?.includes(planPackage.pluginKey) ? 'Currently included' : 'Not included'}}</small></span></label>
            <p *ngIf="!platformPlans.length" class="plugin-settings__state">No subscription plans are available.</p>
          </div>
          <footer class="plugin-settings__plan-footer">
            <button type="button" class="plugin-settings__cancel" (click)="closePlanConfig()">Cancel</button>
            <button type="button" class="plugin-settings__save" (click)="savePackagePlans(planPackage)" [disabled]="planPackage.runtimeState !== 'loaded' || packageSavingId===planPackage.pluginKey">{{packageSavingId===planPackage.pluginKey ? 'Saving…' : 'Save changes'}}</button>
          </footer>
        </section>
      </div>
      <div class="plugin-settings__overlay" *ngIf="packageRemovalPlugin as removalPackage" (click)="closePackageRemoval()">
        <section class="plugin-settings__plan-dialog plugin-settings__removal-dialog" role="dialog" aria-modal="true" aria-labelledby="plugin-removal-title" (click)="$event.stopPropagation()" (keydown.escape)="closePackageRemoval()" tabindex="-1">
          <header class="plugin-settings__plan-heading">
            <div><span class="plugin-settings__eyebrow">PLATFORM PACKAGE</span><h3 id="plugin-removal-title">Remove {{removalPackage.name}}?</h3><p>v{{removalPackage.version}} · {{removalPackage.pluginKey}}</p></div>
            <button type="button" class="plugin-settings__close" (click)="closePackageRemoval()" aria-label="Close package removal">×</button>
          </header>
          <p class="plugin-settings__plan-description">Uninstall this plugin separately from every company before removing the global package. Tenant data is not deleted by the global removal.</p>
          <div class="plugin-settings__removal-summary" *ngIf="packageUsageLoading">Checking tenant installations…</div>
          <p *ngIf="packageUsageError" class="plugin-settings__error bee-status--danger" role="alert">{{packageUsageError}}</p>
          <ng-container *ngIf="!packageUsageLoading && packageUsage as usage">
            <div class="plugin-settings__removal-counts">
              <div><strong>{{usage.installedCount}}</strong><span>Tenant installations</span></div>
              <div><strong>{{usage.pendingJobCount}}</strong><span>Operations in progress</span></div>
            </div>
            <div *ngIf="usage.tenants.length" class="plugin-settings__tenant-list">
              <h4>Companies that still have the plugin</h4>
              <div *ngFor="let tenant of usage.tenants" class="plugin-settings__tenant-row">
                <span><strong>{{tenant.name}}</strong><small>{{tenant.kind === 'super' ? 'Platform organization' : tenant.slug || 'Tenant'}} · {{tenant.companyStatus}}</small></span>
                <span class="plugin-settings__status">{{tenant.installationStatus}}</span>
              </div>
              <p class="plugin-settings__removal-hint">Open each company and use Settings → Plugins → Uninstall. When the job finishes, refresh this list.</p>
            </div>
            <div *ngIf="usage.pendingJobs.length" class="plugin-settings__tenant-list">
              <h4>Operations still running</h4>
              <div *ngFor="let job of usage.pendingJobs" class="plugin-settings__tenant-row"><span><strong>{{job.tenantName}}</strong><small>{{job.action}}</small></span><span class="plugin-settings__status">{{job.status}}</span></div>
            </div>
            <div *ngIf="usage.canRemove" class="plugin-settings__removal-ready bee-status--success">No tenant installations or pending operations remain. The package can now be removed.</div>
            <div *ngIf="!usage.canRemove" class="plugin-settings__removal-blocked bee-status--warning">Global removal is blocked until every tenant installation and pending operation is cleared.</div>
          </ng-container>
          <footer class="plugin-settings__plan-footer">
            <button type="button" class="plugin-settings__cancel" (click)="closePackageRemoval()">Close</button>
            <button type="button" class="plugin-settings__cancel" (click)="refreshPackageUsage()" [disabled]="packageUsageLoading || packageRemovalBusy">↻ Refresh status</button>
            <button type="button" class="plugin-settings__save plugin-settings__danger" (click)="confirmRemovePackage()" [disabled]="!packageUsage?.canRemove || packageUsageLoading || packageRemovalBusy">{{packageRemovalBusy ? 'Removing…' : 'Remove global package'}}</button>
          </footer>
        </section>
      </div>
    </section>
  `,
  styles: [`
    :host{display:block;min-width:0}
    .plugin-settings{color:inherit;min-width:0}
    .plugin-settings *{box-sizing:border-box}
    .plugin-settings__page-header{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;margin:8px 0 18px}
    .plugin-settings__heading{min-width:0}
    .plugin-settings__eyebrow{font-size:10px;letter-spacing:.15em;opacity:.62}
    .plugin-settings__heading h2{font-size:26px;margin:5px 0}
    .plugin-settings__heading p,.plugin-settings__card p,.plugin-settings__detail p{opacity:.7;margin:5px 0 0;line-height:1.55}
    .plugin-settings__toolbar{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:center;gap:14px;margin:0 0 22px;min-width:0}
    .plugin-settings__toolbar-filters{display:grid;grid-template-columns:minmax(0,4fr) minmax(0,3fr) minmax(0,3fr);align-items:center;gap:8px;width:100%;min-width:0}
    .plugin-settings__toolbar-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;width:100%;min-width:0}
    .plugin-settings button,.plugin-settings input,.plugin-settings select{font:inherit}
    .plugin-settings button{cursor:pointer}
    .plugin-settings button:disabled{opacity:.45;cursor:not-allowed}
    .plugin-settings__search{display:flex;align-items:center;gap:8px;width:100%;flex:none;min-width:0;height:36px;padding:0 10px;border:1px solid var(--bee-border);border-radius:8px;background:var(--bee-surface);color:var(--bee-text-muted)}
    .plugin-settings__search>span{font-size:20px;opacity:.65}
    .plugin-settings__search input{border:0;outline:0;min-width:0;flex:1;background:transparent;color:inherit;font-size:12px}
    .plugin-settings__search input::placeholder{color:inherit;opacity:.48}
    .plugin-settings__search button{border:0;background:transparent;color:inherit;font-size:16px}
    .plugin-settings__search:focus-within,.plugin-settings__type-filter:focus-visible{border-color:var(--bee-accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--bee-accent) 20%,transparent);outline:0}
    .plugin-settings__type-filter{width:100%;height:36px;min-width:0;flex:none;padding:0 10px;border:1px solid var(--bee-border);border-radius:8px;background:var(--bee-surface);color:inherit;font-size:11px}
    .plugin-settings__views{display:flex;align-items:center;gap:5px;padding:5px;border:0;border-radius:10px;background:transparent;flex:0 0 auto}
    .plugin-settings__views button{display:grid;place-items:center;width:34px;height:32px;border:1px solid var(--bee-border);border-radius:7px;background:transparent;color:var(--bee-text-muted);font:inherit;font-size:17px;cursor:pointer;transition:background-color .16s ease,border-color .16s ease,color .16s ease}
    .plugin-settings__views button:hover{border-color:var(--bee-accent);color:inherit;opacity:1}
    .plugin-settings__views button.is-active{border-color:var(--bee-accent);background:var(--bee-accent);color:var(--bee-action-text);opacity:1}
    .plugin-settings__views button:focus-visible,.plugin-settings__kebab:focus-visible,.plugin-settings__upload:focus-visible{outline:2px solid var(--bee-accent);outline-offset:2px}
    .plugin-settings__upload{display:inline-flex;min-height:38px;align-items:center;justify-content:center;gap:8px;padding:8px 13px;border:1px solid var(--bee-border);border-radius:9px;background:transparent;color:inherit;font:inherit;font-size:13px;font-weight:600;line-height:1.2;white-space:nowrap;cursor:pointer;transition:background-color .16s ease,border-color .16s ease,transform .16s ease}
    .plugin-settings__upload:hover:not(:disabled){background:color-mix(in srgb,var(--bee-accent) 10%,transparent);border-color:color-mix(in srgb,var(--bee-accent) 55%,var(--bee-border))}
    .plugin-settings__upload:active:not(:disabled){transform:translateY(1px)}
    .plugin-settings__cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,245px),1fr));gap:12px}
    .plugin-settings__card{position:relative;display:flex;flex-direction:column;gap:12px;min-width:0;min-height:174px;padding:14px;border:1px solid var(--bee-border);border-radius:11px;background:var(--bee-surface);transition:border-color .16s,background .16s}
    .plugin-settings__card:hover{border-color:color-mix(in srgb,var(--bee-accent) 48%,var(--bee-border));background:color-mix(in srgb,var(--bee-surface) 92%,var(--bee-accent))}
    .plugin-settings__card-top{display:flex;align-items:center;justify-content:space-between}
    .plugin-settings__card-icon,.plugin-settings__table-icon,.plugin-settings__detail-icon{display:grid;place-items:center;width:36px;height:36px;flex:0 0 36px;border-radius:9px;background:color-mix(in srgb,var(--bee-accent) 14%,var(--bee-surface));color:var(--bee-accent);font-size:18px;font-weight:700}
    .plugin-settings__card-body{flex:1;min-width:0}
    .plugin-settings__name-line{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
    .plugin-settings__name-line h3{font-size:14px;margin:0}
    .plugin-settings__name-line>span{font-size:10px;opacity:.6}
    .plugin-settings__card p{font-size:11px;min-height:34px}
    .plugin-settings__meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto}
    .plugin-settings__meta span,.plugin-settings__status{font-size:10px;padding:4px 7px;border:1px solid var(--bee-border);border-radius:20px;opacity:.75;white-space:nowrap}
    .plugin-settings__status.is-installed{border-color:color-mix(in srgb,var(--bee-status-success) 45%,var(--bee-border));color:var(--bee-status-success);opacity:1}
    .plugin-settings__menu-wrap{position:relative;flex:0 0 auto}
    .plugin-settings__kebab{display:grid;place-items:center;width:28px;height:28px;border:0;border-radius:7px;background:transparent;color:inherit;font-size:21px;line-height:1}
    .plugin-settings__kebab:hover{background:color-mix(in srgb,currentColor 10%,transparent)}
    .plugin-settings__menu{position:absolute;right:0;top:31px;z-index:10;min-width:170px;padding:5px;border:1px solid var(--bee-border);border-radius:9px;background:var(--bee-surface-raised);box-shadow:var(--bee-shadow-raised);display:grid;gap:2px}
    .plugin-settings__menu button{display:block;width:100%;text-align:left;padding:8px 9px;border:0;border-radius:6px;background:transparent;color:inherit;font-size:11px}
    .plugin-settings__menu button:hover:not(:disabled){background:color-mix(in srgb,currentColor 9%,transparent)}
    .plugin-settings__table-wrap{width:100%;overflow-x:auto;border:1px solid var(--bee-border);border-radius:10px}
    .plugin-settings table{width:100%;border-collapse:collapse;min-width:650px}
    .plugin-settings th{text-align:start;color:inherit;opacity:.62;font-size:10px;font-weight:650;background:color-mix(in srgb,currentColor 5%,var(--bee-surface));padding:10px 12px}
    .plugin-settings td{padding:9px 12px;border-top:1px solid var(--bee-border);font-size:11px}
    .plugin-settings tbody tr{transition:background-color .16s ease}
    .plugin-settings tbody tr:hover{background:color-mix(in srgb,var(--bee-accent) 5%,transparent)}
    .plugin-settings__table-module{display:flex;align-items:center;gap:9px;border:0;background:transparent;color:inherit;text-align:start;padding:0;min-width:0}
    .plugin-settings__table-module>span:last-child{display:grid;gap:3px;min-width:0}
    .plugin-settings__table-module strong{font-size:11px}
    .plugin-settings__table-module small{font-size:10px;opacity:.6;max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .plugin-settings__table-icon{width:30px;height:30px;flex-basis:30px;font-size:15px}
    .plugin-settings__sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
    .plugin-settings__empty,.plugin-settings__state,.plugin-settings__error{padding:18px;border:1px solid var(--bee-border);border-radius:12px}
    .plugin-settings__empty{display:grid;justify-items:center;gap:7px;text-align:center;min-height:150px;align-content:center}
    .plugin-settings__empty>span{font-size:12px;opacity:.65}
    .plugin-settings__empty-icon{font-size:24px;color:var(--bee-accent)}
    .plugin-settings__text-button{border:0;background:transparent;color:var(--bee-accent);font-size:11px;padding:6px}
    .plugin-settings__error{color:var(--bee-status-danger)}
    .plugin-settings__message{margin-top:14px;padding:12px 14px;border:1px solid var(--bee-border);border-radius:10px;font-size:12px}
    .plugin-settings__back{margin:8px 0 16px;border:1px solid var(--bee-border);background:var(--bee-surface);color:inherit;border-radius:9px;padding:8px 12px}
    .plugin-settings__detail{display:flex;gap:18px;padding:22px;border:1px solid var(--bee-border);border-radius:16px;background:var(--bee-surface)}
    .plugin-settings__detail-icon{width:56px;height:56px;flex-basis:56px;font-size:25px}
    .plugin-settings__detail-main{flex:1;min-width:0}
    .plugin-settings__detail-main>p{margin:10px 0 20px}
    .plugin-settings__detail dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:0}
    .plugin-settings__detail dl div{padding:12px;border:1px solid var(--bee-border);border-radius:10px}
    .plugin-settings__detail dt{font-size:10px;text-transform:uppercase;letter-spacing:.08em;opacity:.6}
    .plugin-settings__detail dd{margin:5px 0 0;font-weight:600}
    .plugin-settings__overlay{position:fixed;inset:0;z-index:1200;display:grid;place-items:center;padding:24px;background:var(--bee-overlay);backdrop-filter:blur(8px)}
    .plugin-settings__plan-dialog{width:min(100%,520px);max-height:min(84vh,760px);overflow:auto;padding:20px;border:1px solid var(--bee-border);border-radius:16px;background:var(--bee-surface-raised);box-shadow:var(--bee-shadow-raised)}
    .plugin-settings__plan-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
    .plugin-settings__plan-heading h3{font-size:16px;margin:4px 0}
    .plugin-settings__plan-heading p,.plugin-settings__plan-description{font-size:12px;opacity:.68;margin:4px 0 0}
    .plugin-settings__close{width:32px;height:32px;border:1px solid var(--bee-border);border-radius:8px;background:transparent;color:inherit;font-size:20px}
    .plugin-settings__plan-description{margin:16px 0}
    .plugin-settings__removal-dialog{width:min(100%,620px)}
    .plugin-settings__removal-counts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:14px 0}
    .plugin-settings__removal-counts>div{display:grid;gap:4px;padding:13px;border:1px solid var(--bee-border);border-radius:10px}
    .plugin-settings__removal-counts strong{font-size:22px}
    .plugin-settings__removal-counts span,.plugin-settings__tenant-row small{font-size:10px;opacity:.65}
    .plugin-settings__tenant-list{display:grid;gap:8px;margin:14px 0}
    .plugin-settings__tenant-list h4{margin:0;font-size:12px}
    .plugin-settings__tenant-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 11px;border:1px solid var(--bee-border);border-radius:9px}
    .plugin-settings__tenant-row>span:first-child{display:grid;gap:3px;min-width:0}
    .plugin-settings__tenant-row strong{font-size:11px}
    .plugin-settings__removal-hint,.plugin-settings__removal-blocked,.plugin-settings__removal-ready,.plugin-settings__removal-summary{padding:11px 12px;border:1px solid var(--bee-border);border-radius:9px;font-size:11px;line-height:1.5}
    .plugin-settings__removal-blocked{border-color:color-mix(in srgb,var(--bee-status-warning) 55%,var(--bee-border))}
    .plugin-settings__removal-ready{border-color:color-mix(in srgb,var(--bee-status-success) 45%,var(--bee-border))}
    .plugin-settings__removal-hint{margin:0;opacity:.72}
    .plugin-settings__danger{background:var(--bee-status-danger);border-color:var(--bee-status-danger)}
    .plugin-settings__plan-list{display:grid;gap:8px}
    .plugin-settings__plan-list label{display:flex;align-items:center;gap:10px;padding:11px 12px;border:1px solid var(--bee-border);border-radius:9px;cursor:pointer}
    .plugin-settings__plan-list label>span{display:grid;gap:3px}
    .plugin-settings__plan-list strong{font-size:12px}
    .plugin-settings__plan-list small{font-size:10px;opacity:.6}
    .plugin-settings__plan-footer{display:flex;justify-content:flex-end;gap:9px;margin-top:20px;padding-top:14px;border-top:1px solid var(--bee-border)}
    .plugin-settings__cancel,.plugin-settings__save{height:36px;padding:0 13px;border:1px solid var(--bee-border);border-radius:8px;background:transparent;color:inherit;font-size:12px}
    .plugin-settings__save{border-color:var(--bee-accent);background:var(--bee-accent);color:var(--bee-accent-text);font-weight:650}
    @media(max-width:760px){.plugin-settings__toolbar{grid-template-columns:1fr;gap:10px}.plugin-settings__toolbar-filters,.plugin-settings__toolbar-actions{width:100%}.plugin-settings__toolbar-actions{justify-content:flex-end}}
    @media(max-width:900px){.plugin-settings__cards{grid-template-columns:repeat(2,minmax(0,1fr))}.plugin-settings__detail dl{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:600px){.plugin-settings__toolbar-filters{gap:8px}.plugin-settings__search,.plugin-settings__type-filter{flex:1 1 0;min-width:0}.plugin-settings__toolbar-actions{justify-content:flex-end}.plugin-settings__cards{grid-template-columns:1fr}.plugin-settings__detail{flex-direction:column}.plugin-settings__overlay{padding:12px}.plugin-settings__plan-dialog{padding:16px}}
  `]
})
export class PluginSettingsComponent implements OnInit {
  plugins: PluginRecord[] = [];
  detail: PluginRecord | null = null;
  loading = false;
  error = "";
  view: "cards" | "table" = "cards";
  search = "";
  moduleTypeFilter: "all" | "system" | "extension" = "all";
  planConfigPlugin: PlatformPackage | null = null;
  packageRemovalPlugin: PlatformPackage | null = null;
  packageUsage: PackageTenantUsage | null = null;
  packageUsageLoading = false;
  packageUsageError = '';
  packageRemovalBusy = false;
  openMenuId = "";
  @Input() accessToken = "";
  @Input() canManage = false;
  @Input() isPlatformAdmin = false;
  platformPackages: PlatformPackage[] = [];
  platformPlans: PlatformPlan[] = [];
  packagePlanSelections: Record<string,string[]> = {};
  pluginPackagesLoading = false;
  pluginUploadBusy = false;
  packageSavingId = "";
  packageError = "";
  busyId = "";
  message = "";
  ngOnInit(): void { void this.load(); if (this.isPlatformAdmin) void this.loadPlatformPackages(); }
  private get token(): string { return this.accessToken; }
  get filteredPlugins(): PluginRecord[] {
    const merged = this.plugins.map(plugin => {
      const pkg = this.platformPackages.find(item => item.pluginKey === plugin.id || item.id === plugin.id);
      return pkg ? { ...plugin, packageSource: pkg.source, runtimeState: pkg.runtimeState || pkg.status, pluginKey: pkg.pluginKey } : plugin;
    });
    for (const pkg of this.platformPackages) {
      if (merged.some(plugin => plugin.id === pkg.pluginKey || plugin.id === pkg.id)) continue;
      merged.push({
        id: pkg.pluginKey, name: pkg.name, version: pkg.version,
        description: pkg.description || "Platform package",
        category: pkg.category || "Platform",
        system: false, entitled: true,
        installed: pkg.runtimeState === "loaded" || pkg.status === "installed",
        installedVersion: pkg.version, accessSource: "platform",
        packageSource: pkg.source, runtimeState: pkg.runtimeState || pkg.status,
        pluginKey: pkg.pluginKey
      });
    }
    const query = this.search.trim().toLocaleLowerCase();
    return merged.filter(plugin => {
      const matchesType = this.moduleTypeFilter === "all" || (this.moduleTypeFilter === "system" ? plugin.system : !plugin.system);
      const haystack = [plugin.name, plugin.description, plugin.category, plugin.id].join(" ").toLocaleLowerCase();
      return matchesType && (!query || haystack.includes(query));
    });
  }
  trackPlugin(_index: number, plugin: PluginRecord): string { return plugin.id; }
  platformPackageFor(plugin: PluginRecord): PlatformPackage | undefined {
    return this.platformPackages.find(item => item.pluginKey === plugin.id || item.id === plugin.id);
  }
  openPlanConfig(plugin: PluginRecord): void {
    this.openMenuId = "";
    this.planConfigPlugin = this.platformPackageFor(plugin) || null;
    this.packageError = "";
  }
  closePlanConfig(): void { this.planConfigPlugin = null; this.packageError = ""; }
  toggleMenu(id: string): void { this.openMenuId = this.openMenuId === id ? "" : id; }
  async loadPlatformPackages(): Promise<void> {
    if (!this.isPlatformAdmin || this.pluginPackagesLoading) return;
    this.pluginPackagesLoading = true; this.packageError = "";
    try {
      const response = await fetch("/api/platform/plugin-packages", { headers: { authorization: "Bearer " + this.token } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load global packages");
      this.platformPackages = result.packages || [];
      await this.loadPlatformPlans();
    } catch (error) { this.packageError = error instanceof Error ? error.message : "Could not load global packages"; }
    finally { this.pluginPackagesLoading = false; }
  }
  private async loadPlatformPlans(): Promise<void> {
    const response = await fetch("/api/platform/plugin-plans", { headers: { authorization: "Bearer " + this.token } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load platform plans");
    this.platformPlans = result.plans || [];
    for (const plugin of this.platformPackages) this.packagePlanSelections[plugin.pluginKey] = this.platformPlans.filter(plan => plan.packageIds?.includes(plugin.pluginKey)).map(plan => plan.id);
  }
  togglePackagePlan(plugin: PlatformPackage, planId: string, checked: boolean): void {
    const current = this.packagePlanSelections[plugin.pluginKey] || [];
    this.packagePlanSelections[plugin.pluginKey] = checked ? [...new Set([...current, planId])] : current.filter(id => id !== planId);
  }
  async savePackagePlans(plugin: PlatformPackage): Promise<void> {
    if (this.packageSavingId) return;
    this.packageSavingId = plugin.pluginKey; this.packageError = "";
    try {
      const response = await fetch("/api/platform/plugin-packages/" + encodeURIComponent(plugin.id) + "/plans", {
        method: "PUT", headers: { authorization: "Bearer " + this.token, "content-type": "application/json" },
        body: JSON.stringify({ planIds: this.packagePlanSelections[plugin.pluginKey] || [] })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save plan access");
      this.message = "Plan access updated for " + plugin.name + ".";
    } catch (error) { this.packageError = error instanceof Error ? error.message : "Could not save plan access"; }
    finally { this.packageSavingId = ""; }
  }
  openPackageRemoval(plugin: PluginRecord): void {
    const pkg = this.platformPackageFor(plugin);
    if (!this.isPlatformAdmin || !pkg || pkg.source !== 'zip') return;
    this.openMenuId = ''; this.packageRemovalPlugin = pkg; this.packageUsage = null; this.packageUsageError = '';
    void this.refreshPackageUsage();
  }
  closePackageRemoval(): void { if (this.packageRemovalBusy) return; this.packageRemovalPlugin = null; this.packageUsage = null; this.packageUsageError = ''; }
  async refreshPackageUsage(): Promise<void> {
    const pkg = this.packageRemovalPlugin; if (!pkg || this.packageUsageLoading) return;
    this.packageUsageLoading = true; this.packageUsageError = '';
    try {
      const response = await fetch('/api/platform/plugin-packages/' + encodeURIComponent(pkg.id) + '/tenants', { headers: { authorization: 'Bearer ' + this.token } });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not check tenant installations');
      this.packageUsage = result as PackageTenantUsage;
    } catch (error) { this.packageUsageError = error instanceof Error ? error.message : 'Could not check tenant installations'; }
    finally { this.packageUsageLoading = false; }
  }
  async confirmRemovePackage(): Promise<void> {
    const pkg = this.packageRemovalPlugin; if (!pkg || !this.packageUsage?.canRemove || this.packageRemovalBusy) return;
    this.packageRemovalBusy = true; this.packageUsageError = '';
    try {
      const response = await fetch('/api/platform/plugin-packages/' + encodeURIComponent(pkg.id), { method: 'DELETE', headers: { authorization: 'Bearer ' + this.token } });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not remove platform package');
      this.message = pkg.name + ' removed from the platform. Restart Bee Core to unload it from the current runtime; tenant data was preserved.';
      this.packageRemovalPlugin = null; this.packageUsage = null; await this.loadPlatformPackages(); await this.load();
    } catch (error) { this.packageUsageError = error instanceof Error ? error.message : 'Could not remove platform package'; }
    finally { this.packageRemovalBusy = false; }
  }
  async uploadPluginZip(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement; const file = input.files?.[0]; input.value = ""; if (!file) return;
    if (!file.name.toLowerCase().endsWith(".zip")) { this.packageError = "Select a .zip package."; return; }
    if (file.size > 50 * 1024 * 1024) { this.packageError = "Plugin ZIP files cannot exceed 50 MB."; return; }
    this.pluginUploadBusy = true; this.packageError = ""; this.message = "";
    try {
      const bytes = new Uint8Array(await file.arrayBuffer()); let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
      const response = await fetch("/api/platform/plugin-packages", { method: "POST", headers: { authorization: "Bearer " + this.token, "content-type": "application/json" }, body: JSON.stringify({ archiveBase64: btoa(binary) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Plugin upload failed");
      this.message = "Package " + result.package.name + " v" + result.package.version + " stored. Runtime activation is pending.";
      await this.loadPlatformPackages();
    } catch (error) { this.packageError = error instanceof Error ? error.message : "Plugin upload failed"; }
    finally { this.pluginUploadBusy = false; }
  }
  async load(): Promise<void> {
    if (!this.token) { this.error = "Your session is not available. Sign in again."; return; }
    this.loading = true; this.error = "";
    try {
      const match = window.location.pathname.match(/^\/dashboard\/plugins\/([^/]+)\/details\/?$/);
      if (match) {
        const id = decodeURIComponent(match[1]);
        const response = await fetch("/api/marketplace/plugins/" + encodeURIComponent(id), { headers: { authorization: "Bearer " + this.token } });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load plugin details");
        this.detail = result.plugin;
      } else {
        const response = await fetch("/api/marketplace/plugins", { headers: { authorization: "Bearer " + this.token } });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load plugins");
        this.plugins = result.plugins || [];
        this.detail = null;
      }
    } catch (error) { this.error = error instanceof Error ? error.message : "Could not load plugins"; }
    finally { this.loading = false; }
  }
  async install(plugin: PluginRecord): Promise<void> {
    await this.runLifecycleAction(plugin, "POST");
  }
  async uninstall(plugin: PluginRecord): Promise<void> {
    await this.runLifecycleAction(plugin, "DELETE");
  }
  private async waitForJob(jobId: string, plugin: PluginRecord, action: "install" | "uninstall"): Promise<void> {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const response = await fetch("/api/marketplace/install-jobs/" + encodeURIComponent(jobId), {
        headers: { authorization: "Bearer " + this.token }
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not check plugin operation");
      const status = String(result.job?.status ?? "");
      if (status === "succeeded") return;
      if (status === "failed") throw new Error(result.job?.error || "Plugin " + action + " failed");
      this.message = (action === "install" ? "Installing " : "Uninstalling ") + plugin.name + "…";
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error("The plugin operation is taking longer than expected. Refresh the catalogue to check its status.");
  }
  private async runLifecycleAction(plugin: PluginRecord, method: "POST" | "DELETE"): Promise<void> {
    if (!this.canManage || this.busyId) return;
    if (method === "POST" && (!plugin.entitled || plugin.installed)) return;
    if (method === "DELETE" && (!plugin.installed || plugin.system)) return;
    this.busyId = plugin.id;
    this.openMenuId = "";
    this.error = "";
    this.message = method === "POST" ? "Queuing installation…" : "Queuing uninstallation…";
    try {
      const response = await fetch("/api/marketplace/plugins/" + encodeURIComponent(plugin.id) + "/install", {
        method,
        headers: { authorization: "Bearer " + this.token }
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Plugin operation failed");
      const action = method === "POST" ? "install" : "uninstall";
      if (result.jobId) await this.waitForJob(String(result.jobId), plugin, action);
      await this.load();
      this.message = method === "POST"
        ? plugin.name + " installed successfully."
        : plugin.name + " uninstalled. Company data is preserved.";
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Plugin operation failed";
      this.message = "";
    } finally {
      this.busyId = "";
    }
  }
  openDetails(plugin: PluginRecord): void {
    this.openMenuId = "";
    window.history.pushState({}, "", "/dashboard/plugins/" + encodeURIComponent(plugin.id) + "/details");
    this.detail = plugin;
    void this.load();
  }
  backToList(): void {
    window.history.pushState({}, "", "/dashboard/settings/plugins");
    this.detail = null;
    void this.load();
  }
}
