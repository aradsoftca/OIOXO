import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'finance-tax',
  name: 'Income Tax',
  blurb: 'Estimate US federal income tax — brackets, marginal & effective rates.',
  category: 'finance', tile: 'M', icon: 'banknote', compute: 'instant',
  keywords: ['income tax', 'tax calculator', 'federal tax', 'brackets'], offline: true,
};
export default manifest;
