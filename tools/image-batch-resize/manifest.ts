import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-batch-resize',
  name: 'Batch Resize',
  blurb: 'Resize a whole folder of images at once — by longest edge or exact width.',
  category: 'image',
  tile: 'M',
  icon: 'scaling',
  compute: 'instant',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['application/zip'],
  keywords: ['batch resize', 'bulk resize', 'resize many images', 'resize folder'],
  pinDefault: false,
  offline: true,
};

export default manifest;
