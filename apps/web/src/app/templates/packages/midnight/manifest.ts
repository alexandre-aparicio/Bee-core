import type { BeeTemplateManifest } from '../../template.types';

export const MIDNIGHT_MANIFEST: BeeTemplateManifest = {
  "id": "midnight",
  "name": "Midnight",
  "version": "1.0.0",
  "target": "dashboard",
  "previewUrl": "/assets/templates/midnight/preview.svg",
  "description": "Dark workspace with high-contrast panels.",
  "builtIn": true,
  "layout": "dashboard.midnight",
  "componentId": "BeeMidnightPageComponent",
  "appearanceModes": ["light", "dark"],
  "defaultMode": "dark",
  "slots": [
    "sidebar",
    "topbar",
    "content",
    "widgets"
  ]
};
