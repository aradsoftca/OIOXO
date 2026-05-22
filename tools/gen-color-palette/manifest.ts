import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'gen-color-palette',
  name: 'Color Palette',
  blurb: 'Generate color schemes — complementary, analogous, triadic, more.',
  category: 'generator', tile: 'M', icon: 'palette', compute: 'instant',
  keywords: ['color palette', 'color scheme', 'harmony', 'analogous', 'triadic'], offline: true,
};
export default manifest;
