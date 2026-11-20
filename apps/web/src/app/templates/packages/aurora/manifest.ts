import type { BeeTemplateManifest } from '../../template.types';

export const AURORA_MANIFEST: BeeTemplateManifest = {
  "id": "aurora",
  "name": "Aurora",
  "version": "1.0.0",
  "target": "public",
  "description": "Dark, expressive public experience.",
  "builtIn": true,
  "layout": "public.aurora",
  "componentId": "BeeAuroraLayoutComponent",
  "slots": [
    "header",
    "hero",
    "content",
    "footer"
  ]
};
