import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-compare',
  name: 'Compare Images',
  blurb: 'Drop two images and slide between them — perfect for before/after.',
  category: 'image',
  tile: 'L',
  icon: 'columns-2',
  compute: 'instant',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: [],
  keywords: ['compare images', 'before after', 'image slider', 'diff images', 'side by side'],
  pinDefault: false,
  offline: true,
};

export default manifest;
