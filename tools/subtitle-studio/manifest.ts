import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'subtitle-studio',
  name: 'Subtitle Studio',
  blurb: 'Full subtitle editor — waveform-synced timeline, cue editor, auto-transcribe, style preview, export SRT/VTT/ASS.',
  category: 'subtitle', tile: 'L', icon: 'captions', compute: 'webgpu',
  accepts: ['video/*', 'audio/*', 'application/x-subrip', 'text/vtt'],
  produces: ['application/x-subrip', 'text/vtt'],
  keywords: ['subtitle editor', 'caption editor', 'srt editor', 'vtt editor', 'ass subtitle', 'auto transcribe', 'aegisub web', 'subtitle studio', 'waveform cue editor'],
  offline: true,
  pinDefault: true,
};
export default manifest;
