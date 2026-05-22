import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'pdf-rotate',
  name: 'Rotate PDF',
  blurb: 'Rotate every page or just specific pages 90°, 180°, 270°.',
  category: 'pdf', tile: 'M', icon: 'rotate-cw', compute: 'local',
  accepts: ['application/pdf'],
  produces: ['application/pdf'],
  keywords: ['pdf', 'rotate', 'turn', 'flip', 'orientation'], offline: true,
};
export default manifest;
