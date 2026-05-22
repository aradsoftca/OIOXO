import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'audio-treble-boost',
  name: 'Treble Boost',
  blurb: 'Lift the highs for clarity and air — or pull them back for warmth.',
  category: 'audio', tile: 'M', icon: 'sliders-horizontal', compute: 'local',
  accepts: ['audio/*'],
  produces: ['audio/mp3'],
  keywords: ['audio', 'treble', 'boost', 'highs', 'clarity'], offline: true,
};
export default manifest;
