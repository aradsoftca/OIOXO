import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'pdf-merge',
  name: 'Merge PDFs',
  blurb: 'Combine multiple PDFs into one — drag to reorder, instant export.',
  category: 'pdf', tile: 'L', icon: 'file-plus', compute: 'local',
  accepts: ['application/pdf'],
  produces: ['application/pdf'],
  keywords: ['pdf', 'merge', 'combine', 'join', 'concatenate'], offline: true, pinDefault: true,
};
export default manifest;
