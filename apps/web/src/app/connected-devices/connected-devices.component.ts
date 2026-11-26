import { CommonModule } from "@angular/common";
import { ChangeDetectorRef, Component, ElementRef, Input, OnChanges, ViewChild } from "@angular/core";
import { FormsModule } from "@angular/forms";

type Device = {
  id: string;
  name: string;
  deviceType: string;
  platform: string;
  appVersion?: string;
  requestedCapabilities: string[];
  grantedCapabilities: string[];
  status: string;
  owner?: { name?: string; email?: string };
  lastSeenAt?: string;
  createdAt?: string;
};
type Pairing = { challengeId: string; qrPayload: string; expiresAt: string };
type DeviceView = "cards" | "table";

const CAPABILITIES = [
  { id: "device.status.write", label: "Device status" },
  { id: "scanner.use", label: "Scanner" },
  { id: "camera.capture", label: "Camera" },
  { id: "catalog.read", label: "Read catalog" },
  { id: "inventory.read", label: "Read inventory" },
  { id: "inventory.write", label: "Write inventory" },
  { id: "pos.session.read", label: "Read POS session" },
  { id: "pos.order.write", label: "Create POS orders" },
  { id: "location.read", label: "Location" },
  { id: "notifications.receive", label: "Notifications" }
] as const;

