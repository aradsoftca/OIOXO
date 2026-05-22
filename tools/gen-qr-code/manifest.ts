import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'gen-qr-code',
  name: 'QR Code',
  blurb: 'Generate sharp QR codes from any link or text — pick colors and size.',
  category: 'generator', tile: 'M', icon: 'qr-code', compute: 'instant',
  keywords: ['qr code', 'qrcode', 'generator', 'scan'],
  pinDefault: true, offline: true,
};
export default manifest;
