import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-ascii-art',
  name: 'ASCII Art',
  blurb: 'Convert any image into text art — copy as text or download as PNG.',
  category: 'image',
  tile: 'M',
  icon: 'type',
  compute: 'instant',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['text/plain', 'image/png'],
  keywords: ['ascii art', 'text art', 'ansi art', 'image to text art', 'character art'],
  pinDefault: false,
  offline: true,
};

export default manifest;
