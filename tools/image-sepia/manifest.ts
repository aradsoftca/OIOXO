import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-sepia',
  name: 'Sepia',
  blurb: 'Warm vintage sepia tone with a live strength dial.',
  category: 'image',
  tile: 'S',
  icon: 'sun',
  compute: 'local',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  keywords: ['sepia', 'vintage', 'old photo', 'warm tint'],
  offline: true,
};

export default manifest;
