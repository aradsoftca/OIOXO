import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-text-behind',
  name: 'Text Behind Photo',
  blurb: 'Place text behind the subject of your photo — the viral depth effect, in your browser.',
  category: 'image',
  tile: 'L',
  icon: 'layers',
  compute: 'webgpu',
  accepts: ['image/jpeg', 'image/png', 'image/webp'],
  produces: ['image/png', 'image/jpeg'],
  keywords: ['text behind image', 'text behind subject', 'depth text', 'text behind photo effect', 'instagram text effect'],
  pinDefault: true,
  offline: true,
};

export default manifest;
