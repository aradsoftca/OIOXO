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
  /** Only shown on the oioxo brand (xonvert keeps AI features gated off). */
  oioxoOnly?: boolean;
}

export const APPS: AppEntry[] = [
  { href: '/send', name: 'Send', short: 'Send', blurb: 'Beam files device to device over an encrypted P2P link. No upload, no size cap.', icon: 'send', colorVar: '--color-cat-convert', tag: 'Peer-to-peer' },
  { href: '/clipboard', name: 'Universal Clipboard', short: 'Clipboard', blurb: 'Copy on your phone, paste on your laptop. Text & links sync instantly across devices.', icon: 'clipboard-copy', colorVar: '--color-cat-convert', tag: 'Peer-to-peer' },
  { href: '/chat', name: 'Private Chat', short: 'Chat', blurb: 'Secure, encrypted messaging — text, emoji, photos & files — from one link. No sign-up.', icon: 'message-square', colorVar: '--color-cat-convert', tag: 'Peer-to-peer' },
  { href: '/board', name: 'Whiteboard', short: 'Board', blurb: 'Draw together in real time from one link. Everyone’s strokes sync peer-to-peer.', icon: 'pencil', colorVar: '--color-cat-image', tag: 'Peer-to-peer' },
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
