import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'calc-tip',
  name: 'Tip Calculator',
  blurb: 'Bill, tip percent, and how many people — get the per-person total.',
  category: 'calc', tile: 'S', icon: 'utensils', compute: 'instant',
  keywords: ['tip', 'gratuity', 'split bill', 'restaurant'], offline: true,
};
export default manifest;
