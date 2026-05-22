import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-heic-convert',
  name: 'HEIC to JPG',
  blurb: 'Convert iPhone HEIC/HEIF photos to JPG, PNG or WebP — right in your browser.',
  category: 'image',
  tile: 'L',
  icon: 'file-image',
  compute: 'local',
  accepts: ['image/heic', 'image/heif', '.heic', '.heif'],
  produces: ['image/jpeg', 'image/png', 'image/webp'],
  keywords: ['heic', 'heif', 'heic to jpg', 'heic to png', 'iphone photo', 'convert heic', 'heic converter'],
  pinDefault: true,
  offline: true,
};

export default manifest;
