import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-convert-format',
  name: 'Convert Image Format',
  blurb: 'JPG · PNG · WebP · AVIF — convert any image to any modern format.',
  category: 'image',
  tile: 'L',
  icon: 'shuffle',
  compute: 'webgpu',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/bmp'],
  produces: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  keywords: ['convert', 'format', 'jpeg to webp', 'png to jpg', 'avif', 'heic', 'transcode'],
  pinDefault: true,
  offline: true,
};

export default manifest;
