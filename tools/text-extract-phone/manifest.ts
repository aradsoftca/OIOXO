import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'text-extract-phone',
  name: 'Extract Phone Numbers',
  blurb: 'Pull phone numbers out of any text — international tolerant.',
  category: 'text', tile: 'S', icon: 'phone', compute: 'instant',
  keywords: ['extract phone', 'find phone numbers'], offline: true,
};
export default manifest;
