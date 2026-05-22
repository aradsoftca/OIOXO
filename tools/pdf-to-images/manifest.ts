import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'pdf-to-images',
  name: 'PDF to Images',
  blurb: 'Render every page as a PNG or JPG — download one ZIP.',
  category: 'pdf',
  tile: 'M',
  icon: 'image-down',
  compute: 'local',
  accepts: ['application/pdf'],
  produces: ['application/zip', 'image/png', 'image/jpeg', 'image/webp'],
  keywords: ['pdf to png', 'pdf to jpg', 'pdf to image', 'rasterize pdf', 'pdf pages to images'],
  pinDefault: false,
  offline: true,
};

export default manifest;
