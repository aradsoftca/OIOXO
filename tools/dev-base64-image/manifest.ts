import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'dev-base64-image',
  name: 'Image to Base64',
  blurb: 'Turn an image into a Base64 data URI — or paste one back to a file.',
  category: 'dev',
  tile: 'M',
  icon: 'file-code',
  compute: 'instant',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml'],
  produces: ['text/plain', 'image/png'],
  keywords: ['base64', 'data uri', 'image to base64', 'base64 to image', 'inline image', 'data url'],
  pinDefault: false,
  offline: true,
};

export default manifest;
