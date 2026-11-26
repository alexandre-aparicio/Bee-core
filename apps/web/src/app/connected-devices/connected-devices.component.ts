import { CommonModule } from "@angular/common";
import { ChangeDetectorRef, Component, ElementRef, Input, OnChanges, ViewChild } from "@angular/core";
import { FormsModule } from "@angular/forms";

type Device = {
  id: string; name: string; deviceType: string; platform: string; appVersion?: string;
  requestedCapabilities: string[]; grantedCapabilities: string[]; status: string;
  owner?: { name?: string; email?: string }; lastSeenAt?: string;
};
type Pairing = { challengeId: string; qrPayload: string; expiresAt: string };

const CAPABILITIES = [
  { id: "device.status.write", label: "Estado del dispositivo" },
  { id: "scanner.use", label: "Escáner" },
  { id: "camera.capture", label: "Cámara" },
  { id: "catalog.read", label: "Consultar catálogo" },
  { id: "inventory.read", label: "Consultar inventario" },
  { id: "inventory.write", label: "Modificar inventario" },
  { id: "pos.session.read", label: "Consultar sesión TPV" },
  { id: "pos.order.write", label: "Crear pedidos TPV" },
  { id: "location.read", label: "Ubicación" },
  { id: "notifications.receive", label: "Notificaciones" }
] as const;

