import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-border',
  name: 'Add Border',
  blurb: 'Wrap any photo in a solid color frame — pick width and color.',
  category: 'image',
  tile: 'M',
  icon: 'square',
  compute: 'local',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  keywords: ['border', 'frame', 'matte', 'outline', 'padding'],
  offline: true,
};

export default manifest;
