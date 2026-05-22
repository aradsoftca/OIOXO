import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-compress',
  name: 'Compress Image',
  blurb: 'Shrink any JPG, PNG, WebP, or AVIF. See savings live as you tune quality.',
  category: 'image',
  tile: 'L',
  icon: 'archive',
  compute: 'webgpu',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  keywords: ['compress', 'shrink', 'reduce size', 'optimize', 'jpeg', 'webp', 'avif', 'mozjpeg'],
  pinDefault: true,
  offline: true,
};

export default manifest;
