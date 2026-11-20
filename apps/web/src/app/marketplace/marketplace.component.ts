import { CommonModule } from "@angular/common";
import { Component, Input, OnChanges, OnInit, SimpleChanges } from "@angular/core";

type MarketplacePlugin = {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  purchasable: boolean;
  system: boolean;
  entitled: boolean;
  accessSource: "plan" | "purchase" | null;
  installed: boolean;
};

@Component({
  selector: "bee-marketplace",
  standalone: true,
  imports: [CommonModule],
  template: `
    <section id="plugins" class="panel bee-marketplace">
      <div class="panel-heading">
        <div><h2>Company plugin marketplace</h2><p>Only packages available to this company's plan or purchases are shown.</p></div>
        <button class="bee-marketplace__refresh" type="button" (click)="load()" [disabled]="loading">Refresh</button>
      </div>
      <div *ngIf="loading" class="bee-marketplace__state">Loading company plugins…</div>
      <div *ngIf="error" class="bee-marketplace__error" role="alert">{{error}}</div>
      <div *ngIf="!loading && !error && plugins.length === 0" class="bee-marketplace__state">No plugins are currently available for this company.</div>
      <div class="bee-marketplace__list" *ngIf="!loading && plugins.length">
        <article class="bee-marketplace__item" *ngFor="let plugin of plugins; trackBy: trackPlugin">
          <div class="bee-marketplace__icon">{{plugin.system ? '◈' : '▣'}}</div>
          <div class="bee-marketplace__details">
            <div class="bee-marketplace__title"><strong>{{plugin.name}}</strong><span class="bee-marketplace__version">v{{plugin.version}}</span></div>
            <p>{{plugin.description}}</p>
            <div class="bee-marketplace__meta">
              <span>{{plugin.category}}</span>
              <span *ngIf="plugin.accessSource === 'plan'">Included in plan</span>
              <span *ngIf="plugin.accessSource === 'purchase'">Purchased add-on</span>
              <span *ngIf="!plugin.entitled">Not included</span>
              <span *ngIf="plugin.installed" class="bee-marketplace__installed">Installed</span>
            </div>
          </div>
          <div class="bee-marketplace__actions">
            <button *ngIf="canManage && plugin.entitled && !plugin.installed" type="button" (click)="install(plugin)" [disabled]="busyId !== ''">
              {{busyId === plugin.id ? 'Installing…' : 'Install'}}
            </button>
            <button *ngIf="canManage && plugin.installed && !plugin.system" type="button" class="bee-marketplace__remove" (click)="uninstall(plugin)" [disabled]="busyId !== ''">
              {{busyId === plugin.id ? 'Removing…' : 'Uninstall'}}
            </button>
            <span *ngIf="plugin.installed && plugin.system" class="bee-marketplace__system">System</span>
            <span *ngIf="!plugin.entitled && plugin.purchasable" class="bee-marketplace__locked">Available as add-on</span>
            <span *ngIf="!plugin.entitled && !plugin.purchasable" class="bee-marketplace__locked">Plan required</span>
          </div>
        </article>
      </div>
      <div *ngIf="message" class="bee-marketplace__message" role="status">{{message}}</div>
    </section>
  `
})
export class BeeMarketplaceComponent implements OnInit, OnChanges {
  @Input() tenantId = "";
  @Input() canManage = false;
  plugins: MarketplacePlugin[] = [];
  loading = false;
  busyId = "";
  error = "";
  message = "";

  ngOnInit(): void { void this.load(); }
  ngOnChanges(changes: SimpleChanges): void {
    if (changes["tenantId"] && !changes["tenantId"].firstChange) void this.load();
  }

  trackPlugin(_index: number, plugin: MarketplacePlugin): string { return plugin.id; }

  private get token(): string {
    try { return JSON.parse(localStorage.getItem("bee-auth") || "null")?.accessToken || ""; }
    catch { return ""; }
  }

  async load(): Promise<void> {
    if (!this.token) return;
    this.loading = true;
    this.error = "";
    this.message = "";
    try {
      const response = await fetch("/api/marketplace/plugins", { headers: { authorization: "Bearer " + this.token } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load company plugins");
      this.plugins = result.plugins || [];
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Could not load company plugins";
    } finally {
      this.loading = false;
    }
  }

  async install(plugin: MarketplacePlugin): Promise<void> {
    await this.runAction(plugin, "POST");
  }

  async uninstall(plugin: MarketplacePlugin): Promise<void> {
    await this.runAction(plugin, "DELETE");
  }

  private async runAction(plugin: MarketplacePlugin, method: "POST" | "DELETE"): Promise<void> {
    if (this.busyId) return;
    this.busyId = plugin.id;
    this.error = "";
    this.message = "";
    try {
      const response = await fetch("/api/marketplace/plugins/" + encodeURIComponent(plugin.id) + "/install", {
        method,
        headers: { authorization: "Bearer " + this.token }
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Plugin action failed");
      await this.load();
      this.message = method === "POST" ? plugin.name + " installed for this company." : plugin.name + " uninstalled. Company data is preserved.";
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Plugin action failed";
    } finally {
      this.busyId = "";
    }
  }
}
