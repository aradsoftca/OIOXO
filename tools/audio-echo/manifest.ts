import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'audio-echo',
  name: 'Echo',
  blurb: 'Add a tasteful echo — pick the delay and how loud the bounce is.',
  category: 'audio', tile: 'M', icon: 'audio-lines', compute: 'local',
  accepts: ['audio/*'],
  produces: ['audio/mp3'],
  keywords: ['audio', 'echo', 'delay', 'effect', 'reverb light'], offline: true,
};
export default manifest;
