/**
 * Xonvert AI — app launcher catalog.
 *
 * The flagship apps (Send, Chat, Whiteboard, Call, Clipboard, Watch, Notes) are
 * separate pages, not registry tools — so the router can't see them. This small
 * high-precision catalog lets the AI open them from natural language, and (for
 * Send) hand off a file so the transfer auto-starts.
 */

export interface AppEntry {
  id: string;
  name: string;
  href: string;
  /** Send accepts a handed-off file and auto-starts the transfer. */
  takesFile?: boolean;
  /** Phrase for the result card. */
  blurb: string;
  match: (lc: string) => boolean;
}

export const APPS: AppEntry[] = [
  { id: 'send', name: 'Send', href: '/send', takesFile: true, blurb: 'peer-to-peer file transfer with a private link.',
    match: (lc) => /\b(send|share|transfer|beam)\b/.test(lc) && /\b(file|this|it|document|photo|picture|image|video|audio|pdf|to)\b/.test(lc) },
  { id: 'call', name: 'Video Call', href: '/call', blurb: 'private peer-to-peer video & voice call.',
    match: (lc) => /\b(video ?call|voice ?call|start a call|call someone|video meeting|hop on a call)\b/.test(lc) },
  { id: 'chat', name: 'Group Chat', href: '/chat', blurb: 'encrypted peer-to-peer group chat.',
    match: (lc) => /\b(group chat|chat room|start a chat|open chat|chat with)\b/.test(lc) },
  { id: 'board', name: 'Whiteboard', href: '/board', blurb: 'shared real-time whiteboard.',
    match: (lc) => /\b(white ?board|draw together|shared (board|canvas)|brainstorm board|sketch together)\b/.test(lc) },
  { id: 'clipboard', name: 'Clipboard', href: '/clipboard', blurb: 'sync clipboard between your devices.',
    match: (lc) => /\b(clipboard|copy (text |stuff )?between|sync (clipboard|text) (across|between)|paste across devices)\b/.test(lc) },
  { id: 'watch', name: 'Watch Party', href: '/watch', blurb: 'watch a video together, in sync.',
    match: (lc) => /\b(watch (together|party)|watch a (video|movie|film) together|sync (video|playback))\b/.test(lc) },
  { id: 'note', name: 'Encrypted Notes', href: '/note', blurb: 'private, encrypted notes.',
    match: (lc) => /\b(encrypted note|secure note|private note|secret note|make a note|save a note|new note)\b/.test(lc) },
];

export function matchApp(text: string): AppEntry | null {
  const lc = text.toLowerCase();
  for (const a of APPS) if (a.match(lc)) return a;
  return null;
}
