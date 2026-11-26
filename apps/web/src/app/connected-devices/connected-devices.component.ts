import { CommonModule } from "@angular/common";
import { ChangeDetectorRef, Component, ElementRef, Input, OnChanges, ViewChild } from "@angular/core";
import { FormsModule } from "@angular/forms";

type Dispositivo = {
  id: string;
  name: string;
  deviceType: string;
  platform: string;
  appVersion?: string;
  requestedPermisos: string[];
  grantedPermisos: string[];
  status: string;
  owner?: { name?: string; email?: string };
  lastSeenAt?: string;
  createdAt?: string;
};
type Pairing = { challengeId: string; qrPayload: string; expiresAt: string };
type DispositivoView = "cards" | "table";

const CAPABILITIES = [
  { id: "device.status.write", label: "Dispositivo status" },
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
  selector: "bee-connected-dispositivos",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="bee-connected-dispositivos">
      <div *ngIf="error" class="bee-status--danger" role="alert">{{error}}</div>
      <div *ngIf="message" class="bee-status--success" role="status">{{message}}</div>

      <header class="bee-page-header">
        <div>
          <span class="bee-eyebrow">ESPACIO DE TRABAJO / PLATAFORMA</span>
          <h2>Dispositivos conectados</h2>
          <p>Registra dispositivos, consulta su estado de conexión y administra sus permisos en Bee-core.</p>
        </div>
        <button type="button" class="bee-button bee-button--secondary" (click)="load()" [disabled]="loading || busy">Actualizar</button>
      </header>

      <section class="bee-stat-grid" aria-label="Resumen de dispositivos">
        <article class="bee-stat-card"><span>Total de dispositivos</span><strong>{{dispositivos.length}}</strong><small>Registrados en esta organización</small></article>
        <article class="bee-stat-card"><span>Activos</span><strong>{{activeCount}}</strong><small>Autorizados y disponibles</small></article>
        <article class="bee-stat-card"><span>Pendientes de aprobación</span><strong>{{pendingCount}}</strong><small>Esperando revisión de permisos</small></article>
        <article class="bee-stat-card"><span>Requieren atención</span><strong>{{attentionCount}}</strong><small>Suspenderidos, revocados o caducados</small></article>
      </section>

      <section class="bee-directory">
        <header class="bee-section-heading">
          <div><h3>Dispositivos de la organización</h3><p>{{filteredDispositivos.length}} of {{dispositivos.length}} dispositivos</p></div>
          <button type="button" class="bee-button bee-button--secondary" (click)="load()" [disabled]="loading">Actualizar list</button>
        </header>

        <div class="bee-toolbar" aria-label="Dispositivo directory controls">
          <div class="bee-toolbar__filters">
            <label class="bee-search">
              <span aria-hidden="true">⌕</span>
              <input type="search" [(ngModel)]="search" name="deviceSearch" placeholder="Search dispositivos…" aria-label="Search dispositivos">
              <button *ngIf="search" type="button" (click)="search=''" aria-label="Clear search">×</button>
            </label>
            <select class="bee-filter" [(ngModel)]="statusFilter" name="deviceEstado" aria-label="Filter dispositivos by status">
              <option value="all">Todos los estados</option><option value="active">Activos</option><option value="pending">Pendiente</option>
              <option value="suspendered">Suspenderido</option><option value="revoked">Revocado</option><option value="desvinculared">Desvinculado</option><option value="expired">Caducado</option>
            </select>
            <select class="bee-filter" [(ngModel)]="typeFilter" name="deviceType" aria-label="Filter dispositivos by type">
              <option value="all">Todos los tipos</option>
              <option *ngFor="let type of deviceTypes" [value]="type">{{type}}</option>
            </select>
          </div>
          <div class="bee-toolbar__actions">
            <div class="bee-view-toggle" role="group" aria-label="Modo de visualización">
              <button type="button" [class.is-active]="view==='cards'" [attr.aria-pressed]="view==='cards'" (click)="view='cards'" aria-label="Vista de tarjetas" title="Vista de tarjetas">▦</button>
              <button type="button" [class.is-active]="view==='table'" [attr.aria-pressed]="view==='table'" (click)="view='table'" aria-label="Vista de tabla" title="Vista de tabla">☷</button>
            </div>
            <button *ngIf="canManage" type="button" class="bee-button bee-button--primary" (click)="openCreate()">＋ Nuevo dispositivo</button>
          </div>
        </div>

        <div *ngIf="loading && !dispositivos.length" class="bee-empty-state" role="status">Loading dispositivos…</div>
        <div *ngIf="!loading && !dispositivos.length" class="bee-empty-state">
          <strong>No dispositivos connected yet</strong><span>Genera un código QR para registrar tu primer dispositivo.</span>
          <button *ngIf="canManage" type="button" class="bee-button bee-button--primary" (click)="openCreate()">Nuevo dispositivo</button>
        </div>
        <div *ngIf="dispositivos.length && !filteredDispositivos.length" class="bee-empty-state">
          <strong>No matching dispositivos</strong><span>Prueba con otra búsqueda o filtros.</span>
          <button type="button" class="bee-button bee-button--secondary" (click)="clearFilters()">Limpiar filtros</button>
        </div>

        <div class="bee-card-grid" *ngIf="filteredDispositivos.length && view==='cards'">
          <article class="bee-dashboard-card bee-device-card" *ngFor="let device of filteredDispositivos; trackBy: trackDispositivo">
            <header class="bee-device-card__header">
              <span class="bee-device-card__icon" aria-hidden="true">▣</span>
              <div class="bee-device-card__identity"><h4>{{device.name}}</h4><p>{{device.deviceType}} · {{device.platform}}</p></div>
              <span class="bee-badge" [ngClass]="statusClass(device.status)">{{statusLabel(device.status)}}</span>
            </header>
            <div class="bee-device-card__details">
              <div><span>Propietario</span><strong>{{device.owner?.name || device.owner?.email || '—'}}</strong></div>
              <div><span>Última conexión</span><strong>{{device.lastSeenAt ? (device.lastSeenAt | date:'medium') : 'Nunca'}}</strong></div>
              <div><span>Permisos concedidos</span><strong>{{device.grantedPermisos?.length || 0}}</strong></div>
            </div>
            <div class="bee-device-card__capabilities">
              <span *ngFor="let capability of (device.grantedPermisos || []).slice(0,3)" class="bee-badge">{{capability}}</span>
              <span *ngIf="(device.grantedPermisos || []).length>3" class="bee-badge">+{{device.grantedPermisos.length-3}}</span>
              <span *ngIf="!device.grantedPermisos?.length" class="bee-text-muted">No hay permisos concedidos</span>
            </div>
            <div *ngIf="device.status==='pending' && canManage" class="bee-device-card__approval">
              <strong>Permisos solicitados</strong>
              <label *ngFor="let capability of device.requestedPermisos">
                <input type="checkbox" [checked]="grants[device.id]?.includes(capability)" (change)="toggleGrant(device.id,capability,$any($event.target).checked)">
                {{capability}}
              </label>
              <button type="button" class="bee-button bee-button--primary" (click)="approve(device)" [disabled]="busy || !grants[device.id]?.length">Aprobar selección</button>
            </div>
            <footer class="bee-device-card__footer">
              <span class="bee-text-muted">{{device.appVersion || device.deviceType}}</span>
              <details class="bee-menu" *ngIf="canManage">
                <summary aria-label="Acciones del dispositivo">⋮</summary>
                <div role="menu">
                  <button *ngIf="device.status==='active'" type="button" role="menuitem" (click)="act(device,'suspender')">Suspender</button>
                  <button *ngIf="device.status==='suspendered'" type="button" role="menuitem" (click)="act(device,'activate')">Reactivar</button>
                  <button *ngIf="!['desvinculared','revoked','expired'].includes(device.status)" type="button" role="menuitem" (click)="act(device,'desvincular')">Desvincular</button>
                  <button *ngIf="!['desvinculared','revoked','expired'].includes(device.status)" type="button" role="menuitem" (click)="act(device,'revoke')">Revocar acceso</button>
                  <button type="button" role="menuitem" class="bee-menu__danger" (click)="act(device,'eliminar')">Eliminar</button>
                </div>
              </details>
            </footer>
          </article>
        </div>

        <div class="bee-table-wrap" *ngIf="filteredDispositivos.length && view==='table'">
          <table>
            <thead><tr><th>Dispositivo</th><th>Propietario</th><th>Estado</th><th>Permisos</th><th>Última conexión</th><th *ngIf="canManage">Acciones</th></tr></thead>
            <tbody>
              <tr *ngFor="let device of filteredDispositivos; trackBy: trackDispositivo">
                <td><strong>{{device.name}}</strong><small class="bee-text-muted">{{device.deviceType}} · {{device.platform}}</small></td>
                <td>{{device.owner?.name || device.owner?.email || '—'}}</td>
                <td><span class="bee-badge" [ngClass]="statusClass(device.status)">{{statusLabel(device.status)}}</span></td>
                <td>{{device.grantedPermisos?.length || 0}}</td>
                <td>{{device.lastSeenAt ? (device.lastSeenAt | date:'medium') : 'Nunca'}}</td>
                <td *ngIf="canManage"><details class="bee-menu"><summary aria-label="Acciones del dispositivo">⋮</summary><div role="menu">
                  <button *ngIf="device.status==='active'" type="button" role="menuitem" (click)="act(device,'suspender')">Suspender</button>
                  <button *ngIf="device.status==='suspendered'" type="button" role="menuitem" (click)="act(device,'activate')">Reactivar</button>
                  <button *ngIf="!['desvinculared','revoked','expired'].includes(device.status)" type="button" role="menuitem" (click)="act(device,'desvincular')">Desvincular</button>
                  <button *ngIf="!['desvinculared','revoked','expired'].includes(device.status)" type="button" role="menuitem" (click)="act(device,'revoke')">Revocar acceso</button>
                  <button type="button" role="menuitem" class="bee-menu__danger" (click)="act(device,'eliminar')">Eliminar</button>
                </div></details></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div class="bee-modal-overlay" *ngIf="modalOpen" (click)="closeModal()">
        <section class="bee-modal" role="dialog" aria-modal="true" aria-labelledby="device-modal-title" (click)="$event.stopPropagation()" (keydown.escape)="closeModal()" tabindex="-1">
          <header class="bee-modal__header"><div><span class="bee-eyebrow">REGISTRO DE DISPOSITIVO</span><h3 id="device-modal-title">Nuevo dispositivo</h3><p>Selecciona los permisos que podrá solicitar el dispositivo. Seguirán requiriendo aprobación explícita.</p></div>
            <button type="button" class="bee-icon-button" (click)="closeModal()" aria-label="Cerrar dialog">×</button>
          </header>
          <div *ngIf="!pairing" class="bee-modal__body">
            <strong>Permisos solicitados</strong>
            <div class="bee-choice-grid">
              <label *ngFor="let capability of capabilities"><input type="checkbox" [checked]="selectedPermisos.includes(capability.id)" (change)="toggleCapability(capability.id,$any($event.target).checked)">{{capability.label}}</label>
            </div>
            <p class="bee-text-muted">El código QR es válido durante cinco minutos. Escanearlo no concede acceso hasta que un administrador apruebe el dispositivo.</p>
          </div>
          <div *ngIf="pairing" class="bee-modal__body bee-pairing">
            <strong>Escanea este código QR desde la aplicación del dispositivo</strong>
            <div #qrContainer class="bee-pairing__qr" role="img" aria-label="Dispositivo pairing QR code"></div>
            <code>{{pairing.qrPayload}}</code>
            <span class="bee-text-muted">Caduca {{pairing.expiresAt | date:'medium'}}</span>
            <button type="button" class="bee-button bee-button--secondary" (click)="copyPairing()">Copiar código de vinculación</button>
          </div>
          <footer class="bee-modal__footer">
            <button type="button" class="bee-button bee-button--secondary" (click)="closeModal()">Cerrar</button>
            <button *ngIf="!pairing" type="button" class="bee-button bee-button--primary" (click)="createPairing()" [disabled]="busy || !selectedPermisos.length">{{busy ? 'Generando…' : 'Generar código QR'}}</button>
            <button *ngIf="pairing" type="button" class="bee-button bee-button--danger" (click)="cancelPairing()" [disabled]="busy">Cancelar vinculación</button>
          </footer>
        </section>
      </div>
    </section>
  `
})
export class BeeConnectedDispositivosComponent implements OnChanges {
  @ViewChild("qrContainer") private qrContainer?: ElementRef<HTMLDivElement>;
  constructor(private readonly changeDetector: ChangeDetectorRef) {}
  @Input() tenantId = "";
  @Input() role = "member";
  @Input() accessToken = "";
  @Input() section = "";

  readonly capabilities = CAPABILITIES;
  dispositivos: Dispositivo[] = [];
  selectedPermisos: string[] = ["device.status.write"];
  grants: Record<string, string[]> = {};
  pairing: Pairing | null = null;
  search = "";
  statusFilter = "all";
  typeFilter = "all";
  view: DispositivoView = "cards";
  modalOpen = false;
  canManage = false;
  loading = false;
  busy = false;
  error = "";
  message = "";

  get activeCount(): number { return this.dispositivos.filter(device => device.status === "active").length; }
  get pendingCount(): number { return this.dispositivos.filter(device => device.status === "pending").length; }
  get attentionCount(): number { return this.dispositivos.filter(device => ["suspendered", "revoked", "expired"].includes(device.status)).length; }
  get deviceTypes(): string[] { return [...new Set(this.dispositivos.map(device => device.deviceType).filter(Boolean))].sort(); }
  get filteredDispositivos(): Dispositivo[] {
    const term = this.search.trim().toLowerCase();
    return this.dispositivos.filter(device => {
      const matchesTerm = !term || [device.name, device.deviceType, device.platform, device.owner?.name, device.owner?.email].some(value => String(value || "").toLowerCase().includes(term));
      return matchesTerm && (this.statusFilter === "all" || device.status === this.statusFilter) && (this.typeFilter === "all" || device.deviceType === this.typeFilter);
    });
  }

  ngOnChanges(): void { if (this.accessToken) void this.load(); }
  trackDispositivo(_index: number, device: Dispositivo): string { return device.id; }
  clearFilters(): void { this.search = ""; this.statusFilter = "all"; this.typeFilter = "all"; }
  openCreate(): void {
    this.error = ""; this.message = ""; this.pairing = null;
    this.selectedPermisos = ["device.status.write"];
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
    if (!response.ok) throw new Error(payload.error || "Connected Dispositivos request failed (" + response.status + ").");
    return payload;
  }
  async load(): Promise<void> {
    if (!this.accessToken || this.loading) return;
    this.loading = true; this.error = "";
    try {
      const result = await this.request("/connected-dispositivos");
      this.dispositivos = Array.isArray(result.dispositivos) ? result.dispositivos : [];
      this.canManage = Boolean(result.canManage);
      for (const device of this.dispositivos) if (device.status === "pending" && !this.grants[device.id]) this.grants[device.id] = [...(device.requestedPermisos || [])];
    } catch (error) { this.error = error instanceof Error ? error.message : "Could not load dispositivos."; }
    finally { this.loading = false; }
  }
  toggleCapability(id: string, checked: boolean): void { this.selectedPermisos = checked ? [...this.selectedPermisos, id] : this.selectedPermisos.filter(item => item !== id); }
  toggleGrant(deviceId: string, id: string, checked: boolean): void {
    const current = this.grants[deviceId] || [];
    this.grants[deviceId] = checked ? [...current, id] : current.filter(item => item !== id);
  }
  async createPairing(): Promise<void> {
    if (this.busy || !this.selectedPermisos.length) return;
    this.busy = true; this.error = ""; this.message = "";
    try {
      this.pairing = await this.request("/connected-dispositivos/pairing-challenges", "POST", { requestedPermisos: this.selectedPermisos });
      if (!(window as any).QRCode) throw new Error("El generador QR no está disponible en esta carga de la aplicación.");
      this.changeDetector.detectChanges();
      this.renderQr();
    } catch (error) { this.error = error instanceof Error ? error.message : "No se pudo generar el código de vinculación."; }
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
    await this.runAction(() => this.request("/connected-dispositivos/pairing-challenges/" + encodeURIComponent(this.pairing!.challengeId) + "/cancel", "POST", {}), "Código de vinculación cancelado.");
    this.pairing = null;
    this.changeDetector.detectChanges();
  }
  async copyPairing(): Promise<void> {
    if (!this.pairing) return;
    try { await navigator.clipboard.writeText(this.pairing.qrPayload); this.message = "Código copiado."; }
    catch { this.error = "No se pudo copiar el código. Selecciónalo manualmente."; }
  }
  async approve(device: Dispositivo): Promise<void> {
    const grantedPermisos = this.grants[device.id] || [];
    if (!grantedPermisos.length) return;
    await this.runAction(() => this.request("/connected-dispositivos/" + encodeURIComponent(device.id) + "/approve", "POST", { grantedPermisos }), "Dispositivo approved.");
  }
  async act(device: Dispositivo, action: "suspender" | "activate" | "desvincular" | "revoke" | "eliminar"): Promise<void> {
    const labels: Record<string, string> = { suspender: "suspender", activate: "reactivar", desvincular: "desvincular", revoke: "revocar el acceso a", eliminar: "eliminar" };
    if (!window.confirm("¿Confirmas " + labels[action] + " " + device.name + "?")) return;
    const path = "/connected-dispositivos/" + encodeURIComponent(device.id) + (action === "eliminar" ? "" : "/" + action);
    await this.runAction(() => this.request(path, action === "eliminar" ? "DELETE" : "POST", action === "eliminar" ? undefined : {}), "Acción completada.");
  }
  private async runAction(action: () => Promise<unknown>, success: string): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.error = ""; this.message = "";
    try { await action(); await this.load(); this.message = success; }
    catch (error) { this.error = error instanceof Error ? error.message : "No se pudo completar la operación."; }
    finally { this.busy = false; }
  }
  statusLabel(status: string): string {
    return ({ active: "Activos", pending: "Pendiente", suspendered: "Suspenderido", revoked: "Revocado", desvinculared: "Desvinculado", expired: "Caducado" } as Record<string, string>)[status] || status;
  }
  statusClass(status: string): string {
    if (status === "active") return "bee-badge--success";
    if (status === "pending") return "bee-badge--warning";
    if (["suspendered", "revoked", "expired"].includes(status)) return "bee-badge--danger";
    return "";
  }
}
