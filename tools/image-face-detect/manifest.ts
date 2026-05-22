import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'image-face-detect',
  name: 'Face Detection',
  blurb: 'Find faces in a photo on your device — boxes, count and key points. Nothing is uploaded.',
  category: 'image', tile: 'M', icon: 'scan-face', compute: 'local',
  accepts: ['image/png', 'image/jpeg', 'image/webp'],
  keywords: ['face detection', 'detect faces', 'count faces', 'facial', 'on-device'],
  offline: true,
};
export default manifest;
