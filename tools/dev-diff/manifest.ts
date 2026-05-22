import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'dev-diff',
  name: 'Diff Checker',
  blurb: 'Compare two pieces of text side-by-side. Line and word diffs.',
  category: 'dev', tile: 'L', icon: 'git-compare', compute: 'instant',
  keywords: ['diff', 'compare', 'text diff', 'patch'], offline: true,
};
export default manifest;
