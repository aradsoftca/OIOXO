import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'gen-resume',
  name: 'Resume Builder',
  blurb: 'Clean one-page resume — fill, preview, print or save as PDF.',
  category: 'generator', tile: 'L', icon: 'file-user', compute: 'instant',
  keywords: ['resume', 'cv', 'curriculum vitae', 'pdf resume'], offline: true,
};
export default manifest;
