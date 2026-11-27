
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, ChangeDetectionStrategy } from "@angular/core";

type MarketplacePlugin = {
  id: string;
  pluginKey?: string;
  name: string;
  version: string;
  description: string;
  category: string;
  purchasable: boolean;
  system: boolean;
  entitled: boolean;
  accessSource: "plan" | "purchase" | "manual" | null;
  activationPolicy?: "automatic" | "manual";
  installed: boolean;
  enabled: boolean;
  installedVersion: string | null;
};

@Component({
  selector: "bee-marketplace",
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <section id="plugins" class="panel bee-dashboard-card bee-marketplace">
      <div class="panel-heading">
        <div><h2>Company plugin marketplace</h2><p>Only packages available to this company's plan or purchases are shown.</p></div>
        <button class="bee-marketplace__refresh" type="button" (click)="load()" [disabled]="loading">Refresh</button>
      </div>
      @if (loading) {
        <div class="bee-marketplace__state">Loading company plugins…</div>
      }
      @if (error) {
        <div class="bee-marketplace__error" role="alert">{{error}}</div>
      }
      @if (!loading && !error && plugins.length === 0) {
        <div class="bee-marketplace__state">No plugins are currently available for this company.</div>
      }
      @if (!loading && plugins.length) {
        <div class="bee-marketplace__list">
          @for (plugin of plugins; track trackPlugin($index, plugin)) {
            <article class="bee-marketplace__item">
              <div class="bee-marketplace__icon">{{plugin.system ? '◈' : '▣'}}</div>
              <div class="bee-marketplace__details">
                <div class="bee-marketplace__title"><strong>{{plugin.name}}</strong><span class="bee-marketplace__version">v{{plugin.version}}</span></div>
                <p>{{plugin.description}}</p>
                <div class="bee-marketplace__meta">
                  <span>{{plugin.category}}</span>
                  @if (plugin.accessSource === 'plan') {
                    <span>Included in plan</span>
                  }
                  @if (plugin.accessSource === 'purchase') {
                    <span>Purchased add-on</span>
                  }
                  @if (plugin.accessSource === 'manual') {
                    <span>Granted by Superadmin</span>
                  }
                  @if (!plugin.entitled) {
                    <span>Not included</span>
                  }
                  @if (plugin.installed) {
                    <span class="bee-marketplace__installed bee-status--success">Installed</span>
                  }
                  @if (plugin.installed) {
                    <span class="bee-marketplace__activation">{{plugin.enabled ? (plugin.entitled ? "Active" : "Blocked") : "Inactive"}}</span>
                  }
                </div>
              </div>
              <div class="bee-marketplace__actions">
                @if (canManage && plugin.entitled && !plugin.installed) {
                  <button type="button" (click)="install(plugin)" [disabled]="busyId !== ''">
                    {{busyId === plugin.id ? 'Installing…' : 'Install'}}
                  </button>
                }
                @if (canManage && plugin.installed) {
                  <button type="button" (click)="toggleActivation(plugin)" [disabled]="busyId !== '' || (!plugin.enabled && !plugin.entitled)">
                    {{busyId === plugin.id ? (plugin.enabled ? 'Deactivating…' : 'Activating…') : plugin.enabled ? 'Deactivate' : 'Activate'}}
                  </button>
                }
                @if (canManage && plugin.installed && !plugin.system) {
                  <button type="button" class="bee-marketplace__remove" (click)="uninstall(plugin)" [disabled]="busyId !== ''">
                    {{busyId === plugin.id ? 'Uninstalling…' : 'Uninstall'}}
                  </button>
                }
                @if (canManage && plugin.installed && !plugin.system && plugin.installedVersion && plugin.installedVersion !== plugin.version) {
                  <button type="button" (click)="update(plugin)" [disabled]="busyId !== ''">
                    {{busyId === plugin.id ? 'Updating…' : 'Update to v' + plugin.version}}
                  </button>
                }
                @if (plugin.installed && plugin.system) {
                  <span class="bee-marketplace__system">System</span>
                }
                @if (!plugin.entitled && plugin.purchasable) {
                  <span class="bee-marketplace__locked">Available as add-on</span>
                }
                @if (!plugin.entitled && !plugin.purchasable) {
                  <span class="bee-marketplace__locked">Plan required</span>
                }
              </div>
            </article>
          }
        </div>
      }
      @if (message) {
        <div class="bee-marketplace__message" role="status">{{message}}</div>
      }
    </section>
    `
})
export class BeeMarketplaceComponent implements OnInit, OnChanges {
  @Input() tenantId = "";
  @Input() canManage = false;
  @Input() accessToken = "";
  @Output() activePluginsChange = new EventEmitter<string[]>();
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
  private get token(): string { return this.accessToken; }

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
      this.activePluginsChange.emit(this.plugins.filter(plugin => plugin.entitled && plugin.installed && plugin.enabled !== false).map(plugin => plugin.pluginKey || plugin.id));
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Could not load company plugins";
      this.plugins = [];
      this.activePluginsChange.emit([]);
    } finally {
      this.loading = false;
    }
  }

  async install(plugin: MarketplacePlugin): Promise<void> {
    if (!this.canManage || !plugin.entitled || plugin.installed) return;
    await this.runAction(plugin, "POST", "install");
  }

  async update(plugin: MarketplacePlugin): Promise<void> {
    await this.runAction(plugin, "POST", "update");
  }

  async uninstall(plugin: MarketplacePlugin): Promise<void> {
    if (!this.canManage || !plugin.installed || plugin.system) return;
    await this.runAction(plugin, "DELETE", "install");
  }

  private async waitForLifecycleJob(jobId: string, action: "install" | "update" | "uninstall"): Promise<void> {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const response = await fetch("/api/marketplace/install-jobs/" + encodeURIComponent(jobId), {
        headers: { authorization: "Bearer " + this.token }
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not check plugin installation");
      const job = result.job as { status: string; error?: string };
      if (job.status === "succeeded") return;
      if (job.status === "failed") throw new Error(job.error || "Plugin installation failed");
      const verb = action === "install" ? "Installing " : action === "update" ? "Updating " : "Uninstalling ";
      this.message = job.status === "running" ? verb + this.plugins.find(item => item.id === this.busyId)?.name + "…" : "Waiting for plugin lifecycle worker…";
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error("Plugin " + action + " is still running. Refresh the marketplace to check its status.");
  }

  async toggleActivation(plugin: MarketplacePlugin): Promise<void> {
    if (!this.canManage || this.busyId) return;
    const enabled = !plugin.enabled;
    if (enabled && !plugin.entitled) return;
    this.busyId = plugin.id;
    this.error = "";
    this.message = "";
    try {
      const response = await fetch("/api/marketplace/plugins/" + encodeURIComponent(plugin.id) + "/activation", {
        method: "PUT",
        headers: { authorization: "Bearer " + this.token, "content-type": "application/json" },
        body: JSON.stringify({ enabled })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Plugin activation failed");
      await this.load();
      this.message = plugin.name + (enabled ? " activated for this company." : " deactivated for this company. Tenant data was preserved.");
      window.dispatchEvent(new CustomEvent("bee:plugins-changed", { detail: { pluginId: plugin.pluginKey || plugin.id, action: enabled ? "activate" : "deactivate" } }));
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Plugin activation failed";
    } finally {
      this.busyId = "";
    }
  }

  private async runAction(plugin: MarketplacePlugin, method: "POST" | "DELETE", operation: "install" | "update"): Promise<void> {
    if (this.busyId) return;
    this.busyId = plugin.id;
    this.error = "";
    this.message = "";
    try {
      const response = await fetch("/api/marketplace/plugins/" + encodeURIComponent(plugin.id) + "/" + operation, {
        method,
        headers: { authorization: "Bearer " + this.token }
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Plugin action failed");
      if (result.jobId) {
        const action = operation === "update" ? "update" : method === "POST" ? "install" : "uninstall";
        this.message = plugin.name + (action === "update" ? " update queued…" : action === "install" ? " installation queued…" : " uninstallation queued…");
        await this.waitForLifecycleJob(result.jobId as string, action);
      }
      await this.load();
      const action = operation === "update" ? "update" : method === "POST" ? "install" : "uninstall";
      this.message = action === "update" ? plugin.name + " updated for this company." : action === "install" ? plugin.name + " installed for this company." : plugin.name + " uninstalled. Company data is preserved.";
      window.dispatchEvent(new CustomEvent("bee:plugins-changed", { detail: { pluginId: plugin.pluginKey || plugin.id, action } }));
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Plugin action failed";
    } finally {
      this.busyId = "";
    }
  }
}
