import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'audio-equalizer',
  name: '5-Band Equalizer',
  blurb: 'Shape the sound across five frequency bands — bass to treble.',
  category: 'audio', tile: 'M', icon: 'sliders', compute: 'local',
  accepts: ['audio/*'],
  produces: ['audio/mp3'],
  keywords: ['audio', 'equalizer', 'eq', 'bands', 'frequency'], offline: true,
};
export default manifest;
