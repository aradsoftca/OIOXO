import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'pdf-reorder',
  name: 'Reorder Pages',
  blurb: 'Shuffle pages into any order — perfect for fixing scan mistakes.',
  category: 'pdf', tile: 'M', icon: 'arrow-up-down', compute: 'local',
  accepts: ['application/pdf'],
  produces: ['application/pdf'],
  keywords: ['pdf', 'reorder', 'rearrange', 'sort', 'shuffle pages'], offline: true,
};
export default manifest;
