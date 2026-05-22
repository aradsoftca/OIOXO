import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-frame',
  name: 'Image Frame',
  blurb: 'Wrap any photo in a polaroid, film strip, browser, or solid frame.',
  category: 'image',
  tile: 'M',
  icon: 'frame',
  compute: 'instant',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/png', 'image/jpeg'],
  keywords: ['frame', 'polaroid', 'film strip', 'browser frame', 'border style', 'picture frame'],
  pinDefault: false,
  offline: true,
};

export default manifest;
