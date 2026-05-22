import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-ocr',
  name: 'Image to Text',
  blurb: 'Pull text out of any photo, screenshot, or scan — 20 languages, runs on-device.',
  category: 'image',
  tile: 'L',
  icon: 'scan-text',
  compute: 'webgpu',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/bmp', 'image/tiff'],
  produces: ['text/plain'],
  keywords: ['ocr', 'image to text', 'extract text', 'recognize text', 'screenshot text', 'scan'],
  pinDefault: true,
  offline: true,
};

export default manifest;
