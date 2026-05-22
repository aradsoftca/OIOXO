import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'dev-hash',
  name: 'Hash Generator',
  blurb: 'MD5, SHA-1, SHA-256, SHA-384, SHA-512 — instant cryptographic hashes.',
  category: 'dev',
  tile: 'M',
  icon: 'hash',
  compute: 'instant',
  keywords: ['hash', 'md5', 'sha1', 'sha256', 'checksum'],
  offline: true,
};

export default manifest;
