import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'audio-trim',
  name: 'Trim Audio',
  blurb: 'Cut the start and end of an audio file with precise time controls.',
  category: 'audio', tile: 'L', icon: 'scissors', compute: 'local',
  accepts: ['audio/*'],
  produces: ['audio/wav', 'audio/mp3'],
  keywords: ['audio', 'trim', 'cut', 'crop', 'shorten'], offline: true, pinDefault: true,
};
export default manifest;
