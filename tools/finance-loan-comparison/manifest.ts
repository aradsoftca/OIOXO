import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'finance-loan-comparison',
  name: 'Loan Comparison',
  blurb: 'Compare two loans side by side — see which costs less over the term.',
  category: 'finance', tile: 'M', icon: 'arrow-left-right', compute: 'instant',
  keywords: ['loan compare', 'compare loans', 'refinance'], offline: true,
};
export default manifest;
