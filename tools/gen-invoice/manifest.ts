import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'gen-invoice',
  name: 'Invoice Generator',
  blurb: 'Fill out an invoice and print or save as PDF — no signup.',
  category: 'generator', tile: 'L', icon: 'receipt', compute: 'instant',
  keywords: ['invoice', 'billing', 'freelance', 'pdf invoice'], offline: true,
};
export default manifest;
