import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'audio-stereo-width',
  name: 'Stereo Width',
  blurb: 'Widen or narrow the stereo image — from mono up to extra-wide.',
  category: 'audio',
  tile: 'M',
  icon: 'unfold-horizontal',
  compute: 'local',
  accepts: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/flac', 'audio/webm', 'audio/aac', 'audio/m4a'],
  produces: ['audio/wav', 'audio/mp3'],
  keywords: ['stereo width', 'widen audio', 'mid side', 'stereo image', 'mono to wide'],
  pinDefault: false,
  offline: true,
};

export default manifest;
