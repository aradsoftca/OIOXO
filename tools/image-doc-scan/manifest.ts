import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-doc-scan',
  name: 'Document Scanner',
  blurb: 'Turn a photo of a document into a clean, cropped, deskewed scan or PDF.',
  category: 'image',
  tile: 'L',
  icon: 'scan-line',
  compute: 'local',
  accepts: ['image/jpeg', 'image/png', 'image/webp'],
  produces: ['application/pdf', 'image/jpeg', 'image/png'],
  keywords: ['document scanner', 'scan document', 'photo to pdf', 'deskew', 'crop document', 'scan to pdf'],
  pinDefault: true,
  offline: true,
};

export default manifest;
