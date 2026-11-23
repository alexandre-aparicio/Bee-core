import { Injectable, type Type } from "@angular/core";
import { BeeNotesComponent } from "../notes/notes.component";
import { BeeDocumentsComponent } from "../documents/documents.component";
import { BeeHelloWorldComponent } from "./hello-world.component";
import { NOTES_EN, NOTES_ES } from "../i18n/catalogs/modules/notes.catalog";

export type BeePluginFrontendContext = {
  tenantId: string;
  role: string;
  accessToken: string;
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
    ["notes", {
      component: BeeNotesComponent,
      inputs: context => ({
        tenantId: context.tenantId,
        canWrite: ["owner", "admin", "manager"].includes(context.role)
      }),
      translations: { en: NOTES_EN, es: NOTES_ES }
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
