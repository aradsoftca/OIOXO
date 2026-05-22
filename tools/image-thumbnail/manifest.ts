import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-thumbnail',
  name: 'Thumbnail Maker',
  blurb: 'Generate every common thumbnail size in one go — favicons to social posts.',
  category: 'image',
  tile: 'M',
  icon: 'gallery-horizontal',
  compute: 'instant',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['application/zip', 'image/png', 'image/jpeg', 'image/webp'],
  keywords: ['thumbnail', 'image sizes', 'multi-size', 'favicon sizes', 'app icon sizes'],
  pinDefault: false,
  offline: true,
};

export default manifest;
