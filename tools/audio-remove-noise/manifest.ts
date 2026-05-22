import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'audio-remove-noise',
  name: 'Remove Noise',
  blurb: 'Clean up voice recordings — wipe out background hiss, hum, and room noise.',
  category: 'audio',
  tile: 'M',
  icon: 'volume-x',
  compute: 'webgpu',
  accepts: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/flac', 'audio/webm', 'audio/aac', 'audio/m4a'],
  produces: ['audio/wav', 'audio/mp3'],
  keywords: ['noise removal', 'denoise', 'clean audio', 'remove background noise', 'voice enhance', 'hiss', 'hum'],
  pinDefault: false,
  offline: true,
};

export default manifest;
