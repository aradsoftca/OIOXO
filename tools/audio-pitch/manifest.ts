import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'audio-pitch',
  name: 'Change Pitch',
  blurb: 'Shift pitch up or down in semitones — speed stays the same.',
  category: 'audio', tile: 'M', icon: 'music-4', compute: 'local',
  accepts: ['audio/*'],
  produces: ['audio/mp3'],
  keywords: ['audio', 'pitch', 'transpose', 'semitones', 'higher', 'lower'], offline: true,
};
export default manifest;
