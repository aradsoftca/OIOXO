import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'studio-resume',
  name: 'Resume Studio',
  blurb: 'Build a professional resume with multiple templates — preview live, export PDF instantly.',
  category: 'generator', tile: 'L', icon: 'file-user', compute: 'instant',
  keywords: ['resume', 'cv', 'curriculum vitae', 'resume builder', 'pdf resume', 'resume maker'], offline: true,
};
export default manifest;
