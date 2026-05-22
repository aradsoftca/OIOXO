import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'text-base64',
  name: 'Base64',
  blurb: 'Encode and decode Base64 — UTF-8 safe, two-way.',
  category: 'dev',
  tile: 'M',
  icon: 'binary',
  compute: 'instant',
  keywords: ['base64', 'encode', 'decode', 'btoa', 'atob'],
  offline: true,
  pinDefault: true,
};

export default manifest;
