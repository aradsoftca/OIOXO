import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-vignette',
  name: 'Vignette',
  blurb: 'Soft dark edges that draw the eye to your subject.',
  category: 'image',
  tile: 'M',
  icon: 'aperture',
  compute: 'local',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  keywords: ['vignette', 'dark edges', 'frame', 'portrait', 'border darken'],
  offline: true,
};

export default manifest;
