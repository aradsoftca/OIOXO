import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'audio-bass-boost',
  name: 'Bass Boost',
  blurb: 'Punch up the low end — adjustable boost from subtle to thunder.',
  category: 'audio', tile: 'M', icon: 'speaker', compute: 'local',
  accepts: ['audio/*'],
  produces: ['audio/mp3'],
  keywords: ['audio', 'bass', 'boost', 'low end', 'equalizer'], offline: true,
};
export default manifest;
