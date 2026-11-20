import type { BeeTemplateManifest } from '../../template.types';

export const MIDNIGHT_MANIFEST: BeeTemplateManifest = {
  "id": "midnight",
  "name": "Midnight",
  "version": "1.0.0",
  "target": "dashboard",
  "description": "Dark workspace with high-contrast panels.",
  "builtIn": true,
  "layout": "dashboard.midnight",
  "slots": [
    "sidebar",
    "topbar",
    "content",
    "widgets"
  ]
};
