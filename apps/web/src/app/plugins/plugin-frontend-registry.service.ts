import { Injectable, type Type } from "@angular/core";
import { BeeDocumentsComponent } from "../documents/documents.component";
import { BeeConnectedDevicesComponent } from "../connected-devices/connected-devices.component";
import { BeeTimeTrackingComponent } from "../time-tracking/time-tracking.component";

export type BeePluginFrontendContext = {
  tenantId: string;
  role: string;
  accessToken: string;
  section: string;
};

export type BeePluginFrontendRegistration = {
  component: Type<unknown>;
  inputs: (context: BeePluginFrontendContext) => Record<string, unknown>;
  translations?: { en: Record<string, string>; es: Record<string, string> };
};

/**
 * Only components compiled into the trusted Angular build can be mounted.
 * The server-side plugin manifest/catalog controls whether a plugin ID is active.
 */
@Injectable({ providedIn: "root" })
export class BeePluginFrontendRegistry {
  private readonly registrations = new Map<string, BeePluginFrontendRegistration>([
    ["documents", { component: BeeDocumentsComponent, inputs: context => ({ tenantId: context.tenantId, accessToken: context.accessToken }) }],
    ["connected-devices", { component: BeeConnectedDevicesComponent, inputs: context => ({ tenantId: context.tenantId, role: context.role, accessToken: context.accessToken }) }],
    ["time-tracking", { component: BeeTimeTrackingComponent, inputs: context => ({ tenantId: context.tenantId, role: context.role, accessToken: context.accessToken, section: context.section }) }],
  ]);

  resolve(pluginId: string): BeePluginFrontendRegistration | undefined {
    return this.registrations.get(pluginId);
  }
}
