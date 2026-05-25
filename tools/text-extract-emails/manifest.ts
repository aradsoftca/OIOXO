import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'text-extract-emails',
  name: 'Extract Emails',
  blurb: 'Pull every email address out of any text — deduped by default.',
  category: 'text',
  accepts: ['text/*'], tile: 'S', icon: 'mail', compute: 'instant',
  keywords: ['extract emails', 'find emails', 'email list'], offline: true,
};
export default manifest;
