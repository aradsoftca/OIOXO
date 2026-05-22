import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'pdf-page-numbers',
  name: 'Add Page Numbers',
  blurb: 'Stamp page numbers anywhere on every page — your format, your spot.',
  category: 'pdf', tile: 'M', icon: 'list-ordered', compute: 'local',
  accepts: ['application/pdf'],
  produces: ['application/pdf'],
  keywords: ['pdf', 'page numbers', 'numbering', 'stamp', 'pagination'], offline: true,
};
export default manifest;
