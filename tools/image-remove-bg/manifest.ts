import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-remove-bg',
  name: 'Remove Background',
  blurb: 'Drop a photo. The subject is isolated instantly — no signup, no uploads.',
  category: 'image',
  tile: 'L',
  icon: 'scissors',
  compute: 'webgpu',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/png', 'image/webp'],
  keywords: ['background remove', 'cutout', 'transparent png', 'subject isolation', 'remove bg', 'no background'],
  pinDefault: true,
  offline: true,
};

export default manifest;
