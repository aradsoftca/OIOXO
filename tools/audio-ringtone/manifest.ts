import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'audio-ringtone', name: 'Ringtone Maker',
  blurb: 'Cut a clip from any song, add fade in/out, and export a ready-to-use ringtone (MP3 or M4R).',
  category: 'audio', tile: 'M', icon: 'bell', compute: 'local',
  accepts: ['audio/*'], produces: ['audio/mpeg'],
  keywords: ['ringtone maker', 'ringtone', 'cut song', 'mp3 ringtone', 'm4r', 'iphone ringtone', 'trim audio'], offline: true, pinDefault: true,
};
export default manifest;
