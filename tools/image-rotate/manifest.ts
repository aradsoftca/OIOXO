import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-rotate',
  name: 'Rotate',
  blurb: 'Turn by 90° steps or any custom angle. Edge color picker included.',
  category: 'image',
  tile: 'M',
  icon: 'rotate-cw',
  compute: 'local',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  keywords: ['rotate', 'turn', 'straighten', 'orient'],
  offline: true,
};

export default manifest;
