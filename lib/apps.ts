/**
 * The flagship "apps" — full-screen, peer-to-peer or on-device experiences
 * (distinct from the file tools). Single source of truth shared by the /apps
 * page and the header AppsBar.
 */

export interface AppEntry {
  href: string;
  name: string;
  /** Short label for the compact header row. */
  short: string;
  blurb: string;
  icon: string;
  colorVar: string;
  tag: string;
  /** A creative editor (Studio) rather than a live/utility App — split into its own row + /studios page. */
  studio?: boolean;
  /** Only shown on the oioxo brand (xonvert keeps AI features gated off). */
  oioxoOnly?: boolean;
}

export const APPS: AppEntry[] = [
  { href: '/send', name: 'Send', short: 'Send', blurb: 'Beam files device to device over an encrypted P2P link. No upload, no size cap.', icon: 'send', colorVar: '--color-cat-convert', tag: 'Peer-to-peer' },
  { href: '/clipboard', name: 'Universal Clipboard', short: 'Clipboard', blurb: 'Copy on your phone, paste on your laptop. Text & links sync instantly across devices.', icon: 'clipboard-copy', colorVar: '--color-cat-convert', tag: 'Peer-to-peer' },
  { href: '/chat', name: 'Private Chat', short: 'Chat', blurb: 'Secure, encrypted messaging — text, emoji, photos & files — from one link. No sign-up.', icon: 'message-square', colorVar: '--color-cat-convert', tag: 'Peer-to-peer' },
  { href: '/board', name: 'Whiteboard', short: 'Board', blurb: 'Draw together in real time from one link. Everyone’s strokes sync peer-to-peer.', icon: 'pencil', colorVar: '--color-cat-image', tag: 'Peer-to-peer' },

  // --- Studios: full creative editors, all on-device (also linked under /tools) ---
  { href: '/tools/image-studio', name: 'Image Studio Pro', short: 'Photo', blurb: 'A pro photo editor — full layer system, 16 blend modes, masks, transforms, brush with hardness/flow, text, shapes, adjustment layers (curves/levels/hue-sat), filters, export PNG/JPG/WebP.', icon: 'brush', colorVar: '--color-cat-image', tag: 'Pro Studio', studio: true },
  { href: '/tools/video-studio', name: 'Video Studio Pro', short: 'Video', blurb: 'A pro multi-track NLE — V1+V2 video tracks, text overlay, A1+A2 audio, per-clip color grading, animated titles, snap-trim-split, ffmpeg.wasm export. Davinci-class in your browser.', icon: 'clapperboard', colorVar: '--color-cat-video', tag: 'Pro Studio', studio: true },
  { href: '/tools/subtitle-studio', name: 'Subtitle Studio Pro', short: 'Subtitles', blurb: 'Aegisub-class cue editor — waveform-synced timeline, auto-transcribe via Whisper, live preview, style presets, export SRT/VTT/ASS.', icon: 'captions', colorVar: '--color-cat-subtitle', tag: 'Pro Studio', studio: true },
  { href: '/tools/pdf-studio', name: 'PDF Studio Pro', short: 'PDF', blurb: 'A full PDF editor — thumbnail reorder, rotate, merge & duplicate, annotate, redact, highlight, ink draw, signature pad, page numbers, export.', icon: 'file-pen', colorVar: '--color-cat-pdf', tag: 'Pro Studio', studio: true },
  { href: '/tools/audio-voice-studio', name: 'Voice Studio Pro', short: 'Voice', blurb: 'Multi-track voice DAW — import, mic-record, TTS-as-clip, per-clip gain/EQ/reverb/echo/fade, master mix, export WAV/MP3.', icon: 'mic-vocal', colorVar: '--color-cat-audio', tag: 'Pro Studio', studio: true },
  { href: '/tools/audio-music-studio', name: 'Music Studio Pro', short: 'Music', blurb: 'A pro 16-step sequencer with 8 instruments (kick/snare/hat/clap + bass/lead/pad/pluck), pattern chains, swing, mixer, master limiter, export WAV/MP3.', icon: 'music', colorVar: '--color-cat-audio', tag: 'Pro Studio', studio: true },
  { href: '/tools/office-studio', name: 'Sheets Studio Pro', short: 'Sheets', blurb: 'A pro spreadsheet — 40+ formulas (SUM/IF/VLOOKUP-class), cell styles, ranges, multi-sheet, find & replace, undo/redo, import CSV, export CSV/TSV/JSON.', icon: 'table-2', colorVar: '--color-cat-convert', tag: 'Pro Studio', studio: true },
  { href: '/tools/office-docs', name: 'Docs Studio Pro', short: 'Docs', blurb: 'A pro word processor — headings, lists, tables, images, find & replace, outline view, undo/redo, import MD/HTML/TXT, export MD/HTML/PDF.', icon: 'file-text', colorVar: '--color-cat-text', tag: 'Pro Studio', studio: true },
  { href: '/tools/office-slides', name: 'Slides Studio Pro', short: 'Slides', blurb: 'A pro presentation editor — slide layouts, text/shape/image/arrow tools, themes, drag-resize, speaker notes, present mode, export PDF/PNG.', icon: 'presentation', colorVar: '--color-cat-generator', tag: 'Pro Studio', studio: true },
  { href: '/tools/studio-chart', name: 'Chart Maker', short: 'Chart', blurb: 'Turn data into clean bar, line, area or pie charts — paste rows or import CSV, export PNG/SVG.', icon: 'bar-chart', colorVar: '--color-cat-generator', tag: 'Studio', studio: true },
  { href: '/tools/translate-studio', name: 'Translation Studio', short: 'Translate', blurb: 'Translate text or a scanned doc, then edit it — fix wording, restyle, add/remove images — and export as PDF, Word, text or image in the original design.', icon: 'languages', colorVar: '--color-cat-text', tag: 'Studio', studio: true },
  { href: '/tools/video-auto-subtitle', name: 'Caption Studio', short: 'Captions', blurb: 'Auto-caption videos with CapCut-style word pops, karaoke or classic lines — original or translated, fully styled and burned in.', icon: 'captions', colorVar: '--color-cat-video', tag: 'Studio', studio: true },
  { href: '/tools/audio-record', name: 'Voice Recorder', short: 'Record', blurb: 'Record audio from your microphone, play it back and download it — nothing uploaded.', icon: 'mic', colorVar: '--color-cat-audio', tag: 'In-browser' },
  { href: '/tools/scan-qr', name: 'QR & Barcode Scanner', short: 'Scan', blurb: 'Scan a QR code or barcode with your camera or from an image, instantly in your browser.', icon: 'scan-line', colorVar: '--color-cat-generator', tag: 'In-browser' },
  { href: '/tools/doc-translate', name: 'Document Translator', short: 'Doc translate', blurb: 'Quick: translate a PDF, Word doc or image keeping the original design — no editing, just download.', icon: 'file-text', colorVar: '--color-cat-text', tag: 'On-device' },
  { href: '/summarize', name: 'Summarizer & Translator', short: 'Summarize', blurb: 'Summarize or translate text & PDFs with an AI model that runs on your device.', icon: 'file-text', colorVar: '--color-cat-dev', tag: 'On-device', oioxoOnly: true },
  { href: '/note', name: 'Encrypted Note', short: 'Note', blurb: 'Share a secret with a self-destructing link. Encrypted in your browser — we can’t read it.', icon: 'lock', colorVar: '--color-cat-dev', tag: 'Zero-knowledge' },
  { href: '/call', name: 'Video Call', short: 'Call', blurb: 'Start a private video call with one link. No account, no install, encrypted P2P.', icon: 'video', colorVar: '--color-cat-video', tag: 'Peer-to-peer' },
  { href: '/watch', name: 'Live Screen Share', short: 'Watch', blurb: 'Show your screen live to anyone with a link. Direct, encrypted, no download.', icon: 'monitor-play', colorVar: '--color-cat-video', tag: 'Peer-to-peer' },
  { href: '/ai', name: 'Private AI', short: 'AI', blurb: 'A real AI model that runs in your browser via WebGPU. Your chats never leave your device.', icon: 'bot', colorVar: '--color-cat-dev', tag: 'On-device', oioxoOnly: true },
  { href: '/viewer', name: 'File Viewer', short: 'Viewer', blurb: 'Open and preview almost any file type right in your browser — nothing uploaded.', icon: 'eye', colorVar: '--color-cat-image', tag: 'In-browser' },
];

/** Apps visible for the active brand (drops AI-only entries on xonvert). */
export function visibleApps(isOioxo: boolean): AppEntry[] {
  return APPS.filter((a) => isOioxo || !a.oioxoOnly);
}

/** Live / utility apps only (P2P, recorder, scanner, viewer, AI…) — excludes Studios. */
export function appsOnly(isOioxo: boolean): AppEntry[] {
  return visibleApps(isOioxo).filter((a) => !a.studio);
}

/** Creative editors only (Photo, Video, PDF, Sheets, Docs…) — the Studios row + /studios. */
export function studiosOnly(isOioxo: boolean): AppEntry[] {
  return visibleApps(isOioxo).filter((a) => a.studio);
}
