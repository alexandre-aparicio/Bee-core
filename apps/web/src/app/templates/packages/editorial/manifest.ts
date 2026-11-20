import type { BeeTemplateManifest } from '../../template.types';

export const EDITORIAL_MANIFEST: BeeTemplateManifest = {
  "id": "editorial",
  "name": "Editorial",
  "version": "1.0.0",
  "target": "public",
  "description": "Light, content-first public experience.",
  "builtIn": true,
  "layout": "public.editorial",
  "slots": [
    "header",
    "hero",
    "content",
    "footer"
  ]
};
