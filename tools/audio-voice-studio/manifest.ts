import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'audio-voice-studio',
  name: 'Voice Studio',
  blurb: 'Turn text into natural speech and download it — pick a language and a voice character: narrator, female, male, cartoon, deep, or robot. Runs on your device.',
  category: 'audio', tile: 'L', icon: 'mic-vocal', compute: 'webgpu',
  produces: ['audio/wav', 'audio/mpeg'],
  keywords: ['text to speech', 'tts', 'voice generator', 'ai voice', 'narration', 'voiceover', 'female voice', 'male voice', 'cartoon voice', 'robot voice', 'speech', 'download voice'],
  offline: true,
  pinDefault: true,
};
export default manifest;
