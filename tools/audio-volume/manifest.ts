import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'audio-volume',
  name: 'Adjust Volume',
  blurb: 'Make audio louder or quieter — by dB or by percent.',
  category: 'audio', tile: 'M', icon: 'volume-2', compute: 'local',
  accepts: ['audio/*'],
  produces: ['audio/wav', 'audio/mp3'],
  keywords: ['audio', 'volume', 'louder', 'quieter', 'gain', 'amplify'], offline: true,
};
export default manifest;
