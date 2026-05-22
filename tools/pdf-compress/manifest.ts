import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'pdf-compress',
  name: 'Compress PDF',
  blurb: 'Shrink a heavy PDF down — great for scans and image-packed documents.',
  category: 'pdf',
  tile: 'L',
  icon: 'file-minus',
  compute: 'local',
  accepts: ['application/pdf'],
  produces: ['application/pdf'],
  keywords: ['compress pdf', 'shrink pdf', 'reduce pdf size', 'pdf optimizer', 'smaller pdf'],
  pinDefault: false,
  offline: true,
};

export default manifest;
