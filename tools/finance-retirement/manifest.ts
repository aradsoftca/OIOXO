import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'finance-retirement',
  name: 'Retirement',
  blurb: 'How much will you have, and how long will it last?',
  category: 'finance', tile: 'M', icon: 'island', compute: 'instant',
  keywords: ['retirement', 'fire', '4% rule', 'nest egg'], offline: true,
};
export default manifest;
