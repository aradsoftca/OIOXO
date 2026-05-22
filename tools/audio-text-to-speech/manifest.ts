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
  produces: ['audio/wav'],
  keywords: ['text to speech', 'tts', 'read aloud', 'speech synthesis', 'voice generator'],
  pinDefault: false,
  offline: true,
};

export default manifest;
