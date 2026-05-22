import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'audio-loop',
  name: 'Loop Audio',
  blurb: 'Repeat any audio clip a few times or for a target duration — clean joins, no gaps.',
  category: 'audio',
  tile: 'M',
  icon: 'repeat',
  compute: 'local',
  accepts: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/flac', 'audio/webm', 'audio/aac', 'audio/m4a'],
  produces: ['audio/wav', 'audio/mp3'],
  keywords: ['loop audio', 'repeat audio', 'extend audio', 'audio repeat', 'tile audio'],
  pinDefault: false,
  offline: true,
};

export default manifest;
