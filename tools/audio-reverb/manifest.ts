import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'audio-reverb',
  name: 'Add Reverb',
  blurb: 'Room, hall, or cathedral — give vocals and instruments space.',
  category: 'audio', tile: 'M', icon: 'echo', compute: 'local',
  accepts: ['audio/*'],
  produces: ['audio/mp3'],
  keywords: ['audio', 'reverb', 'echo', 'space', 'ambience'], offline: true,
};
export default manifest;
