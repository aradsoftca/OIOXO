import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'calc-latex',
  name: 'LaTeX Renderer',
  blurb: 'Live-render math from plain text or LaTeX — copy code or a clean PNG.',
  category: 'calc', tile: 'M', icon: 'sigma', compute: 'instant',
  keywords: ['latex', 'math', 'render', 'equation', 'tex'], offline: true,
};
export default manifest;
