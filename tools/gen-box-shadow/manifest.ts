import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'gen-box-shadow',
  name: 'Box Shadow',
  blurb: 'Layer up to four shadows on a live preview — copy the CSS instantly.',
  category: 'generator', tile: 'M', icon: 'square', compute: 'instant',
  keywords: ['css', 'box shadow', 'shadow', 'drop shadow'], offline: true,
};
export default manifest;
