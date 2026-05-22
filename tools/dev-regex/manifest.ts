import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'dev-regex',
  name: 'Regex Tester',
  blurb: 'Live regex matcher — see every match and capture group.',
  category: 'dev', tile: 'L', icon: 'regex', compute: 'instant',
  keywords: ['regex', 'regular expression', 'pattern test', 'match groups'], offline: true,
};
export default manifest;
