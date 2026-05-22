import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'pdf-extract-pages',
  name: 'Extract Pages',
  blurb: 'Pull just the pages you want into a fresh PDF.',
  category: 'pdf', tile: 'M', icon: 'file-check', compute: 'local',
  accepts: ['application/pdf'],
  produces: ['application/pdf'],
  keywords: ['pdf', 'extract', 'keep pages', 'pick pages'], offline: true,
};
export default manifest;
