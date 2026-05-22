import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-meme',
  name: 'Meme Maker',
  blurb: 'Drop a photo, add top and bottom captions in classic meme style — done.',
  category: 'image',
  tile: 'M',
  icon: 'smile',
  compute: 'instant',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/png', 'image/jpeg'],
  keywords: ['meme', 'meme generator', 'caption image', 'top text bottom text', 'image meme'],
  pinDefault: false,
  offline: true,
};

export default manifest;
