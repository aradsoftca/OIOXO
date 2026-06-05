import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'test-speaker', name: 'Speaker Test',
  blurb: 'Check your speakers or headphones — play left, right, and both channels plus a frequency sweep.',
  category: 'test', tile: 'M', icon: 'volume-2', compute: 'instant',
  keywords: ['speaker test', 'headphone test', 'left right test', 'stereo test', 'audio output test', 'channel test'], offline: true,
};
export default manifest;
