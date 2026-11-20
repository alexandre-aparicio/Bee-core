import { Injectable, type Type } from "@angular/core";
import { BeeNotesComponent } from "../notes/notes.component";
import { BeeHelloWorldComponent } from "./hello-world.component";

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
    }],
    ["hello-world", {
      component: BeeHelloWorldComponent,
      inputs: () => ({})
    }]
  ]);

  resolve(pluginId: string): BeePluginFrontendRegistration | undefined {
    return this.registrations.get(pluginId);
  }
}
