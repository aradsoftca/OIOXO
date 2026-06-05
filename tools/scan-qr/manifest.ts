import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'scan-qr',
  name: 'QR & Barcode Scanner',
  blurb: 'Scan a QR code or barcode with your camera or from an image — instantly, in your browser. Nothing is uploaded.',
  category: 'generator',
  tile: 'M',
  icon: 'scan-line',
  compute: 'instant',
  accepts: ['image/*'],
  keywords: ['qr scanner', 'scan qr code', 'barcode scanner', 'read qr code', 'qr reader', 'scan barcode online'],
  offline: false,
};

export default manifest;
