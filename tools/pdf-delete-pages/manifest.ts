import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'pdf-delete-pages',
  name: 'Delete Pages',
  blurb: 'Remove specific pages from a PDF — drop any range you want gone.',
  category: 'pdf', tile: 'M', icon: 'file-x', compute: 'local',
  accepts: ['application/pdf'],
  produces: ['application/pdf'],
  keywords: ['pdf', 'delete', 'remove pages', 'trim', 'cut'], offline: true,
};
export default manifest;
