import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'image-watermark',
  name: 'Add Watermark',
  blurb: 'Stamp a text watermark — single corner or tiled across the whole image.',
  category: 'image', tile: 'M', icon: 'badge', compute: 'local',
  accepts: ['image/*'],
  produces: ['image/png', 'image/jpeg', 'image/webp'],
  keywords: ['image', 'watermark', 'brand', 'tile', 'overlay'], offline: true,
};
export default manifest;
