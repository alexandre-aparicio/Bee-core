import { Injectable, type Type } from "@angular/core";
import { BeeNotesComponent } from "../notes/notes.component";

export type BeePluginFrontendContext = {
  tenantId: string;
  role: string;
};

export type BeePluginFrontendRegistration = {
  component: Type<unknown>;
  inputs: (context: BeePluginFrontendContext) => Record<string, unknown>;
};

/**
 * Only components compiled into the trusted Angular build can be mounted.
 * The server-side plugin manifest/catalog controls whether a plugin ID is active.
 */
@Injectable({ providedIn: "root" })
export class BeePluginFrontendRegistry {
  private readonly registrations = new Map<string, BeePluginFrontendRegistration>([
    ["notes", {
      component: BeeNotesComponent,
      inputs: context => ({
        tenantId: context.tenantId,
        canWrite: ["owner", "admin", "manager"].includes(context.role)
      })
    }]
  ]);

  resolve(pluginId: string): BeePluginFrontendRegistration | undefined {
    return this.registrations.get(pluginId);
  }
}
