import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-emoji-mosaic',
  name: 'Emoji Mosaic',
  blurb: 'Rebuild any photo out of emoji — pick the density, export as PNG.',
  category: 'image',
  tile: 'M',
  icon: 'smile-plus',
  compute: 'instant',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/png', 'text/plain'],
  keywords: ['emoji mosaic', 'emoji art', 'photo to emoji', 'emoji image', 'mosaic'],
  pinDefault: false,
  offline: true,
};

export default manifest;
