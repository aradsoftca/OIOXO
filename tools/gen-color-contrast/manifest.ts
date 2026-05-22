import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'gen-color-contrast',
  name: 'Contrast Checker',
  blurb: 'WCAG 2.x contrast ratio for any two colors — AA / AAA verdicts.',
  category: 'generator', tile: 'M', icon: 'contrast', compute: 'instant',
  keywords: ['contrast', 'wcag', 'accessibility', 'a11y', 'color contrast'], offline: true,
};
export default manifest;
