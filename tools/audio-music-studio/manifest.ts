import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'audio-music-studio', name: 'Music Studio',
  blurb: 'Make original music in seconds — pick a genre, key and tempo and it composes chords, bass, melody and drums, then renders a track you can download. All on your device.',
  category: 'audio', tile: 'L', icon: 'music', compute: 'local',
  produces: ['audio/wav', 'audio/mpeg'],
  keywords: ['music maker', 'make music', 'beat maker', 'song generator', 'instrumental', 'lofi maker', 'royalty free music', 'create music'],
  offline: true, pinDefault: true,
};
export default manifest;
