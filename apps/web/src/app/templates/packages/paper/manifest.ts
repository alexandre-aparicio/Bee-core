import type { BeeTemplateManifest } from '../../template.types';

export const PAPER_MANIFEST: BeeTemplateManifest = {
  id: 'paper',
  name: 'Paper',
  version: '1.0.0',
  target: 'dashboard',
  previewUrl: '/assets/templates/paper/preview.svg',
  description: 'Light workspace for long working sessions.',
  builtIn: true,
  layout: 'dashboard.paper',
  componentId: 'BeePaperPageComponent',
  appearanceModes: ['light', 'dark'],
  defaultMode: 'light',
  slots: ['sidebar', 'topbar', 'content', 'widgets']
};
