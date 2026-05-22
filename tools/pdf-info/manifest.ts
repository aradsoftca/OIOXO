import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'pdf-info',
  name: 'PDF Info',
  blurb: 'See title, author, page count, creation date — all metadata at a glance.',
  category: 'pdf', tile: 'M', icon: 'info', compute: 'local',
  accepts: ['application/pdf'],
  keywords: ['pdf', 'info', 'metadata', 'inspect', 'details'], offline: true,
};
export default manifest;
