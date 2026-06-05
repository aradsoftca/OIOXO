import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'test-hearing', name: 'Hearing Range Test',
  blurb: 'Find the highest and lowest frequencies you can hear by sweeping a tone from 20 Hz to 20 kHz.',
  category: 'test', tile: 'M', icon: 'ear', compute: 'instant',
  keywords: ['hearing test', 'frequency test', 'hearing range', 'high frequency', 'hz test', 'age hearing'], offline: true,
};
export default manifest;
