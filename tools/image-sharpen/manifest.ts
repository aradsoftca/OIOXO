import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-sharpen',
  name: 'Sharpen',
  blurb: 'Crisp edges and fine detail without ringing. Live amount slider.',
  category: 'image',
  tile: 'S',
  icon: 'focus',
  compute: 'local',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  keywords: ['sharpen', 'unsharp', 'crisp', 'detail', 'focus'],
  offline: true,
};

export default manifest;
