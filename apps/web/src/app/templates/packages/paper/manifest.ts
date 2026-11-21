import type { BeeTemplateManifest } from '../../template.types';

export const PAPER_MANIFEST: BeeTemplateManifest = {
  "id": "paper",
  "name": "Paper",
  "version": "1.0.0",
  "target": "dashboard",
  "description": "Light workspace for long working sessions.",
  "builtIn": true,
  "layout": "dashboard.paper",
  "componentId": "BeePaperPageComponent",
  "slots": [
    "sidebar",
    "topbar",
    "content",
    "widgets"
  ]
};