@Component({
  selector: "bee-connected-devices",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="bee-connected-devices">
      <div *ngIf="error" class="bee-status--danger" role="alert">{{error}}</div>
      <div *ngIf="message" class="bee-status--success" role="status">{{message}}</div>

      <header class="bee-page-header">
        <div>
          <span class="bee-eyebrow">WORKSPACE / PLATFORM</span>
          <h2>Connected devices</h2>
          <p>Register devices, review their connection status and manage their access to Bee-core.</p>
        </div>
        <button type="button" class="bee-button bee-button--secondary" (click)="load()" [disabled]="loading || busy">Refresh</button>
      </header>

      <section class="bee-stat-grid" aria-label="Device overview">
        <article class="bee-stat-card"><span>Total devices</span><strong>{{devices.length}}</strong><small>Registered in this organization</small></article>
        <article class="bee-stat-card"><span>Active</span><strong>{{activeCount}}</strong><small>Authorized and available</small></article>
        <article class="bee-stat-card"><span>Pending approval</span><strong>{{pendingCount}}</strong><small>Waiting for permission review</small></article>
        <article class="bee-stat-card"><span>Needs attention</span><strong>{{attentionCount}}</strong><small>Suspended, revoked or expired</small></article>
      </section>

      <section class="bee-directory">
        <header class="bee-section-heading">
          <div><h3>Organization devices</h3><p>{{filteredDevices.length}} of {{devices.length}} devices</p></div>
          <button type="button" class="bee-button bee-button--secondary" (click)="load()" [disabled]="loading">Refresh list</button>
        </header>

        <div class="bee-toolbar" aria-label="Device directory controls">
          <div class="bee-toolbar__filters">
            <label class="bee-search">
              <span aria-hidden="true">⌕</span>
              <input type="search" [(ngModel)]="search" name="deviceSearch" placeholder="Search devices…" aria-label="Search devices">
              <button *ngIf="search" type="button" (click)="search=''" aria-label="Clear search">×</button>
            </label>
            <select class="bee-filter" [(ngModel)]="statusFilter" name="deviceStatus" aria-label="Filter devices by status">
              <option value="all">All statuses</option><option value="active">Active</option><option value="pending">Pending</option>
              <option value="suspended">Suspended</option><option value="revoked">Revoked</option><option value="unlinked">Unlinked</option><option value="expired">Expired</option>
            </select>
            <select class="bee-filter" [(ngModel)]="typeFilter" name="deviceType" aria-label="Filter devices by type">
              <option value="all">All device types</option>
              <option *ngFor="let type of deviceTypes" [value]="type">{{type}}</option>
            </select>
          </div>
          <div class="bee-toolbar__actions">
            <div class="bee-view-toggle" role="group" aria-label="Device display mode">
              <button type="button" [class.is-active]="view==='cards'" [attr.aria-pressed]="view==='cards'" (click)="view='cards'" aria-label="Card view" title="Card view">▦</button>
              <button type="button" [class.is-active]="view==='table'" [attr.aria-pressed]="view==='table'" (click)="view='table'" aria-label="Table view" title="Table view">☷</button>
            </div>
            <button *ngIf="canManage" type="button" class="bee-button bee-button--primary" (click)="openCreate()">＋ New device</button>
          </div>
        </div>

        <div *ngIf="loading && !devices.length" class="bee-empty-state" role="status">Loading devices…</div>
        <div *ngIf="!loading && !devices.length" class="bee-empty-state">
          <strong>No devices connected yet</strong><span>Generate a pairing QR code to register your first device.</span>
          <button *ngIf="canManage" type="button" class="bee-button bee-button--primary" (click)="openCreate()">New device</button>
        </div>
        <div *ngIf="devices.length && !filteredDevices.length" class="bee-empty-state">
          <strong>No matching devices</strong><span>Try changing your search or filters.</span>
          <button type="button" class="bee-button bee-button--secondary" (click)="clearFilters()">Clear filters</button>
        </div>

        <div class="bee-card-grid" *ngIf="filteredDevices.length && view==='cards'">
          <article class="bee-dashboard-card bee-device-card" *ngFor="let device of filteredDevices; trackBy: trackDevice">
            <header class="bee-device-card__header">
              <span class="bee-device-card__icon" aria-hidden="true">▣</span>
              <div class="bee-device-card__identity"><h4>{{device.name}}</h4><p>{{device.deviceType}} · {{device.platform}}</p></div>
              <span class="bee-badge" [ngClass]="statusClass(device.status)">{{statusLabel(device.status)}}</span>
            </header>
            <div class="bee-device-card__details">
              <div><span>Owner</span><strong>{{device.owner?.name || device.owner?.email || '—'}}</strong></div>
              <div><span>Last connection</span><strong>{{device.lastSeenAt ? (device.lastSeenAt | date:'medium') : 'Never'}}</strong></div>
              <div><span>Granted capabilities</span><strong>{{device.grantedCapabilities?.length || 0}}</strong></div>
            </div>
            <div class="bee-device-card__capabilities">
              <span *ngFor="let capability of (device.grantedCapabilities || []).slice(0,3)" class="bee-badge">{{capability}}</span>
              <span *ngIf="(device.grantedCapabilities || []).length>3" class="bee-badge">+{{device.grantedCapabilities.length-3}}</span>
              <span *ngIf="!device.grantedCapabilities?.length" class="bee-text-muted">No capabilities granted</span>
            </div>
            <div *ngIf="device.status==='pending' && canManage" class="bee-device-card__approval">
              <strong>Requested permissions</strong>
              <label *ngFor="let capability of device.requestedCapabilities">
                <input type="checkbox" [checked]="grants[device.id]?.includes(capability)" (change)="toggleGrant(device.id,capability,$any($event.target).checked)">
                {{capability}}
              </label>
              <button type="button" class="bee-button bee-button--primary" (click)="approve(device)" [disabled]="busy || !grants[device.id]?.length">Approve selected</button>
            </div>
            <footer class="bee-device-card__footer">
              <span class="bee-text-muted">{{device.appVersion || device.deviceType}}</span>
              <details class="bee-menu" *ngIf="canManage">
                <summary aria-label="Device actions">⋮</summary>
                <div role="menu">
                  <button *ngIf="device.status==='active'" type="button" role="menuitem" (click)="act(device,'suspend')">Suspend</button>
                  <button *ngIf="device.status==='suspended'" type="button" role="menuitem" (click)="act(device,'activate')">Reactivate</button>
                  <button *ngIf="!['unlinked','revoked','expired'].includes(device.status)" type="button" role="menuitem" (click)="act(device,'unlink')">Unlink</button>
                  <button *ngIf="!['unlinked','revoked','expired'].includes(device.status)" type="button" role="menuitem" (click)="act(device,'revoke')">Revoke access</button>
                  <button type="button" role="menuitem" class="bee-menu__danger" (click)="act(device,'delete')">Delete</button>
                </div>
              </details>
            </footer>
          </article>
        </div>

        <div class="bee-table-wrap" *ngIf="filteredDevices.length && view==='table'">
          <table>
            <thead><tr><th>Device</th><th>Owner</th><th>Status</th><th>Capabilities</th><th>Last connection</th><th *ngIf="canManage">Actions</th></tr></thead>
            <tbody>
              <tr *ngFor="let device of filteredDevices; trackBy: trackDevice">
                <td><strong>{{device.name}}</strong><small class="bee-text-muted">{{device.deviceType}} · {{device.platform}}</small></td>
                <td>{{device.owner?.name || device.owner?.email || '—'}}</td>
                <td><span class="bee-badge" [ngClass]="statusClass(device.status)">{{statusLabel(device.status)}}</span></td>
                <td>{{device.grantedCapabilities?.length || 0}}</td>
                <td>{{device.lastSeenAt ? (device.lastSeenAt | date:'medium') : 'Never'}}</td>
                <td *ngIf="canManage"><details class="bee-menu"><summary aria-label="Device actions">⋮</summary><div role="menu">
                  <button *ngIf="device.status==='active'" type="button" role="menuitem" (click)="act(device,'suspend')">Suspend</button>
                  <button *ngIf="device.status==='suspended'" type="button" role="menuitem" (click)="act(device,'activate')">Reactivate</button>
                  <button *ngIf="!['unlinked','revoked','expired'].includes(device.status)" type="button" role="menuitem" (click)="act(device,'unlink')">Unlink</button>
                  <button *ngIf="!['unlinked','revoked','expired'].includes(device.status)" type="button" role="menuitem" (click)="act(device,'revoke')">Revoke access</button>
                  <button type="button" role="menuitem" class="bee-menu__danger" (click)="act(device,'delete')">Delete</button>
                </div></details></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div class="bee-modal-overlay" *ngIf="modalOpen" (click)="closeModal()">
        <section class="bee-modal" role="dialog" aria-modal="true" aria-labelledby="device-modal-title" (click)="$event.stopPropagation()" (keydown.escape)="closeModal()" tabindex="-1">
          <header class="bee-modal__header"><div><span class="bee-eyebrow">DEVICE REGISTRATION</span><h3 id="device-modal-title">New device</h3><p>Choose the permissions this device may request. They still require explicit approval.</p></div>
            <button type="button" class="bee-icon-button" (click)="closeModal()" aria-label="Close dialog">×</button>
          </header>
          <div *ngIf="!pairing" class="bee-modal__body">
            <strong>Requested capabilities</strong>
            <div class="bee-choice-grid">
              <label *ngFor="let capability of capabilities"><input type="checkbox" [checked]="selectedCapabilities.includes(capability.id)" (change)="toggleCapability(capability.id,$any($event.target).checked)">{{capability.label}}</label>
            </div>
            <p class="bee-text-muted">A QR code is valid for five minutes. Scanning it does not grant access until an administrator approves the device.</p>
          </div>
          <div *ngIf="pairing" class="bee-modal__body bee-pairing">
            <strong>Scan this QR code from your companion app</strong>
            <div #qrContainer class="bee-pairing__qr" role="img" aria-label="Device pairing QR code"></div>
            <code>{{pairing.qrPayload}}</code>
            <span class="bee-text-muted">Expires {{pairing.expiresAt | date:'medium'}}</span>
            <button type="button" class="bee-button bee-button--secondary" (click)="copyPairing()">Copy pairing code</button>
          </div>
          <footer class="bee-modal__footer">
            <button type="button" class="bee-button bee-button--secondary" (click)="closeModal()">Close</button>
            <button *ngIf="!pairing" type="button" class="bee-button bee-button--primary" (click)="createPairing()" [disabled]="busy || !selectedCapabilities.length">{{busy ? 'Generating…' : 'Generate QR code'}}</button>
            <button *ngIf="pairing" type="button" class="bee-button bee-button--danger" (click)="cancelPairing()" [disabled]="busy">Cancel pairing</button>
          </footer>
        </section>
      </div>
    </section>
  `
})
export class BeeConnectedDevicesComponent implements OnChanges {
  @ViewChild("qrContainer") private qrContainer?: ElementRef<HTMLDivElement>;
  constructor(private readonly changeDetector: ChangeDetectorRef) {}
  @Input() tenantId = "";
  @Input() role = "member";
  @Input() accessToken = "";
  @Input() section = "";

  readonly capabilities = CAPABILITIES;
  devices: Device[] = [];
  selectedCapabilities: string[] = ["device.status.write"];
  grants: Record<string, string[]> = {};
  pairing: Pairing | null = null;
  search = "";
  statusFilter = "all";
  typeFilter = "all";
  view: DeviceView = "cards";
  modalOpen = false;
  canManage = false;
  loading = false;
  busy = false;
  error = "";
  message = "";

  get activeCount(): number { return this.devices.filter(device => device.status === "active").length; }
  get pendingCount(): number { return this.devices.filter(device => device.status === "pending").length; }
  get attentionCount(): number { return this.devices.filter(device => ["suspended", "revoked", "expired"].includes(device.status)).length; }
  get deviceTypes(): string[] { return [...new Set(this.devices.map(device => device.deviceType).filter(Boolean))].sort(); }
  get filteredDevices(): Device[] {
    const term = this.search.trim().toLowerCase();
    return this.devices.filter(device => {
      const matchesTerm = !term || [device.name, device.deviceType, device.platform, device.owner?.name, device.owner?.email].some(value => String(value || "").toLowerCase().includes(term));
      return matchesTerm && (this.statusFilter === "all" || device.status === this.statusFilter) && (this.typeFilter === "all" || device.deviceType === this.typeFilter);
    });
  }

  ngOnChanges(): void { if (this.accessToken) void this.load(); }
  trackDevice(_index: number, device: Device): string { return device.id; }
  clearFilters(): void { this.search = ""; this.statusFilter = "all"; this.typeFilter = "all"; }
  openCreate(): void {
    this.error = ""; this.message = ""; this.pairing = null;
    this.selectedCapabilities = ["device.status.write"];
    this.modalOpen = true;
  }
  closeModal(): void {
    if (this.busy) return;
    this.modalOpen = false;
    this.pairing = null;
    this.changeDetector.detectChanges();
  }
  private async request(path: string, method = "GET", body?: unknown): Promise<any> {
    const response = await fetch("/api" + path, {
      method, credentials: "omit",
      headers: { authorization: "Bearer " + this.accessToken, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Connected Devices request failed (" + response.status + ").");
    return payload;
  }
  async load(): Promise<void> {
    if (!this.accessToken || this.loading) return;
    this.loading = true; this.error = "";
    try {
      const result = await this.request("/connected-devices");
      this.devices = Array.isArray(result.devices) ? result.devices : [];
      this.canManage = Boolean(result.canManage);
      for (const device of this.devices) if (device.status === "pending" && !this.grants[device.id]) this.grants[device.id] = [...(device.requestedCapabilities || [])];
    } catch (error) { this.error = error instanceof Error ? error.message : "Could not load devices."; }
    finally { this.loading = false; }
  }
  toggleCapability(id: string, checked: boolean): void { this.selectedCapabilities = checked ? [...this.selectedCapabilities, id] : this.selectedCapabilities.filter(item => item !== id); }
  toggleGrant(deviceId: string, id: string, checked: boolean): void {
    const current = this.grants[deviceId] || [];
    this.grants[deviceId] = checked ? [...current, id] : current.filter(item => item !== id);
  }
  async createPairing(): Promise<void> {
    if (this.busy || !this.selectedCapabilities.length) return;
    this.busy = true; this.error = ""; this.message = "";
    try {
      this.pairing = await this.request("/connected-devices/pairing-challenges", "POST", { requestedCapabilities: this.selectedCapabilities });
      if (!(window as any).QRCode) throw new Error("The QR generator is not available in this application load.");
      this.changeDetector.detectChanges();
      this.renderQr();
    } catch (error) { this.error = error instanceof Error ? error.message : "Could not generate the pairing code."; }
    finally { this.busy = false; }
  }
  private renderQr(): void {
    const container = this.qrContainer?.nativeElement;
    if (!container || !this.pairing) return;
    container.replaceChildren();
    const qr = (window as any).QRCode;
    if (!qr) return;
    const style = getComputedStyle(document.documentElement);
    new qr(container, {
      text: this.pairing.qrPayload, width: 190, height: 190,
      colorDark: style.getPropertyValue("--bee-text").trim(),
      colorLight: style.getPropertyValue("--bee-surface").trim(),
      correctLevel: qr.CorrectLevel?.M ?? 0
    });
  }
  async cancelPairing(): Promise<void> {
    if (!this.pairing) return;
    await this.runAction(() => this.request("/connected-devices/pairing-challenges/" + encodeURIComponent(this.pairing!.challengeId) + "/cancel", "POST", {}), "Pairing code cancelled.");
    this.pairing = null;
    this.changeDetector.detectChanges();
  }
  async copyPairing(): Promise<void> {
    if (!this.pairing) return;
    try { await navigator.clipboard.writeText(this.pairing.qrPayload); this.message = "Pairing code copied."; }
    catch { this.error = "Could not copy the code. Select it manually."; }
  }
  async approve(device: Device): Promise<void> {
    const grantedCapabilities = this.grants[device.id] || [];
    if (!grantedCapabilities.length) return;
    await this.runAction(() => this.request("/connected-devices/" + encodeURIComponent(device.id) + "/approve", "POST", { grantedCapabilities }), "Device approved.");
  }
  async act(device: Device, action: "suspend" | "activate" | "unlink" | "revoke" | "delete"): Promise<void> {
    const labels: Record<string, string> = { suspend: "suspend", activate: "reactivate", unlink: "unlink", revoke: "revoke access to", delete: "delete" };
    if (!window.confirm("Are you sure you want to " + labels[action] + " " + device.name + "?")) return;
    const path = "/connected-devices/" + encodeURIComponent(device.id) + (action === "delete" ? "" : "/" + action);
    await this.runAction(() => this.request(path, action === "delete" ? "DELETE" : "POST", action === "delete" ? undefined : {}), "Action completed.");
  }
  private async runAction(action: () => Promise<unknown>, success: string): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.error = ""; this.message = "";
    try { await action(); await this.load(); this.message = success; }
    catch (error) { this.error = error instanceof Error ? error.message : "Could not complete the operation."; }
    finally { this.busy = false; }
  }
  statusLabel(status: string): string {
    return ({ active: "Active", pending: "Pending", suspended: "Suspended", revoked: "Revoked", unlinked: "Unlinked", expired: "Expired" } as Record<string, string>)[status] || status;
  }
  statusClass(status: string): string {
    if (status === "active") return "bee-badge--success";
    if (status === "pending") return "bee-badge--warning";
    if (["suspended", "revoked", "expired"].includes(status)) return "bee-badge--danger";
    return "";
  }
}
