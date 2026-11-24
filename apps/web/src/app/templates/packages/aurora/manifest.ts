import type { BeeTemplateManifest } from '../../template.types';

export const AURORA_MANIFEST: BeeTemplateManifest = {
  id: 'aurora',
  name: 'Aurora',
  version: '1.0.0',
  target: 'public',
  previewUrl: '/assets/templates/aurora/preview.svg',
  description: 'Dark, expressive public experience.',
  builtIn: true,
  layout: 'public.aurora',
  componentId: 'BeeAuroraPageComponent',
  appearanceModes: ['light', 'dark'],
  defaultMode: 'dark',
  slots: ['header', 'hero', 'content', 'footer']
};
