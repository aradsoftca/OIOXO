import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'studio-qr',
  name: 'QR Studio',
  blurb: 'Design beautiful QR codes with custom colors, gradients, logos, and dot styles.',
  category: 'generator', tile: 'L', icon: 'qr-code', compute: 'instant',
  keywords: ['qr code', 'qr generator', 'styled qr', 'qr designer', 'custom qr code'], offline: true,
};
export default manifest;
