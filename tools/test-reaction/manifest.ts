import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'test-reaction', name: 'Reaction Time Test',
  blurb: 'Test your reflexes — click the moment the screen turns green. Averages your best tries.',
  category: 'test', tile: 'M', icon: 'zap', compute: 'instant',
  keywords: ['reaction time', 'reflex test', 'reaction speed', 'human benchmark', 'click reaction'], offline: true, pinDefault: true,
};
export default manifest;
