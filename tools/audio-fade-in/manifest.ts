import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'audio-fade-in',
  name: 'Fade In',
  blurb: 'Smoothly ramp the start of your audio from silent to full volume.',
  category: 'audio', tile: 'M', icon: 'trending-up', compute: 'local',
  accepts: ['audio/*'],
  produces: ['audio/wav', 'audio/mp3'],
  keywords: ['audio', 'fade in', 'intro', 'ramp', 'smooth start'], offline: true,
};
export default manifest;
