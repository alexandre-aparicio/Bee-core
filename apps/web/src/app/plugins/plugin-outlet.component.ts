import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild, ViewContainerRef } from "@angular/core";
import { BeePluginFrontendRegistry } from "./plugin-frontend-registry.service";
import { BeeI18nService } from "../i18n/bee-i18n.service";

type RemotePluginRuntime = { pluginId: string; version: string; entrypoint: string; apiPrefixes: string[] };
type RemoteFrame = { pluginId: string; apiPrefixes: string[] };

@Component({
  selector: "bee-plugin-outlet",
  standalone: true,
  template: `<div #remoteHost class="bee-plugin-remote-host"></div><ng-container #pluginHost></ng-container>`
})
export class BeePluginOutletComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() pluginIds: string[] = [];
  @Input() tenantId = "";
  @Input() role = "member";
  @Input() accessToken = "";
  @Input() section = "";
  @ViewChild("remoteHost", { read: ElementRef, static: true }) private remoteHost!: ElementRef<HTMLDivElement>;
  @ViewChild("pluginHost", { read: ViewContainerRef, static: true }) private host!: ViewContainerRef;
  private viewReady = false;
  private renderSequence = 0;
  private readonly frames = new Map<Window, RemoteFrame>();
  private readonly messageHandler = (event: MessageEvent<unknown>) => { void this.onPluginMessage(event); };

  constructor(private readonly registry: BeePluginFrontendRegistry, private readonly i18n: BeeI18nService) {}

  ngAfterViewInit(): void {
    this.viewReady = true;
    window.addEventListener("message", this.messageHandler);
    void this.render();
  }

  ngOnChanges(_changes: SimpleChanges): void {
    if (this.viewReady) void this.render();
  }

  ngOnDestroy(): void {
    this.renderSequence += 1;
    window.removeEventListener("message", this.messageHandler);
    this.frames.clear();
    this.host.clear();
    this.remoteHost.nativeElement.replaceChildren();
  }

  private async render(): Promise<void> {
    const sequence = ++this.renderSequence;
    this.frames.clear();
    this.host.clear();
    this.remoteHost.nativeElement.replaceChildren();

    for (const pluginId of this.pluginIds) {
      // Use the same native host-component mechanism as the working Documents
      // frontend. Only plugins without a host registration use the remote runtime.
      const registration = this.registry.resolve(pluginId);
      if (registration) {
        if (registration.translations) {
          this.i18n.registerCatalog(pluginId, "en", registration.translations.en);
          this.i18n.registerCatalog(pluginId, "es", registration.translations.es);
        }
        const component = this.host.createComponent(registration.component);
        for (const [name, value] of Object.entries(registration.inputs({ tenantId: this.tenantId, role: this.role, accessToken: this.accessToken, section: this.section }))) {
          component.setInput(name, value);
        }
        continue;
      }

      const runtime = await this.loadRemoteRuntime(pluginId);
      if (sequence !== this.renderSequence) return;
      if (!runtime) continue;
      const frame = document.createElement("iframe");
      frame.title = pluginId + " plugin";
      frame.setAttribute("sandbox", "allow-scripts");
      frame.referrerPolicy = "no-referrer";
      frame.loading = "lazy";
      frame.style.width = "100%";
      frame.style.minHeight = "280px";
      frame.style.border = "0";
      frame.style.display = "block";
      const entrypoint = runtime.entrypoint.split("/").map(encodeURIComponent).join("/");
      frame.src = "/api/plugin-packages/" + encodeURIComponent(pluginId) + "/" + encodeURIComponent(runtime.version) + "/assets/" + entrypoint;
      this.remoteHost.nativeElement.appendChild(frame);
      const frameWindow = frame.contentWindow;
      if (frameWindow) this.frames.set(frameWindow, { pluginId, apiPrefixes: runtime.apiPrefixes });
    }
  }

  private async loadRemoteRuntime(pluginId: string): Promise<RemotePluginRuntime | null> {
    if (!this.accessToken) return null;
    try {
      const response = await fetch("/api/marketplace/plugins/" + encodeURIComponent(pluginId) + "/runtime", {
        method: "GET",
        credentials: "omit",
        headers: { authorization: "Bearer " + this.accessToken }
      });
      if (!response.ok) return null;
      const value = await response.json() as Partial<RemotePluginRuntime>;
      if (value.pluginId !== pluginId || typeof value.version !== "string" || typeof value.entrypoint !== "string" ||
          !value.entrypoint.startsWith("frontend/") || !Array.isArray(value.apiPrefixes) ||
          value.apiPrefixes.some(prefix => typeof prefix !== "string")) return null;
      return value as RemotePluginRuntime;
    } catch {
      return null;
    }
  }

  private async onPluginMessage(event: MessageEvent<unknown>): Promise<void> {
    if (!event.source || typeof event.data !== "object" || event.data === null) return;
    const frame = [...this.frames.entries()].find(([source]) => source === event.source)?.[1];
    if (!frame) return;
    const message = event.data as Record<string, unknown>;
    const target = event.source as Window;
    if (message["type"] === "bee-plugin:ready") {
      target.postMessage({ type: "bee-plugin:init", role: this.role, section: this.section }, "*");
      return;
    }
    if (message["type"] !== "bee-plugin:api-request" || typeof message["requestId"] !== "string" ||
        typeof message["path"] !== "string" || typeof message["method"] !== "string") return;

    const path = message["path"];
    const method = message["method"].toUpperCase();
    const allowedMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
    const pathOnly = path.split("?")[0] ?? path;
    const allowedPath = frame.apiPrefixes.some(prefix => pathOnly === prefix || pathOnly.startsWith(prefix + "/"));
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("..") || path.includes("\\") ||
        path.includes("#") || !allowedMethods.has(method) || !allowedPath) {
      target.postMessage({ type: "bee-plugin:api-response", requestId: message["requestId"], status: 403, payload: { error: "Plugin API capability denied" } }, "*");
      return;
    }

    let body: string | ArrayBuffer | undefined;
    let contentType = "application/json";
    const requestBody = message["body"];
    if (requestBody !== undefined) {
      try {
        if (typeof requestBody === "object" && requestBody !== null && (requestBody as Record<string, unknown>)["__beeBinary"] === true) {
          const binary = requestBody as Record<string, unknown>;
          const encoded = binary["base64"];
          const fileName = binary["fileName"];
          const fileType = binary["contentType"];
          if (typeof encoded !== "string" || encoded.length > 14 * 1024 * 1024 || typeof fileName !== "string" ||
              fileName.length > 255 || typeof fileType !== "string" || fileType !== "text/plain") {
            throw new Error("Invalid or oversized binary upload");
          }
          const decoded = atob(encoded);
          const bytes = new Uint8Array(decoded.length);
          for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index);
          body = bytes.buffer;
          contentType = "application/octet-stream";
        } else {
          const serialized = JSON.stringify(requestBody);
          if (typeof serialized !== "string" || serialized.length > 256 * 1024) throw new Error("Request body too large");
          body = serialized;
        }
      } catch {
        target.postMessage({ type: "bee-plugin:api-response", requestId: message["requestId"], status: 413, payload: { error: "Plugin API request body is invalid or too large" } }, "*");
        return;
      }
    }
    try {
      const binaryUpload = typeof requestBody === "object" && requestBody !== null && (requestBody as Record<string, unknown>)["__beeBinary"] === true;
      const headers: Record<string, string> = { authorization: "Bearer " + this.accessToken };
      if (body !== undefined) headers["content-type"] = contentType;
      if (binaryUpload) {
        const binary = requestBody as Record<string, unknown>;
        headers["x-file-content-type"] = "text/plain";
        headers["x-file-name"] = encodeURIComponent(String(binary["fileName"]).replace(/[\\r\\n]/g, "_"));
      }
      const response = await fetch("/api" + path, {
        method,
        credentials: "omit",
        headers,
        ...(body !== undefined ? { body } : {})
      });
      if (message["responseType"] === "base64" && response.ok) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength > 15 * 1024 * 1024) {
          target.postMessage({ type: "bee-plugin:api-response", requestId: message["requestId"], status: 413, payload: { error: "Downloaded file exceeds the 15 MB plugin bridge limit" } }, "*");
          return;
        }
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        const payload = { base64: btoa(binary), contentType: response.headers.get("content-type") || "application/octet-stream" };
        target.postMessage({ type: "bee-plugin:api-response", requestId: message["requestId"], status: response.status, payload }, "*");
      } else {
        const payload = await response.json().catch(() => ({}));
        target.postMessage({ type: "bee-plugin:api-response", requestId: message["requestId"], status: response.status, payload }, "*");
      }
    } catch {
      target.postMessage({ type: "bee-plugin:api-response", requestId: message["requestId"], status: 502, payload: { error: "Plugin API request failed" } }, "*");
    }
  }
}
