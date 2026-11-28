import { CommonModule } from "@angular/common";
import { ChangeDetectorRef, Component, ElementRef, Input, OnChanges, OnInit, ViewChild } from "@angular/core";
import { FormsModule } from "@angular/forms";

let connectedDevicesQrPromise: Promise<void> | undefined;

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
type Permission = { pluginId: string; key: string; module: string; resource: string; action: string; label: string };
type DeviceView = "cards" | "table";

@Component({
  selector: "bee-connected-devices",
  standalone: true,
  styleUrls: ["./connected-devices.component.css"],
  imports: [CommonModule, FormsModule],
  templateUrl: "./connected-devices.component.html"
})
export class BeeConnectedDevicesComponent implements OnChanges, OnInit {
  @ViewChild("qrContainer") private qrContainer?: ElementRef<HTMLDivElement>;
  constructor(private readonly changeDetector: ChangeDetectorRef) {}
  @Input() tenantId = "";
  @Input() role = "member";
  @Input() accessToken = "";
  @Input() assetBaseUrl = "";
  @Input() section = "";

  capabilities: Permission[] = [];
  devices: Device[] = [];
  selectedCapabilities: string[] = [];
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

  ngOnInit(): void {
    // Native Federation mounts this component dynamically. Start the initial
    // device query from the lifecycle hook as well as input changes so the
    // first render cannot remain empty if inputs are assigned before the view
    // is attached to the host change-detection tree.
    if (this.accessToken) void this.load();
  }
  ngOnChanges(): void {
    if (this.assetBaseUrl && !connectedDevicesQrPromise) void this.loadQrLibrary().catch(error => { this.error = error instanceof Error ? error.message : "Could not load the QR renderer."; });
    if (this.accessToken) void this.load();
  }
  trackDevice(_index: number, device: Device): string { return device.id; }
  clearFilters(): void { this.search = ""; this.statusFilter = "all"; this.typeFilter = "all"; }
  openCreate(): void {
    this.error = ""; this.message = ""; this.pairing = null;
    this.selectedCapabilities = [];
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
      const [result, permissionResult] = await Promise.all([this.request("/connected-devices"), this.request("/connected-devices/permissions")]);
      this.devices = Array.isArray(result.devices) ? result.devices : [];
      this.capabilities = Array.isArray(permissionResult.permissions) ? permissionResult.permissions : [];
      this.canManage = Boolean(result.canManage);
      for (const device of this.devices) if (device.status === "pending" && !this.grants[device.id]) this.grants[device.id] = [...(device.requestedCapabilities || [])];
    } catch (error) { this.error = error instanceof Error ? error.message : "Could not load devices."; }
    finally {
      this.loading = false;
      // A federated remote can complete fetch callbacks outside the host's
      // change-detection turn. Commit the fetched list and loading state to
      // this dynamically mounted view explicitly.
      this.changeDetector.detectChanges();
    }
  }
  permissionLabel(key: string): string { return this.capabilities.find(permission => permission.key === key)?.label || key; }
  toggleCapability(id: string, checked: boolean): void { this.selectedCapabilities = checked ? [...this.selectedCapabilities, id] : this.selectedCapabilities.filter(item => item !== id); }
  toggleGrant(deviceId: string, id: string, checked: boolean): void {
    const current = this.grants[deviceId] || [];
    this.grants[deviceId] = checked ? [...current, id] : current.filter(item => item !== id);
  }
  private loadQrLibrary(): Promise<void> {
    if (connectedDevicesQrPromise) return connectedDevicesQrPromise;
    if (!this.assetBaseUrl.startsWith("/api/plugin-packages/")) return Promise.reject(new Error("The Connected Devices QR asset URL is not authorized."));
    const promise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = this.assetBaseUrl + "assets/qrcode.min.js";
      script.async = true;
      script.onload = () => typeof (window as any).QRCode === "function" ? resolve() : reject(new Error("The Connected Devices QR renderer did not initialize."));
      script.onerror = () => reject(new Error("Could not load the Connected Devices QR renderer."));
      document.head.appendChild(script);
    }).catch(error => {
      connectedDevicesQrPromise = undefined;
      throw error;
    });
    connectedDevicesQrPromise = promise;
    return promise;
  }
  async createPairing(): Promise<void> {
    if (this.busy || !this.selectedCapabilities.length) return;
    this.busy = true; this.error = ""; this.message = "";
    try {
      await this.loadQrLibrary();
      this.pairing = await this.request("/connected-devices/pairing-challenges", "POST", { requestedCapabilities: this.selectedCapabilities });
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
