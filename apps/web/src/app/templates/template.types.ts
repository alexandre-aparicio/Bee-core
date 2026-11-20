import type { BeeTemplateSlotName } from './template-slot-registry.service';

export type BeeTemplateTarget = 'public' | 'dashboard';

export interface BeeTemplateManifest {
  id: string;
  name: string;
  version: string;
  target: BeeTemplateTarget;
  description: string;
  builtIn: boolean;
  layout: string;
  slots: BeeTemplateSlotName[];
}

export interface BeeTemplateSelection {
  public: string;
  dashboard: string;
}
