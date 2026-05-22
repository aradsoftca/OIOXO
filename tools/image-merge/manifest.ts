import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-merge',
  name: 'Merge Images',
  blurb: 'Stitch images together — horizontally, vertically, or in a grid.',
  category: 'image',
  tile: 'M',
  icon: 'images',
  compute: 'instant',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/png', 'image/jpeg'],
  keywords: ['merge images', 'combine images', 'stitch images', 'join images', 'image strip'],
  pinDefault: false,
  offline: true,
};

export default manifest;
