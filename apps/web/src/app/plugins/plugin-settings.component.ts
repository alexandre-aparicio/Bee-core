import { CommonModule } from "@angular/common";
import { Component, Input, OnInit } from "@angular/core";

type PluginRecord = {
  id: string; name: string; version: string; description: string; category: string;
  system: boolean; entitled: boolean; installed: boolean; installedVersion?: string | null;
  accessSource?: string | null; dependencies?: string[]; purchasable?: boolean;
};

@Component({
  selector: "bee-plugin-settings",
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="plugin-settings">
      <header class="plugin-settings__toolbar">
        <div><span class="plugin-settings__eyebrow">PLATFORM CONFIGURATION</span><h2>{{detail ? detail.name : 'Plugins'}}</h2>
          <p>{{detail ? 'Plugin information and availability.' : 'Browse the plugin catalogue and review installed packages.'}}</p></div>
        <div class="plugin-settings__tools">
          <button type="button" class="plugin-settings__upload" disabled title="Upload will be available in a future release">＋ Upload</button>
          <ng-container *ngIf="!detail">
            <div class="plugin-settings__views" aria-label="Plugin display mode">
              <button type="button" [class.active]="view==='cards'" [attr.aria-pressed]="view==='cards'" (click)="view='cards'">▦ Cards</button>
              <button type="button" [class.active]="view==='list'" [attr.aria-pressed]="view==='list'" (click)="view='list'">☷ List</button>
            </div>
          </ng-container>
        </div>
      </header>
      <p *ngIf="loading" class="plugin-settings__state">Loading plugins…</p>
      <p *ngIf="error" class="plugin-settings__error" role="alert">{{error}}</p>
      <ng-container *ngIf="!loading && !error">
        <ng-container *ngIf="detail as plugin">
          <button type="button" class="plugin-settings__back" (click)="backToList()">← Back to plugins</button>
          <article class="plugin-settings__detail">
            <div class="plugin-settings__detail-icon">▣</div>
            <div class="plugin-settings__detail-main">
              <div class="plugin-settings__name-line"><h3>{{plugin.name}}</h3><span>v{{plugin.version}}</span></div>
              <p>{{plugin.description || 'No description provided.'}}</p>
              <dl><div><dt>Category</dt><dd>{{plugin.category || 'Uncategorized'}}</dd></div>
                <div><dt>Type</dt><dd>{{plugin.system ? 'System plugin' : 'Extension'}}</dd></div>
                <div><dt>Installation</dt><dd>{{plugin.installed ? 'Installed' : 'Not installed'}}</dd></div>
                <div><dt>Entitlement</dt><dd>{{plugin.entitled ? 'Available' : 'Not included'}}</dd></div>
                <div *ngIf="plugin.installedVersion"><dt>Installed version</dt><dd>{{plugin.installedVersion}}</dd></div>
                <div><dt>Access</dt><dd>{{plugin.accessSource || '—'}}</dd></div>
              </dl>
              <div *ngIf="plugin.dependencies?.length"><strong>Dependencies</strong><p>{{plugin.dependencies?.length}} required plugin(s)</p></div>
            </div>
          </article>
        </ng-container>
        <div *ngIf="!detail && plugins.length===0" class="plugin-settings__state">No plugins are available.</div>
        <div *ngIf="!detail && plugins.length" class="plugin-settings__grid" [class.is-list]="view==='list'">
          <article class="plugin-settings__card" *ngFor="let plugin of plugins; trackBy: trackPlugin">
            <div class="plugin-settings__card-icon">{{plugin.system ? '◈' : '▣'}}</div>
            <div class="plugin-settings__card-body">
              <div class="plugin-settings__name-line"><h3>{{plugin.name}}</h3><span>v{{plugin.version}}</span></div>
              <p>{{plugin.description || 'No description provided.'}}</p>
              <div class="plugin-settings__meta"><span>{{plugin.category || 'Uncategorized'}}</span><span>{{plugin.system ? 'System' : 'Extension'}}</span><span [class.is-installed]="plugin.installed">{{plugin.installed ? 'Installed' : 'Not installed'}}</span></div>
            </div>
            <div class="plugin-settings__menu-wrap">
              <button type="button" class="plugin-settings__kebab" [attr.aria-label]="'Actions for '+plugin.name" [attr.aria-expanded]="openMenuId===plugin.id" (click)="toggleMenu(plugin.id)">⋮</button>
              <div class="plugin-settings__menu" *ngIf="openMenuId===plugin.id" role="menu">
                <button type="button" role="menuitem" disabled>{{plugin.installed ? 'Uninstall' : 'Install'}}</button>
                <button type="button" role="menuitem" disabled>Delete</button>
                <button type="button" role="menuitem" (click)="openDetails(plugin)">Details</button>
              </div>
            </div>
          </article>
        </div>
      </ng-container>
    </section>
  `,
  styles: [`
    :host{display:block}.plugin-settings{color:inherit}.plugin-settings__toolbar{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin:8px 0 22px}.plugin-settings__eyebrow{font-size:10px;letter-spacing:.15em;opacity:.62}.plugin-settings__toolbar h2{font-size:26px;margin:5px 0}.plugin-settings__toolbar p,.plugin-settings__card p,.plugin-settings__detail p{opacity:.7;margin:5px 0 0;line-height:1.55}.plugin-settings__tools,.plugin-settings__views{display:flex;align-items:center;gap:8px}.plugin-settings button{font:inherit;cursor:pointer}.plugin-settings__upload,.plugin-settings__views button,.plugin-settings__back{border:1px solid var(--border,#8885);background:var(--panel,#8881);color:inherit;border-radius:9px;padding:9px 12px}.plugin-settings__upload:disabled{opacity:.45;cursor:not-allowed}.plugin-settings__views{padding:3px;border:1px solid var(--border,#8885);border-radius:10px}.plugin-settings__views button{border:0;background:transparent;padding:7px 10px;opacity:.65}.plugin-settings__views button.active{background:var(--purple,#777);color:white;opacity:1}.plugin-settings__grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.plugin-settings__card{position:relative;display:flex;gap:13px;min-width:0;padding:17px;border:1px solid var(--border,#8885);border-radius:14px;background:var(--panel,#8881)}.plugin-settings__grid.is-list{grid-template-columns:1fr;gap:9px}.plugin-settings__grid.is-list .plugin-settings__card{align-items:center;padding:13px 16px}.plugin-settings__card-icon,.plugin-settings__detail-icon{display:grid;place-items:center;flex:0 0 42px;width:42px;height:42px;border-radius:12px;background:var(--purple,#777);color:white;font-size:20px}.plugin-settings__card-body{flex:1;min-width:0}.plugin-settings__name-line{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.plugin-settings__name-line h3{font-size:15px;margin:0}.plugin-settings__name-line>span{font-size:11px;opacity:.6}.plugin-settings__card p{font-size:12px;min-height:38px}.plugin-settings__meta{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}.plugin-settings__meta span{font-size:10px;padding:4px 7px;border:1px solid var(--border,#8885);border-radius:20px;opacity:.75}.plugin-settings__meta .is-installed{opacity:1}.plugin-settings__menu-wrap{position:relative;margin-left:auto}.plugin-settings__kebab{width:32px;height:32px;border:0;border-radius:8px;background:transparent;color:inherit;font-size:22px}.plugin-settings__kebab:hover{background:var(--border,#8882)}.plugin-settings__menu{position:absolute;right:0;top:36px;z-index:5;min-width:145px;padding:5px;border:1px solid var(--border,#8885);border-radius:10px;background:var(--panel,#222);box-shadow:0 10px 28px #0003}.plugin-settings__menu button{display:block;width:100%;text-align:left;padding:9px 10px;border:0;border-radius:6px;background:transparent;color:inherit}.plugin-settings__menu button:hover:not(:disabled){background:var(--border,#8882)}.plugin-settings__menu button:disabled{opacity:.35;cursor:not-allowed}.plugin-settings__state,.plugin-settings__error{padding:18px;border:1px solid var(--border,#8885);border-radius:12px}.plugin-settings__error{color:#d66}.plugin-settings__back{margin:8px 0 16px}.plugin-settings__detail{display:flex;gap:18px;padding:22px;border:1px solid var(--border,#8885);border-radius:16px;background:var(--panel,#8881)}.plugin-settings__detail-icon{width:56px;height:56px;flex-basis:56px;font-size:25px}.plugin-settings__detail-main{flex:1}.plugin-settings__detail-main>p{margin:10px 0 20px}.plugin-settings__detail dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:0}.plugin-settings__detail dl div{padding:12px;border:1px solid var(--border,#8885);border-radius:10px}.plugin-settings__detail dt{font-size:10px;text-transform:uppercase;letter-spacing:.08em;opacity:.6}.plugin-settings__detail dd{margin:5px 0 0;font-weight:600}@media(max-width:900px){.plugin-settings__grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.plugin-settings__toolbar{align-items:flex-start;flex-direction:column}.plugin-settings__grid{grid-template-columns:1fr}.plugin-settings__detail{flex-direction:column}.plugin-settings__detail dl{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `]
})
export class PluginSettingsComponent implements OnInit {
  plugins: PluginRecord[] = [];
  detail: PluginRecord | null = null;
  loading = false;
  error = "";
  view: "cards" | "list" = "cards";
  openMenuId = "";
  @Input() accessToken = "";
  ngOnInit(): void { void this.load(); }
  private get token(): string { return this.accessToken; }
  trackPlugin(_index: number, plugin: PluginRecord): string { return plugin.id; }
  toggleMenu(id: string): void { this.openMenuId = this.openMenuId === id ? "" : id; }
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
