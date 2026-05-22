import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'audio-fade-out',
  name: 'Fade Out',
  blurb: 'Smoothly ramp the end of your audio down to silence.',
  category: 'audio', tile: 'M', icon: 'trending-down', compute: 'local',
  accepts: ['audio/*'],
  produces: ['audio/wav', 'audio/mp3'],
  keywords: ['audio', 'fade out', 'outro', 'smooth end', 'tail off'], offline: true,
};
export default manifest;
