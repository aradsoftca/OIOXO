import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'test-typing', name: 'Typing Speed Test',
  blurb: 'Measure your typing speed (WPM) and accuracy on a timed passage.',
  category: 'test', tile: 'M', icon: 'keyboard', compute: 'instant',
  keywords: ['typing test', 'wpm', 'words per minute', 'typing speed', 'keyboard speed'], offline: true, pinDefault: true,
};
export default manifest;
