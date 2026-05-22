import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'audio-vocal-remover',
  name: 'Vocal Remover',
  blurb: 'Make an instrumental or isolate the vocals — works on your device, instantly.',
  category: 'audio',
  tile: 'M',
  icon: 'mic-off',
  compute: 'local',
  accepts: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/flac', 'audio/webm', 'audio/aac', 'audio/m4a'],
  produces: ['audio/wav', 'audio/mp3'],
  keywords: ['vocal remover', 'karaoke', 'instrumental', 'remove vocals', 'isolate vocals', 'acapella'],
  pinDefault: false,
  offline: true,
};

export default manifest;
