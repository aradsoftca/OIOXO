import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-split',
  name: 'Split Image',
  blurb: 'Slice an image into a grid of tiles — great for Instagram carousels and sprite sheets.',
  category: 'image',
  tile: 'M',
  icon: 'grid-3x3',
  compute: 'instant',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['application/zip', 'image/png', 'image/jpeg'],
  keywords: ['split image', 'slice image', 'image grid', 'instagram grid', 'tiles', 'cut image'],
  pinDefault: false,
  offline: true,
};

export default manifest;
