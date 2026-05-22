import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-resize',
  name: 'Resize Image',
  blurb: 'Scale by pixels or percent — sharp Lanczos resampling, no blur.',
  category: 'image',
  tile: 'L',
  icon: 'maximize',
  compute: 'webgpu',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  keywords: ['resize', 'scale', 'thumbnail', 'lanczos', 'mitchell', 'hqx', 'upscale', 'downscale'],
  pinDefault: true,
  offline: true,
};

export default manifest;
