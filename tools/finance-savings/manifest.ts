import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'finance-savings',
  name: 'Savings Goal',
  blurb: 'Reach your savings target with the right monthly deposit and timeline.',
  category: 'finance', tile: 'M', icon: 'target', compute: 'instant',
  keywords: ['savings goal', 'how much to save', 'monthly savings'], offline: true,
};
export default manifest;
