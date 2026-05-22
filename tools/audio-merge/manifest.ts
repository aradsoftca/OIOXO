import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'audio-merge',
  name: 'Merge Audio',
  blurb: 'Join multiple audio files back-to-back into one track.',
  category: 'audio', tile: 'L', icon: 'list-music', compute: 'local',
  accepts: ['audio/*'],
  produces: ['audio/wav', 'audio/mp3'],
  keywords: ['audio', 'merge', 'join', 'concat', 'combine'], offline: true,
};
export default manifest;
