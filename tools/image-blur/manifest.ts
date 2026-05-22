import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-blur',
  name: 'Blur Studio',
  blurb: 'Gaussian blur with a live before/after slider. Sharp, fast, private.',
  category: 'image',
  tile: 'L',
  icon: 'droplet',
  compute: 'webgpu',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/jpeg', 'image/png', 'image/webp'],
  keywords: ['blur', 'gaussian', 'image', 'soften', 'background blur'],
  pinDefault: true,
  offline: true,
};

export default manifest;
