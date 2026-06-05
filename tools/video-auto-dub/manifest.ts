import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'video-auto-dub',
  name: 'Auto Dub',
  blurb: 'Dub any video into another language on your device — it transcribes the speech, translates it, and re-voices it in the language you pick.',
  category: 'video', tile: 'L', icon: 'languages', compute: 'webgpu',
  accepts: ['video/*'],
  produces: ['video/mp4'],
  keywords: ['auto dub', 'dub video', 'video translation', 'voice over translate', 'dubbing', 'translate video speech', 'redub'],
  offline: true,
  pinDefault: true,
};
export default manifest;
