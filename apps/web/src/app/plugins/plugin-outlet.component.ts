import { AfterViewInit, Component, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild, ViewContainerRef } from "@angular/core";
import { BeePluginFrontendRegistry } from "./plugin-frontend-registry.service";
import { BeeI18nService } from "../i18n/bee-i18n.service";

@Component({
  selector: "bee-plugin-outlet",
  standalone: true,
  template: `<ng-container #pluginHost></ng-container>`
})
export class BeePluginOutletComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() pluginIds: string[] = [];
  @Input() tenantId = "";
  @Input() role = "member";
  @ViewChild("pluginHost", { read: ViewContainerRef, static: true }) private host!: ViewContainerRef;
  private viewReady = false;

  constructor(private readonly registry: BeePluginFrontendRegistry, private readonly i18n: BeeI18nService) {}

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.render();
  }

  ngOnChanges(_changes: SimpleChanges): void {
    if (this.viewReady) this.render();
  }

  ngOnDestroy(): void {
    this.host.clear();
  }

  private render(): void {
    this.host.clear();
    for (const pluginId of this.pluginIds) {
      const registration = this.registry.resolve(pluginId);
      if (!registration) continue;
      if (registration.translations) {
        this.i18n.registerCatalog(pluginId, "en", registration.translations.en);
        this.i18n.registerCatalog(pluginId, "es", registration.translations.es);
      }
      const component = this.host.createComponent(registration.component);
      for (const [name, value] of Object.entries(registration.inputs({ tenantId: this.tenantId, role: this.role }))) {
        component.setInput(name, value);
      }
    }
  }
}
