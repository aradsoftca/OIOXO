/**
 * Pure routing predicates for the AI assistant — extracted so they can be unit-
 * tested in Node (no browser) and reused by `AiApp`. These decide *which kind of
 * request* a message is, separate from executing it.
 *
 * The pipeline order (in AiApp.routeAndAct): convert → quick-skill → help →
 * generative → reach-a-friend → doc-Q&A → general-question → recipe → app →
 * tool-routing → chat. First match wins; these helpers gate the ambiguous steps.
 */

// True only if the text contains letters from a non-Latin script (CJK, Arabic,
// Cyrillic, etc.) — used to decide whether the translate-to-English retry is
// worth it. For Latin text we never "translate" (it let the tiny model
// hallucinate a phrase that matched the wrong tool/app).
export function looksNonLatin(s: string): boolean {
  for (const ch of s) {
    if (/\p{L}/u.test(ch) && !/[A-Za-zÀ-ɏḀ-ỿ]/.test(ch)) return true;
  }
  return false;
}

// A general/conversational question (define, explain, "what is X", "why…") vs a
// request to DO something. No action/format/tool word → answer with the model.
export const QUESTION_RE = /^\s*(what(’|')?s|whats|what|why|how|who|whom|whose|when|where|which|explain|define|describe|tell me|meaning of|difference between|is|are|does|do|can you (explain|tell))\b/i;
export const ACTION_RE = /\b(convert|compress|resize|crop|rotate|flip|merge|split|trim|extract|remove|delete|watermark|download|upload|qr|palette|colou?rs?|draw|paint|generate|create|make|build|design|scan|ocr|transcribe|summari[sz]e|translate|send|share|transfer|record|upscale|denoise|sharpen|blur|edit|format|minify|encode|decode|hash|sign|protect|unlock|tool|calculator|calculate|generator|pdf|mp3|mp4|wav|png|jpe?g|webp|gif|svg|heic|epub|zip|docx?|xlsx?|csv)\b/i;
export function isGeneralQuestion(text: string): boolean {
  return QUESTION_RE.test(text) && !ACTION_RE.test(text);
}

// "send/call/chat … to my friend" — a request to REACH a person.
export const CONTACT_INTENT = /\b(send|share|give|pass|show|call|video[- ]?call|voice[- ]?call|chat|message|msg|text|talk|meet)\b[\s\S]{0,40}\b(friend|buddy|mate|someone|somebody|colleague|coworker|team|family|mom|dad|partner|him|her|them|people)\b/i;
export function findUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s]+|\b[a-z0-9-]+\.(?:com|net|org|io|co|app|dev|ai|me|xyz|info|link)(?:\/[^\s]*)?/i);
  if (!m) return null;
  return /^https?:\/\//i.test(m[0]) ? m[0] : `https://${m[0]}`;
}

export type ContactPlan =
  | { kind: 'send-file' }
  | { kind: 'qr'; url: string }
  | { kind: 'app'; name: string; href: string }
  | { kind: 'menu' };

/** Decide how to help someone reach a friend, given whether a file is in play. */
export function classifyContact(text: string, hasFile: boolean): ContactPlan {
  const lc = text.toLowerCase();
  if (hasFile && /\b(send|share|give|pass|file|photo|picture|image|document|pdf|video|audio|it|this)\b/i.test(lc)) return { kind: 'send-file' };
  const url = findUrl(text);
  if (url && /\b(send|share|qr|link|address|url|site)\b/i.test(lc)) return { kind: 'qr', url };
  if (/\b(call|video|voice|audio|chat|message|msg|text|talk|meet)\b/.test(lc)) {
    const wantsVoice = /\b(voice|audio)\b/.test(lc);
    const wantsChat = /\b(chat|message|msg|text|talk)\b/.test(lc) && !/\b(video|voice|call)\b/.test(lc);
    if (wantsVoice) return { kind: 'app', name: 'Voice Call', href: '/call?audio=1' };
    if (wantsChat) return { kind: 'app', name: 'Group Chat', href: '/chat' };
    return { kind: 'app', name: 'Video Call', href: '/call' };
  }
  return { kind: 'menu' };
}

// "what can you do / help / what tools" — answer with an organized overview.
export const HELP_INTENT = /\b(what can (you|xonvert|this|it) do|what (do|can) you (do|help)|what can i do here|how can you help|what (tools|features|apps) (do you (have|offer)|are (there|available))|what are you( for)?|what is this( site| app)?|capabilities)\b/i;
export const HELP_OVERVIEW =
  'I can do three things — run a job, find the right tool, or answer a question. Right here I can:\n' +
  '• Convert almost any file — PDF↔Word, MP4→MP3, HEIC→JPG, images, audio, video, ebooks, archives\n' +
  '• Edit — remove background, upscale, compress, crop, OCR, scan a document\n' +
  '• PDF — merge, split, compress, protect, sign\n' +
  '• Read — summarise a PDF or answer questions about it\n' +
  '• Make — QR codes, colour palettes, quick maths\n' +
  '• Connect — Send a file, Video/Voice Call, Group Chat, Watch Party, Whiteboard, Clipboard\n' +
  'For anything across the 300+ tools, just tell me what you’re trying to do.';

// A format-conversion request ("turn this PDF into Word", "export to PNG") that
// the inline planner doesn't run itself. Routes to the converter so a stray verb
// like "turn"/"change" can't match an editing tool (e.g. rotate) instead.
const FMT = 'word|docx?|pdf|excel|xlsx?|csv|powerpoint|pptx?|odt|odp|ods|rtf|txt|markdown|md|html|jpe?g|jpg|png|webp|avif|gif|bmp|tiff?|svg|ico|heic|mp3|wav|flac|ogg|aac|m4a|mp4|mov|webm|mkv|avi|gif|epub|mobi|azw3?|zip|rar|7z|tar|gz|stl|obj|glb|gltf|fbx|dae';
export const CONVERT_PHRASE = new RegExp(`\\b(convert|turn|change|export|save|make)\\b[\\s\\S]{0,30}\\b(to|into|as)\\b[\\s\\S]{0,16}\\b(${FMT})\\b`, 'i');

// Doc-Q&A only when a file is provided this turn, or the message explicitly
// refers to the document — so a general question doesn't read a stale file.
export const DOC_REFERS_RE = /\b(document|doc|pdf|file|page|pages|scan|attachment|invoice|receipt|contract|this|that|it|above|here)\b/i;
