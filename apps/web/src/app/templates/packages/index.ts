import { AURORA_MANIFEST } from './aurora/manifest';
import { EDITORIAL_MANIFEST } from './editorial/manifest';
import { STUDIO_MANIFEST } from './studio/manifest';
import { MIDNIGHT_MANIFEST } from './midnight/manifest';
import { PAPER_MANIFEST } from './paper/manifest';
import { GLASS_MANIFEST } from './glass/manifest';

export const BUILT_IN_TEMPLATES = [AURORA_MANIFEST, EDITORIAL_MANIFEST, MIDNIGHT_MANIFEST, PAPER_MANIFEST];
export const PACKAGE_TEMPLATES = [STUDIO_MANIFEST, GLASS_MANIFEST];
export const BASE_TEMPLATE_IDS = BUILT_IN_TEMPLATES.map(template => template.id);
export const ALL_TEMPLATE_MANIFESTS = [...BUILT_IN_TEMPLATES, ...PACKAGE_TEMPLATES];

export { BeeAuroraLayoutComponent } from './aurora/components/layout.component';
export { BeeEditorialLayoutComponent } from './editorial/components/layout.component';
export { BeeStudioLayoutComponent } from './studio/components/layout.component';
export { BeeMidnightLayoutComponent } from './midnight/components/layout.component';
export { BeePaperLayoutComponent } from './paper/components/layout.component';
export { BeeGlassLayoutComponent } from './glass/components/layout.component';
