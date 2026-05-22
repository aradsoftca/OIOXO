import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'pdf-split',
  name: 'Split PDF',
  blurb: 'Split a PDF into pages or page ranges — one file each.',
  category: 'pdf', tile: 'M', icon: 'file-stack', compute: 'local',
  accepts: ['application/pdf'],
  produces: ['application/pdf'],
  keywords: ['pdf', 'split', 'separate', 'extract', 'pages'], offline: true,
};
export default manifest;
