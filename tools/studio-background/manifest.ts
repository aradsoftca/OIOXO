import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'studio-background',
  name: 'Background Studio',
  blurb: 'Remove backgrounds and replace with colors, gradients, photos, or blur.',
  category: 'image', tile: 'L', icon: 'layers', compute: 'local',
  keywords: ['background remover', 'remove background', 'background replacer', 'photo background', 'transparent background'], offline: false,
};
export default manifest;
