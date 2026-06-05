import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'text-translate',
  name: 'Translate',
  blurb: 'Translate text between dozens of languages, privately on your device — auto-detects the source. Paste text or load a .txt / .srt file.',
  category: 'text', tile: 'L', icon: 'languages', compute: 'webgpu',
  accepts: ['text/plain', '.srt', '.vtt', '.txt'],
  keywords: ['translate', 'translation', 'translator', 'language', 'multilingual', 'subtitle translate', 'offline translate', 'private translate'],
  offline: true,
  pinDefault: true,
};
export default manifest;
