import type { BeeTemplateManifest } from '../../template.types';

export const GLASS_MANIFEST: BeeTemplateManifest = {
  id: 'glass',
  name: 'Glass',
  version: '1.0.0',
  target: 'dashboard',
  previewUrl: '/assets/templates/glass/preview.svg',
  description: 'Soft glass workspace with cool blue and violet accents.',
  builtIn: false,
  layout: 'dashboard.glass',
  componentId: 'BeeGlassPageComponent',
  appearanceModes: ['light', 'dark'],
  defaultMode: 'dark',
  slots: ['sidebar', 'topbar', 'content', 'widgets']
};
