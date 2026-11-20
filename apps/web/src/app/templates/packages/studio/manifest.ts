import type { BeeTemplateManifest } from '../../template.types';

export const STUDIO_MANIFEST: BeeTemplateManifest = {
  "id": "studio",
  "name": "Studio",
  "version": "1.0.0",
  "target": "public",
  "description": "Warm editorial landing page with a bright accent palette.",
  "builtIn": false,
  "layout": "public.studio",
  "slots": [
    "header",
    "hero",
    "content",
    "footer"
  ]
};
