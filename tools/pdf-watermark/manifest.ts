import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'pdf-watermark',
  name: 'Add Watermark',
  blurb: 'Add a translucent text watermark across every page — DRAFT, CONFIDENTIAL, anything.',
  category: 'pdf', tile: 'M', icon: 'stamp', compute: 'local',
  accepts: ['application/pdf'],
  produces: ['application/pdf'],
  keywords: ['pdf', 'watermark', 'stamp', 'draft', 'confidential'], offline: true,
};
export default manifest;
