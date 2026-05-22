import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'audio-speed',
  name: 'Change Speed',
  blurb: 'Speed up or slow down — affects pitch too (vinyl-style).',
  category: 'audio', tile: 'M', icon: 'fast-forward', compute: 'local',
  accepts: ['audio/*'],
  produces: ['audio/wav', 'audio/mp3'],
  keywords: ['audio', 'speed', 'slow down', 'speed up', 'tempo'], offline: true,
};
export default manifest;
