import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'audio-split',
  name: 'Split Audio',
  blurb: 'Cut a long audio file into equal pieces — by duration or piece count — and download as ZIP.',
  category: 'audio',
  tile: 'M',
  icon: 'scissors',
  compute: 'local',
  accepts: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/flac', 'audio/webm', 'audio/aac', 'audio/m4a'],
  produces: ['application/zip', 'audio/wav', 'audio/mp3'],
  keywords: ['split audio', 'chop audio', 'audio chunks', 'cut audio', 'audio slicer'],
  pinDefault: false,
  offline: true,
};

export default manifest;