@Component({
  selector: "bee-connected-devices",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="cd-page">
      <header class="cd-header">
        <div><p class="cd-eyebrow">BEE PROJECTS / PLATFORM</p><h1>Dispositivos conectados</h1>
        <p>Vincula dispositivos y controla de forma granular los permisos de cada uno.</p></div>
        <button type="button" class="cd-button" (click)="load()" [disabled]="loading || busy">Actualizar</button>
      </header>
      <p *ngIf="error" class="cd-alert cd-error" role="alert">{{error}}</p>
      <p *ngIf="message" class="cd-alert cd-success" role="status">{{message}}</p>
      <section class="cd-panel">
        <div class="cd-panel-heading"><div><h2>Vincular un dispositivo</h2><p>Selecciona los permisos que solicitará el nuevo dispositivo.</p></div></div>
        <div class="cd-capabilities">
          <label *ngFor="let capability of capabilities"><input type="checkbox" [checked]="selectedCapabilities.includes(capability.id)" (change)="toggleCapability(capability.id, $any($event.target).checked)"><span>{{capability.label}}</span></label>
        </div>
        <div class="cd-actions"><button class="cd-button cd-primary" type="button" (click)="createPairing()" [disabled]="busy || selectedCapabilities.length===0">Generar código de vinculación</button></div>
        <div *ngIf="pairing" class="cd-pairing">
          <div><strong>Escanea este QR desde la app</strong><p>Abre la app Bee en el dispositivo que quieras vincular y escanea el código antes de que caduque.</p></div>
          <div #qrContainer class="cd-qr" role="img" aria-label="Código QR para vincular el dispositivo"></div>
          <code>{{pairing.qrPayload}}</code>
          <small>Caduca: {{pairing.expiresAt | date:'medium'}}</small>
          <div class="cd-actions"><button class="cd-button" type="button" (click)="copyPairing()">Copiar código</button><button class="cd-button cd-danger" type="button" (click)="cancelPairing()">Cancelar código</button></div>
        </div>
      </section>
      <section class="cd-panel">
        <div class="cd-panel-heading"><div><h2>Dispositivos registrados</h2><p>Revisa su estado y los permisos concedidos.</p></div><span class="cd-count">{{devices.length}}</span></div>
        <p *ngIf="loading">Cargando dispositivos…</p>
        <p *ngIf="!loading && !devices.length" class="cd-empty">Todavía no hay dispositivos vinculados.</p>
        <article class="cd-device" *ngFor="let device of devices">
          <div class="cd-device-head"><div class="cd-device-icon">▣</div><div class="cd-device-title"><h3>{{device.name}}</h3><p>{{device.deviceType}} · {{device.platform}}<span *ngIf="device.appVersion"> · {{device.appVersion}}</span></p><small *ngIf="canManage">Propietario: {{device.owner?.name || device.owner?.email || 'Miembro anterior'}}</small></div><span class="cd-status" [attr.data-status]="device.status">{{statusLabel(device.status)}}</span></div>
          <div class="cd-grants" *ngIf="device.status==='pending' && canManage">
            <strong>Permisos solicitados</strong>
            <label *ngFor="let capability of device.requestedCapabilities"><input type="checkbox" [checked]="grants[device.id]?.includes(capability)" (change)="toggleGrant(device.id, capability, $any($event.target).checked)">{{capability}}</label>
            <button type="button" class="cd-button cd-primary" (click)="approve(device)" [disabled]="busy || !(grants[device.id]?.length)">Aprobar permisos seleccionados</button>
          </div>
          <div class="cd-grants" *ngIf="device.status!=='pending'"><strong>Permisos concedidos</strong><span *ngIf="!device.grantedCapabilities?.length">Ninguno</span><span class="cd-chip" *ngFor="let capability of device.grantedCapabilities">{{capability}}</span></div>
          <footer class="cd-device-footer"><span>Última conexión: {{device.lastSeenAt ? (device.lastSeenAt | date:'medium') : 'Nunca'}}</span><div class="cd-actions">
            <button *ngIf="canManage && device.status==='active'" class="cd-button" type="button" (click)="act(device,'suspend')">Suspender</button>
            <button *ngIf="canManage && device.status==='suspended'" class="cd-button" type="button" (click)="act(device,'activate')">Reactivar</button>
            <button *ngIf="!['unlinked','revoked'].includes(device.status)" class="cd-button" type="button" (click)="act(device,'unlink')">Desvincular</button>
            <button *ngIf="canManage && !['unlinked','revoked'].includes(device.status)" class="cd-button cd-danger" type="button" (click)="act(device,'revoke')">Revocar acceso</button>
            <button *ngIf="canManage" class="cd-button cd-danger" type="button" (click)="act(device,'delete')">Eliminar</button>
          </div></footer>
        </article>
      </section>
    </section>
  `,
  styles: [`
    :host{display:block;color:var(--bee-text)}.cd-page{max-width:1120px;margin:0 auto;padding:24px;display:grid;gap:20px}.cd-header,.cd-panel-heading,.cd-device-head,.cd-device-footer,.cd-actions{display:flex;align-items:center;justify-content:space-between;gap:14px}.cd-header h1{margin:4px 0;font-size:28px}.cd-header p,.cd-panel-heading p{margin:4px 0;color:var(--bee-text-muted)}.cd-eyebrow{font-size:11px;letter-spacing:.12em;font-weight:700;color:var(--bee-accent)}.cd-panel{border:1px solid var(--bee-border);border-radius:16px;background:var(--bee-surface-raised);padding:20px}.cd-panel h2{font-size:18px;margin:0}.cd-capabilities{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin:20px 0}.cd-capabilities label,.cd-grants label{display:flex;align-items:center;gap:9px}.cd-button{border:1px solid var(--bee-border);border-radius:9px;background:var(--bee-surface);color:var(--bee-text);padding:9px 13px;cursor:pointer}.cd-button:disabled{opacity:.5;cursor:not-allowed}.cd-primary{background:var(--bee-accent);border-color:var(--bee-accent);color:var(--bee-accent-text)}.cd-danger{color:var(--bee-status-danger)}.cd-pairing{margin-top:18px;padding:16px;border:1px dashed var(--bee-border);border-radius:12px;display:grid;gap:10px}.cd-qr{display:flex;justify-content:center;min-height:180px}.cd-pairing code{overflow-wrap:anywhere;padding:12px;background:var(--bee-surface);border-radius:8px}.cd-count{border-radius:99px;background:var(--bee-surface);padding:4px 10px}.cd-device{border-top:1px solid var(--bee-border);padding:18px 0}.cd-device-icon{width:42px;height:42px;display:grid;place-items:center;border-radius:12px;background:var(--bee-surface);font-size:22px}.cd-device-title{flex:1}.cd-device-title h3{margin:0 0 4px}.cd-device-title p,.cd-device-title small{margin:0;color:var(--bee-text-muted)}.cd-status,.cd-chip{border-radius:99px;padding:5px 9px;background:var(--bee-surface);font-size:12px}.cd-status[data-status=active]{color:var(--bee-status-success)}.cd-status[data-status=pending]{color:var(--bee-status-warning)}.cd-status[data-status=suspended],.cd-status[data-status=revoked]{color:var(--bee-status-danger)}.cd-grants{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:14px 0;padding:14px;border-radius:10px;background:var(--bee-surface)}.cd-grants strong{width:100%}.cd-device-footer{margin-top:12px;color:var(--bee-text-muted);font-size:12px;flex-wrap:wrap}.cd-alert{padding:12px 14px;border-radius:10px}.cd-error{background:var(--bee-surface);color:var(--bee-status-danger)}.cd-success{background:var(--bee-surface);color:var(--bee-status-success)}.cd-empty{padding:20px;text-align:center;color:var(--bee-text-muted)}@media(max-width:650px){.cd-page{padding:14px}.cd-header,.cd-device-head{align-items:flex-start;flex-wrap:wrap}.cd-device-footer{align-items:flex-start;flex-direction:column}}
  `]
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
  canManage = false;
  loading = false;
  busy = false;
  error = "";
  message = "";

  ngOnChanges(): void { if (this.accessToken) void this.load(); }
  private async request(path: string, method = "GET", body?: unknown): Promise<any> {
    const response = await fetch("/api" + path, {
      method, credentials: "omit",
      headers: { authorization: "Bearer " + this.accessToken, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "La solicitud de dispositivos conectados ha fallado (" + response.status + ").");
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
    } catch (error) { this.error = error instanceof Error ? error.message : "No se pudieron cargar los dispositivos."; }
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
      // The QRCode.js library is bundled by Angular (angular.json scripts).
      // Render only after *ngIf has created the QR container in the view.
      this.changeDetector.detectChanges();
      this.renderQr();
    } catch (error) { this.error = error instanceof Error ? error.message : "No se pudo generar el código QR."; }
    finally { this.busy = false; }
  }
  async cancelPairing(): Promise<void> {
    if (!this.pairing) return;
    try { await this.request("/connected-devices/pairing-challenges/" + encodeURIComponent(this.pairing.challengeId) + "/cancel", "POST", {}); this.pairing = null; this.changeDetector.detectChanges(); this.message = "Código de vinculación cancelado."; }
    catch (error) { this.error = error instanceof Error ? error.message : "No se pudo cancelar el código."; }
  }
  private renderQr(): void {
    const container = this.qrContainer?.nativeElement;
    if (!container || !this.pairing) return;
    container.replaceChildren();
    const qr = (window as any).QRCode;
    if (!qr) { container.textContent = "No se pudo mostrar el QR. Copia el código de vinculación."; return; }
    const style = getComputedStyle(document.documentElement);
    new qr(container, {
      text: this.pairing.qrPayload, width: 180, height: 180,
      colorDark: style.getPropertyValue("--bee-text").trim(),
      colorLight: style.getPropertyValue("--bee-surface").trim(),
      correctLevel: qr.CorrectLevel?.M ?? 0
    });
  }
  async copyPairing(): Promise<void> {
    if (!this.pairing) return;
    try { await navigator.clipboard.writeText(this.pairing.qrPayload); this.message = "Código copiado."; }
    catch { this.error = "No se pudo copiar el código. Selecciónalo manualmente."; }
  }
  async approve(device: Device): Promise<void> {
    const grantedCapabilities = this.grants[device.id] || [];
    if (!grantedCapabilities.length) return;
    await this.runAction(() => this.request("/connected-devices/" + encodeURIComponent(device.id) + "/approve", "POST", { grantedCapabilities }), "Dispositivo aprobado.");
  }
  async act(device: Device, action: "suspend" | "activate" | "unlink" | "revoke" | "delete"): Promise<void> {
    const descriptions: Record<string, string> = { suspend: "suspender", activate: "reactivar", unlink: "desvincular", revoke: "revocar el acceso a", delete: "eliminar" };
    if (!window.confirm("¿Confirmas " + descriptions[action] + " el dispositivo " + device.name + "?")) return;
    const path = "/connected-devices/" + encodeURIComponent(device.id) + (action === "delete" ? "" : "/" + action);
    await this.runAction(() => this.request(path, action === "delete" ? "DELETE" : "POST", action === "delete" ? undefined : {}), "Acción completada.");
  }
  private async runAction(action: () => Promise<unknown>, success: string): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.error = ""; this.message = "";
    try { await action(); await this.load(); this.message = success; }
    catch (error) { this.error = error instanceof Error ? error.message : "No se pudo completar la operación."; }
    finally { this.busy = false; }
  }
  statusLabel(status: string): string { return ({ active: "Activo", pending: "Pendiente", suspended: "Suspendido", revoked: "Revocado", unlinked: "Desvinculado" } as Record<string, string>)[status] || status; }
}
