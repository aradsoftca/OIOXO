import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'finance-budget',
  name: 'Budget Planner',
  blurb: 'Income minus expenses → savings rate and where your money goes.',
  category: 'finance', tile: 'M', icon: 'pie-chart', compute: 'instant',
  keywords: ['budget', 'savings rate', 'expenses', 'income'], offline: true,
};
export default manifest;
