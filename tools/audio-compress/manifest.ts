import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'audio-compress',
  name: 'Compress Audio',
  blurb: 'Re-encode at a lower bitrate — smaller file, still listenable.',
  category: 'audio', tile: 'M', icon: 'archive', compute: 'local',
  accepts: ['audio/*'],
  produces: ['audio/mp3'],
  keywords: ['audio', 'compress', 'bitrate', 'shrink', 'file size'], offline: true,
};
export default manifest;
