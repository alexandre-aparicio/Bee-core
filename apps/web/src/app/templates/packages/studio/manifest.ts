import type { BeeTemplateManifest } from '../../template.types';

export const STUDIO_MANIFEST: BeeTemplateManifest = {
  id: 'studio',
  name: 'Studio',
  version: '1.0.0',
  target: 'public',
  previewUrl: '/assets/templates/studio/preview.svg',
  description: 'Warm editorial landing page with a bright accent palette.',
  builtIn: false,
  layout: 'public.studio',
  componentId: 'BeeStudioPageComponent',
  appearanceModes: ['light', 'dark'],
  defaultMode: 'light',
  slots: ['header', 'hero', 'content', 'footer']
};
