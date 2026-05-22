import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-batch-compress',
  name: 'Batch Compress',
  blurb: 'Squeeze a pile of images smaller in one pass — set the quality, get a ZIP.',
  category: 'image',
  tile: 'M',
  icon: 'archive',
  compute: 'instant',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['application/zip'],
  keywords: ['batch compress', 'bulk compress', 'compress many images', 'shrink images'],
  pinDefault: false,
  offline: true,
};

export default manifest;
