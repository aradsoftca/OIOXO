import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-batch-convert',
  name: 'Batch Convert',
  blurb: 'Convert many images to one format at once — PNG, JPG, or WebP.',
  category: 'image',
  tile: 'M',
  icon: 'repeat',
  compute: 'instant',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['application/zip'],
  keywords: ['batch convert', 'bulk convert', 'convert many images', 'png to jpg bulk', 'webp bulk'],
  pinDefault: false,
  offline: true,
};

export default manifest;
