import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'finance-investment',
  name: 'Investment Growth',
  blurb: 'Project compound growth with regular contributions — and see real return.',
  category: 'finance', tile: 'M', icon: 'trending-up', compute: 'instant',
  keywords: ['investment', 'compound interest', 'returns', 'index fund'], offline: true,
};
export default manifest;
