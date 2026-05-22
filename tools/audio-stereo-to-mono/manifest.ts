import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'audio-stereo-to-mono',
  name: 'Stereo → Mono',
  blurb: 'Downmix two channels to one — perfect for voice notes and podcasts.',
  category: 'audio', tile: 'M', icon: 'merge', compute: 'local',
  accepts: ['audio/*'],
  produces: ['audio/mp3'],
  keywords: ['audio', 'stereo', 'mono', 'downmix', 'channels'], offline: true,
};
export default manifest;
