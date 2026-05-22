import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'gen-barcode',
  name: 'Barcode',
  blurb: 'Generate CODE128, EAN-13, UPC-A, ITF, and more — SVG or PNG.',
  category: 'generator', tile: 'M', icon: 'scan-barcode', compute: 'instant',
  keywords: ['barcode', 'code128', 'ean13', 'upc', 'isbn'], offline: true,
};
export default manifest;
