import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'audio-reverse',
  name: 'Reverse Audio',
  blurb: 'Play your audio backwards — instant, sample-accurate.',
  category: 'audio', tile: 'S', icon: 'flip-horizontal-2', compute: 'local',
  accepts: ['audio/*'],
  produces: ['audio/wav', 'audio/mp3'],
  keywords: ['audio', 'reverse', 'backwards', 'flip'], offline: true,
};
export default manifest;
