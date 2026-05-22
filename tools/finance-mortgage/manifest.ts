import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'finance-mortgage',
  name: 'Mortgage Calculator',
  blurb: 'Monthly payment with taxes and insurance, total interest, full schedule.',
  category: 'finance', tile: 'M', icon: 'home', compute: 'instant',
  keywords: ['mortgage', 'home loan', 'pmi', 'property tax', 'amortization'], offline: true,
};
export default manifest;
