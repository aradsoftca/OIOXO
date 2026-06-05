import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'doc-translate',
  name: 'Document Translator',
  blurb: 'Translate a PDF, Word doc, or image and keep the original design — same layout, fonts and structure, just in another language. On your device.',
  category: 'text', tile: 'L', icon: 'languages', compute: 'webgpu',
  accepts: ['application/pdf', '.docx', 'image/*'],
  produces: ['application/pdf', 'image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  keywords: ['translate pdf', 'translate document', 'translate word', 'keep layout', 'translate image', 'document translator', 'translate keeping format', 'translate 100 page pdf'],
  offline: true, pinDefault: true,
};
export default manifest;
