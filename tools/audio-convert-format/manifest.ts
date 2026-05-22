import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'audio-convert-format',
  name: 'Convert Audio Format',
  blurb: 'Convert audio between WAV and MP3 — pick bitrate and quality.',
  category: 'audio', tile: 'M', icon: 'file-audio-2', compute: 'local',
  accepts: ['audio/*'],
  produces: ['audio/wav', 'audio/mp3'],
  keywords: ['audio', 'convert', 'format', 'mp3 to wav', 'wav to mp3'], offline: true, pinDefault: true,
};
export default manifest;
