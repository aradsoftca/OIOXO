import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'audio-pan',
  name: 'Stereo Pan',
  blurb: 'Move audio left or right in the stereo field — constant-power, no level jumps.',
  category: 'audio',
  tile: 'M',
  icon: 'move-horizontal',
  compute: 'local',
  accepts: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/flac', 'audio/webm', 'audio/aac', 'audio/m4a'],
  produces: ['audio/wav', 'audio/mp3'],
  keywords: ['pan', 'stereo pan', 'left right', 'balance', 'audio position'],
  pinDefault: false,
  offline: true,
};

export default manifest;
