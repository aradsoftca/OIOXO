import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'audio-waveform',
  name: 'Waveform Image',
  blurb: 'Render an audio file as a clean waveform image — PNG or SVG, any color.',
  category: 'audio',
  tile: 'M',
  icon: 'audio-waveform',
  compute: 'local',
  accepts: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/flac', 'audio/webm', 'audio/aac', 'audio/m4a'],
  produces: ['image/png', 'image/svg+xml'],
  keywords: ['waveform', 'audio image', 'audio visualizer', 'soundwave', 'audio art'],
  pinDefault: false,
  offline: true,
};

export default manifest;
