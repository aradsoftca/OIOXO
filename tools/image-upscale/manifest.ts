import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-upscale',
  name: 'Upscale Image',
  blurb: 'Sharpen and enlarge any photo 2× or 4× — runs on your device, no upload.',
  category: 'image',
  tile: 'L',
  icon: 'maximize-2',
  compute: 'webgpu',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/png', 'image/jpeg', 'image/webp'],
  keywords: ['upscale', 'super resolution', 'enhance', 'enlarge image', 'ai upscale', '2x', '4x', 'sharpen'],
  pinDefault: true,
  offline: true,
};

export default manifest;
