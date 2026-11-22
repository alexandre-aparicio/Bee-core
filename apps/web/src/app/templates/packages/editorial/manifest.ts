import type { BeeTemplateManifest } from '../../template.types';

export const EDITORIAL_MANIFEST: BeeTemplateManifest = {
  "id": "editorial",
  "name": "Editorial",
  "version": "1.0.0",
  "target": "public",
  "previewUrl": "/assets/templates/editorial/preview.svg",
  "description": "Light, content-first public experience.",
  "builtIn": true,
  "layout": "public.editorial",
  "componentId": "BeeEditorialPageComponent",
  "slots": [
    "header",
    "hero",
    "content",
    "footer"
  ]
};
