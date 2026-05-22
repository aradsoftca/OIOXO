import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'audio-tempo',
  name: 'Change Tempo',
  blurb: 'Speed up or slow down without affecting pitch — perfect for practice.',
  category: 'audio', tile: 'M', icon: 'gauge', compute: 'local',
  accepts: ['audio/*'],
  produces: ['audio/mp3'],
  keywords: ['audio', 'tempo', 'speed', 'time stretch', 'slow down'], offline: true,
};
export default manifest;
