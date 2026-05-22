import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'subtitle-generate',
  name: 'Auto Subtitle Generator',
  blurb: 'Turn any video or audio into subtitles (SRT/VTT) automatically — in your browser.',
  category: 'subtitle',
  tile: 'L',
  icon: 'captions',
  compute: 'webgpu',
  accepts: ['video/mp4', 'video/webm', 'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/ogg'],
  produces: ['application/x-subrip', 'text/vtt'],
  keywords: ['auto subtitles', 'subtitle generator', 'video to srt', 'generate captions', 'add subtitles to video', 'transcribe video'],
  pinDefault: true,
  offline: true,
};

export default manifest;
