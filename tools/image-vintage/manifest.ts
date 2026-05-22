import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-vintage',
  name: 'Vintage',
  blurb: 'Faded, warm, slightly punchy. Instant vintage film look.',
  category: 'image',
  tile: 'M',
  icon: 'camera',
  compute: 'local',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  keywords: ['vintage', 'retro', 'film', 'analog', 'faded'],
  offline: true,
};

export default manifest;
