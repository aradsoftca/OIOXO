import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'text-reverse-lines',
  name: 'Reverse Line Order',
  blurb: 'Flip the order of lines — last becomes first.',
  category: 'text',
  accepts: ['text/*'], tile: 'S', icon: 'flip-vertical', compute: 'instant',
  keywords: ['reverse lines', 'flip order'], offline: true,
};
export default manifest;
