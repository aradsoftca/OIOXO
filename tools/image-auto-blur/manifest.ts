import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'image-auto-blur', name: 'Auto-Blur Faces',
  blurb: 'Automatically find and blur every face in a photo for privacy — on your device, nothing uploaded.',
  category: 'image', tile: 'M', icon: 'shield', compute: 'webgpu',
  accepts: ['image/*'], produces: ['image/png'],
  keywords: ['blur faces', 'face blur', 'anonymize photo', 'hide faces', 'privacy blur', 'censor faces'], offline: true, pinDefault: true,
};
export default manifest;
