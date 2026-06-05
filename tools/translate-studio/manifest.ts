import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'translate-studio',
  name: 'Translation Studio',
  blurb: 'Translate text or a scanned document, then edit it in a studio — fix wording, restyle, add or remove images — and export as PDF, Word, plain text, or an image in the original design.',
  category: 'text', tile: 'L', icon: 'languages', compute: 'webgpu',
  accepts: ['image/*'],
  produces: ['application/pdf', 'image/png', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  keywords: ['translate and edit', 'translation editor', 'translate image keep layout', 'ocr translate', 'translate to pdf', 'translate to word', 'document translation studio'],
  offline: true, pinDefault: true,
};
export default manifest;
