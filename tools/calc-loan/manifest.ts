import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'calc-loan',
  name: 'Loan Calculator',
  blurb: 'Monthly payment, total interest, and amortization for any loan.',
  category: 'calc', tile: 'M', icon: 'banknote', compute: 'instant',
  keywords: ['loan', 'monthly payment', 'amortization', 'mortgage'], offline: true,
};
export default manifest;
