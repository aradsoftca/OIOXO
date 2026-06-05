import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'audio-text-to-speech',
  name: 'Text to Speech',
  blurb: 'Type or paste text, pick a voice, and play or save the audio.',
  category: 'audio',
  tile: 'M',
  icon: 'megaphone',
  compute: 'instant',
  accepts: ['text/plain'],
  // Read-aloud via the browser's Web Speech voices — no recordable output
  // stream exists, so it produces no downloadable file (no false audio/wav claim).
  produces: [],
  keywords: ['text to speech', 'tts', 'read aloud', 'speech synthesis', 'voice generator'],
  pinDefault: false,
  offline: true,
};

export default manifest;
