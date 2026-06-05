import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'test-keyboard', name: 'Keyboard Tester',
  blurb: 'Check every key on your keyboard — see presses light up, spot stuck or dead keys, and test rollover.',
  category: 'test', tile: 'L', icon: 'keyboard', compute: 'instant',
  keywords: ['keyboard test', 'key tester', 'stuck key', 'dead key', 'ghosting', 'key rollover', 'keyboard checker'], offline: true, pinDefault: true,
};
export default manifest;
