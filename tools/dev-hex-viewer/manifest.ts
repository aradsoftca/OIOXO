import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'dev-hex-viewer',
  name: 'Hex Viewer',
  blurb: 'Inspect any file or text as hex bytes with ASCII sidebar.',
  category: 'dev',
  accepts: ['text/*'], tile: 'M', icon: 'binary', compute: 'instant',
  keywords: ['hex dump', 'binary viewer', 'bytes', 'inspect file'], offline: true,
};
export default manifest;
