import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'images-to-pdf',
  name: 'Images to PDF',
  blurb: 'Drop photos or scans, reorder, and save them all as one PDF.',
  category: 'pdf',
  tile: 'M',
  icon: 'file-output',
  compute: 'local',
  accepts: ['image/jpeg', 'image/png', 'image/webp'],
  produces: ['application/pdf'],
  keywords: ['images to pdf', 'jpg to pdf', 'png to pdf', 'photo to pdf', 'scan to pdf', 'create pdf'],
  pinDefault: false,
  offline: true,
};

export default manifest;
