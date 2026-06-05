import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'studio-invoice',
  name: 'Invoice Studio',
  blurb: 'Create polished invoices with logo, line items, taxes — download PDF instantly.',
  category: 'generator', tile: 'L', icon: 'receipt', compute: 'instant',
  keywords: ['invoice', 'invoice generator', 'billing', 'pdf invoice', 'freelancer invoice'], offline: true,
};
export default manifest;
