import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-object-remove',
  name: 'Object Remover',
  blurb: 'Brush over unwanted objects, blemishes or watermarks and erase them cleanly.',
  category: 'image',
  tile: 'L',
  icon: 'eraser',
  compute: 'local',
  accepts: ['image/jpeg', 'image/png', 'image/webp'],
  produces: ['image/png', 'image/jpeg'],
  keywords: ['remove object', 'object remover', 'remove watermark', 'erase from photo', 'cleanup photo', 'inpaint'],
  pinDefault: true,
  offline: true,
};

export default manifest;
