import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'audio-record',
  name: 'Voice Recorder',
  blurb: 'Record audio from your microphone, play it back, and download it — right in the browser. Nothing is uploaded.',
  category: 'audio',
  tile: 'M',
  icon: 'mic',
  compute: 'instant',
  produces: ['audio/webm', 'audio/ogg'],
  keywords: ['voice recorder', 'audio recorder', 'record voice online', 'mic recorder', 'record audio', 'dictaphone'],
  offline: true,
};

export default manifest;
