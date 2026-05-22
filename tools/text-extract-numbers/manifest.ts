import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'text-extract-numbers',
  name: 'Extract Numbers',
  blurb: 'Pull every number (integers, decimals, negatives) out of any text.',
  category: 'text', tile: 'S', icon: 'hash', compute: 'instant',
  keywords: ['extract numbers', 'find digits'], offline: true,
};
export default manifest;
