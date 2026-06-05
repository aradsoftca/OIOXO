import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'pdf-nup', name: 'PDF N-up (Pages per Sheet)',
  blurb: 'Place 2, 4, 6, or 9 PDF pages onto each sheet — great for handouts and saving paper.',
  category: 'pdf', tile: 'M', icon: 'layout-grid', compute: 'local',
  accepts: ['application/pdf'], produces: ['application/pdf'],
  keywords: ['n-up', 'pages per sheet', 'multiple pages per page', 'pdf handout', '2 up', '4 up', 'combine pages'], offline: true,
};
export default manifest;
