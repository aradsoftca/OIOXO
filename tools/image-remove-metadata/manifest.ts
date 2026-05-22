import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-remove-metadata',
  name: 'Remove EXIF Metadata',
  blurb: 'Strip GPS location, camera info and hidden metadata from photos — losslessly.',
  category: 'image',
  tile: 'L',
  icon: 'shield-off',
  compute: 'instant',
  accepts: ['image/jpeg', 'image/png', 'image/webp'],
  produces: ['image/jpeg', 'image/png', 'image/webp'],
  keywords: ['remove exif', 'remove metadata', 'strip exif', 'remove gps from photo', 'photo privacy', 'clear exif data'],
  pinDefault: true,
  offline: true,
};

export default manifest;
