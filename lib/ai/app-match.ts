/**
 * oioxo AI — SEMANTIC app matcher.
 *
 * The flagship apps (Send, Chat, Call, Whiteboard, Clipboard, Screen Share, Notes)
 * are separate pages, reached today only by the narrow `matchApp` REGEX — so a
 * paraphrased request ("let me show a friend what's on my screen" → Screen Share,
 * "I want to talk face to face" → Video Call) misses. This matches the request to
 * an app by MEANING, using the same on-device MiniLM the tool router uses.
 *
 * Conservative + graceful: it embeds the query ONLY if the encoder is already warm
 * (no forced model load just to guess an app), skips informational questions
 * ("what is screen sharing"), and requires a confident, clear-margin cosine — so it
 * only ADDS app launches the regex missed, never hijacks a real question. Used as a
 * fallback after routing finds no tool/app (see oioxo-engine respondCore).
 */
import { APPS, type AppEntry } from './apps';
import { embedText, embedSentences } from './embed';

// Each app's matching text = name + what it does + a few natural intent phrasings.
// These are what the query is compared against (richer than the bare blurb).
const APP_TEXT: Record<string, string> = {
  send: 'Send a file to someone, share or transfer a document, photo, video, or PDF peer to peer with a private link.',
  voicecall: 'Make a voice call or audio call to someone, talk on the phone without video, private peer to peer call.',
  call: 'Start a video call, video chat or meeting, talk face to face with someone, hop on a call with video.',
  chat: 'Open a group chat or chat room, message and chat with friends, encrypted peer to peer text chat.',
  board: 'Open a shared whiteboard, draw or sketch together, brainstorm on a shared canvas in real time.',
  clipboard: 'Sync the clipboard between my devices, copy and paste text across phone and computer.',
  watch: 'Share my screen live, screen sharing, present my screen, or watch a video or movie together in sync.',
  note: 'Make a private encrypted note, save a secure secret note, write something down privately.',
};

const cosine = (a: Float32Array, b: Float32Array): number => {
  let d = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) d += a[i] * b[i]; return d;
};

let _matrix: Promise<Float32Array[] | null> | null = null;
function appMatrix(): Promise<Float32Array[] | null> {
  if (_matrix) return _matrix;
  const p = embedSentences(APPS.map((a) => APP_TEXT[a.id] ?? `${a.name}. ${a.blurb}`))
    .then((v) => (v.length === APPS.length ? v : null))
    .catch(() => null);
  _matrix = p;
  // Drop the cache on null result so a transient encoder failure doesn't
  // memoise "no app matrix" and disable in-chat app suggestions forever.
  p.then((v) => { if (v == null && _matrix === p) _matrix = null; });
  return p;
}

// An informational question ABOUT an app ("what is screen sharing", "how does a
// group chat work") must NOT open it — only an action/intent ("share my screen",
// "let me video call her") should. We open only when the phrasing isn't a bare
// info question, OR it carries a clear action cue.
const INFO_Q = /^\s*(what|who|why|how|when|whose|which|explain|define|tell me about|is\s|are\s|does\s|did\s)/i;
const ACTION = /\b(open|start|launch|let'?s|let me|i (want|need|'?d like) to|can (you|we)|share (my )?screen|present|send|transfer|beam|call|chat|talk to|message|connect|sync|make a note|save a note|draw together|watch together)\b/i;

/**
 * Best app for `text` by meaning, or null. Confident + clear-margin only.
 * Returns null when the encoder is cold (caller falls back to search).
 */
export async function matchAppSemantic(text: string): Promise<AppEntry | null> {
  const lc = text.toLowerCase();
  if (INFO_Q.test(lc) && !ACTION.test(lc)) return null; // "what is X" → answer it, don't open X

  const qv = await embedText(text);   // null when encoder not warm → no forced load
  if (!qv) return null;
  const mat = await appMatrix();
  if (!mat) return null;

  let bestI = -1, best = -Infinity, second = -Infinity;
  for (let i = 0; i < mat.length; i++) {
    const s = cosine(qv, mat[i]);
    if (s > best) { second = best; best = s; bestI = i; }
    else if (s > second) { second = s; }
  }
  if (bestI < 0) return null;
  // Confident match + clear margin over the next app (avoid ambiguous opens).
  if (best < 0.5) return null;
  if (mat.length > 1 && best - second < 0.06) return null;
  return APPS[bestI];
}
