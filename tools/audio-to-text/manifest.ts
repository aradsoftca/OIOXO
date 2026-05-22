import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'audio-to-text',
  name: 'Audio to Text',
  blurb: 'Transcribe any audio into text with timestamps — 90+ languages, runs on your device.',
  category: 'audio',
  tile: 'L',
  icon: 'mic',
  compute: 'webgpu',
  accepts: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/flac', 'audio/webm', 'audio/aac', 'audio/m4a'],
  produces: ['text/plain', 'application/x-subrip', 'text/vtt'],
  keywords: ['transcribe', 'speech to text', 'subtitle generator', 'audio to text', 'whisper', 'voice to text'],
  pinDefault: true,
  offline: true,
};

export default manifest;
