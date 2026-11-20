import { AURORA_MANIFEST } from './aurora/manifest';
import { EDITORIAL_MANIFEST } from './editorial/manifest';
import { STUDIO_MANIFEST } from './studio/manifest';
import { MIDNIGHT_MANIFEST } from './midnight/manifest';
import { PAPER_MANIFEST } from './paper/manifest';
import { GLASS_MANIFEST } from './glass/manifest';
import { STUDIO_THEME_TOKENS } from './studio/theme-tokens';
import { GLASS_THEME_TOKENS } from './glass/theme-tokens';

export const BUILT_IN_TEMPLATES = [AURORA_MANIFEST, EDITORIAL_MANIFEST, MIDNIGHT_MANIFEST, PAPER_MANIFEST];
export const PACKAGE_TEMPLATES = [STUDIO_MANIFEST, GLASS_MANIFEST];
export const PACKAGE_THEME_TOKENS: Record<string, Record<string, string>> = {
  studio: STUDIO_THEME_TOKENS,
  glass: GLASS_THEME_TOKENS,
};
export const BASE_TEMPLATE_IDS = BUILT_IN_TEMPLATES.map(template => template.id);
export const ALL_TEMPLATE_MANIFESTS = [...BUILT_IN_TEMPLATES, ...PACKAGE_TEMPLATES];
