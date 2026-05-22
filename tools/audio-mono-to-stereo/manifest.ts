import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'audio-mono-to-stereo',
  name: 'Mono → Stereo',
  blurb: 'Convert mono recordings to a balanced two-channel stereo file.',
  category: 'audio', tile: 'M', icon: 'split', compute: 'local',
  accepts: ['audio/*'],
  produces: ['audio/mp3'],
  keywords: ['audio', 'mono', 'stereo', 'channels'], offline: true,
};
export default manifest;
