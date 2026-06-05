import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'test-mic', name: 'Microphone Test',
  blurb: 'Check your mic works — see a live input level meter, then record a few seconds and play it back.',
  category: 'test', tile: 'M', icon: 'mic', compute: 'instant',
  keywords: ['mic test', 'microphone test', 'audio input test', 'test my mic', 'record test'], offline: true, pinDefault: true,
};
export default manifest;
