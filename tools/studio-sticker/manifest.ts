import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'studio-sticker',
  name: 'Sticker Studio',
  blurb: 'Turn photos into vinyl stickers. Instant background cutout, custom thick outline borders, 3D shadows, and ribbon badges.',
  category: 'image',
  tile: 'L',
  icon: 'smile',
  compute: 'instant',
  keywords: ['sticker maker', 'vinyl sticker', 'contour border', 'transparent sticker', 'background remover'],
  offline: false,
};

export default manifest;
