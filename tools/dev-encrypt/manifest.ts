import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'dev-encrypt',
  name: 'Encrypt / Decrypt',
  blurb: 'Password-protect text or any file with AES-256 (GCM) — strong, standard encryption that runs entirely in your browser. Keys never leave your device.',
  category: 'dev',
  tile: 'M',
  icon: 'lock',
  compute: 'instant',
  accepts: ['*/*'],
  keywords: ['encrypt file', 'decrypt file', 'aes encryption', 'password protect file', 'encrypt text', 'secure file'],
  offline: true,
};

export default manifest;
