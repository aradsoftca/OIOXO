import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-smart-cutout',
  name: 'Click to Cut Out',
  blurb: 'Click any object in a photo and get a precise cutout — AI segmentation, in your browser.',
  category: 'image',
  tile: 'L',
  icon: 'scissors',
  compute: 'webgpu',
  accepts: ['image/jpeg', 'image/png', 'image/webp'],
  produces: ['image/png'],
  keywords: ['cut out object', 'click to cut', 'segment anything', 'remove background by clicking', 'object selection', 'smart cutout'],
  pinDefault: true,
  offline: true,
};

export default manifest;
