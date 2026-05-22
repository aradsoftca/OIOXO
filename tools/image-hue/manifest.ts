import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-hue',
  name: 'Hue Shift',
  blurb: 'Rotate the color wheel — turn skies pink, grass blue, anything.',
  category: 'image',
  tile: 'M',
  icon: 'palette',
  compute: 'local',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  keywords: ['hue', 'color shift', 'recolor', 'palette rotate'],
  offline: true,
};

export default manifest;
