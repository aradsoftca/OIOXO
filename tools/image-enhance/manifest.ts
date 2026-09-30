import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'image-enhance', name: 'Photo Enhancer',
  blurb: 'One-click enhance — upscale 2× and sharpen detail to clean up small or soft photos. Runs on your device.',
  category: 'image', tile: 'M', icon: 'sparkles', compute: 'webgpu',
  accepts: ['image/*'], produces: ['image/png'],
  keywords: ['photo enhancer', 'upscale image', 'enlarge photo', 'sharpen', 'improve image quality', 'hd', '4k upscale'], offline: true, pinDefault: true,
};
export default manifest;
