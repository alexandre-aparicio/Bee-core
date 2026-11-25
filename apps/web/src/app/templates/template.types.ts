import type { BeeTemplateSlotName } from './template-slot-registry.service';

export type BeeTemplateTarget = 'public' | 'dashboard';
export type BeeTemplateAppearanceMode = 'light' | 'dark';

export interface BeeTemplateManifest {
  id: string;
  name: string;
  version: string;
  target: BeeTemplateTarget;
  description: string;
  previewUrl?: string;
  builtIn: boolean;
  layout: string;
  componentId: string;
  slots: BeeTemplateSlotName[];
  appearanceModes?: BeeTemplateAppearanceMode[];
  defaultMode?: BeeTemplateAppearanceMode;
}

export interface BeeTemplateSelection {
  public: string;
  dashboard: string;
}
