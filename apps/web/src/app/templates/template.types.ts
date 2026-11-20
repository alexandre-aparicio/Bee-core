export type BeeTemplateTarget = 'public' | 'dashboard';

export interface BeeTemplateManifest {
  id: string;
  name: string;
  version: string;
  target: BeeTemplateTarget;
  description: string;
  builtIn: boolean;
  layout: string;
  slots: string[];
}

export interface BeeTemplateSelection {
  public: string;
  dashboard: string;
}
