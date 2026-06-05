import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'image-passport', name: 'Passport Photo Maker',
  blurb: 'Make an ID or passport photo — removes the background, drops in a plain color, and crops to the exact size you need. On your device.',
  category: 'image', tile: 'M', icon: 'id-card', compute: 'webgpu',
  accepts: ['image/*'], produces: ['image/jpeg'],
  keywords: ['passport photo', 'id photo', 'visa photo', 'passport size', 'biometric photo', 'remove background photo'], offline: true, pinDefault: true,
};
export default manifest;
