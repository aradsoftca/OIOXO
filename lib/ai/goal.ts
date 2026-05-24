/**
 * Xonvert AI — goal extractor (the brain's UNDERSTAND stage).
 *
 * The ONE bounded thing the 0.6B model does: turn a free request into a small
 * structured Goal — what the user wants, as endpoints and an intent — NOT a
 * route. The "how" is then found deterministically by the capability graph.
 *
 *     "turn my song into a bmp"  →  { intent:'transform', from:'audio', to:'bmp', … }
 *     "what is bademjoon"        →  { intent:'answer',   subject:'bademjoon', … }
 *     "why can't I edit my pdf"  →  { intent:'assist',   from:'pdf', … }
 *
 * This module is pure and Node-testable. It provides:
 *  - `inferGoal`     — the deterministic FLOOR (no model): always returns a sane
 *                      Goal, so the WASM/cold path is never worse than today.
 *  - `goalPrompt` / `parseGoal` — grammar-constrained model call that REFINES the
 *                      floor. Per the reliability contract, the model only ever
 *                      improves the floor; junk output falls back to it.
 */

import { classifyIntent, type IntentCtx } from './intent';
import { wordFamily, vocabularyWords, type Family } from './capability-graph';

export type GoalIntent = 'transform' | 'create' | 'answer' | 'assist' | 'chat';

export interface Goal {
  intent: GoalIntent;
  /** Input media family — the attached file's family, or one named in the text. */
  from: Family | null;
  /** Desired output as a format/family word ('bmp','pdf','word'); null if not a transform. */
  to: string | null;
  /** The topic/thing — the search query for `answer`, the subject for `create`. */
  subject: string;
  /** Language to answer in ('en', or an ISO-ish hint like 'it'; 'auto' = detect downstream). */
  lang: string;
}

export interface GoalCtx extends IntentCtx {
  /** Family of the attached/working file, if any. */
  fileFamily?: Family | null;
}

// --- deterministic extraction helpers ---------------------------------------

const CREATE_VERB = /\b(make|create|generate|draw|paint|design|build|produce|render|compose)\b/i;
const CONVERT_EDIT_VERB = /\b(convert|turn|change|export|save|transform|compress|resize|crop|rotate|flip|trim|trim|merge|split|edit|watermark|upscale|denoise|sharpen|blur|trim|remove|extract|ocr|transcribe|translate|summari[sz]e)\b/i;

// "I'm blocked / it won't work / how do I" + an action → the user wants HELP
// with a capability we may have, not a web fact. (the /ai "assist" intent)
const STRUGGLE_RE = /\b(why (can'?t|cannot|won'?t|doesn'?t|isn'?t)|i can'?t|i cannot|can'?t seem|unable to|won'?t let me|not working|doesn'?t work|having (trouble|issues?|problems?)|need help|help me)\b/i;

// "in italian", "en español", "auf deutsch" → answer language hints.
const LANG_CUES: { re: RegExp; lang: string }[] = [
  { re: /\b(in |en )?(italian|italiano)\b/i, lang: 'it' },
  { re: /\b(in |en )?(spanish|espa[nñ]ol)\b/i, lang: 'es' },
  { re: /\b(in |auf )?(german|deutsch)\b/i, lang: 'de' },
  { re: /\b(in |en )?(french|fran[cç]ais)\b/i, lang: 'fr' },
  { re: /\b(in )?(portuguese|portugu[eê]s)\b/i, lang: 'pt' },
  { re: /\b(in )?(arabic|عربي|العربية)\b/i, lang: 'ar' },
  { re: /\b(in )?(persian|farsi|فارسی)\b/i, lang: 'fa' },
  { re: /\b(in )?(turkish|t[uü]rk[cç]e)\b/i, lang: 'tr' },
  { re: /\b(in )?(russian|русский)\b/i, lang: 'ru' },
  { re: /\b(in )?(hindi|हिन्दी)\b/i, lang: 'hi' },
  { re: /\b(in )?(chinese|中文|mandarin)\b/i, lang: 'zh' },
  { re: /\b(in )?(japanese|日本語)\b/i, lang: 'ja' },
];

function detectLang(text: string): string {
  for (const c of LANG_CUES) if (c.re.test(text)) return c.lang;
  // Non-Latin script with no explicit cue → let the downstream translator detect.
  for (const ch of text) {
    if (/\p{L}/u.test(ch) && !/[A-Za-zÀ-ɏḀ-ỿ]/.test(ch)) return 'auto';
  }
  return 'en';
}

const VOCAB = new Set(vocabularyWords());

/** Pull the FROM and TO endpoints out of the text (deterministic). */
export function extractEndpoints(text: string, fileFamily: Family | null): { from: Family | null; to: string | null } {
  const lc = text.toLowerCase();

  // "X to/into/as Y" — the classic conversion phrasing. Y is the output word.
  let to: string | null = null;
  let fromWord: string | null = null;
  const pair = lc.match(/\b([a-z0-9]+)\s+(?:to|into|as)\s+(?:an?\s+)?([a-z0-9]+)\b/);
  if (pair) {
    if (VOCAB.has(pair[2])) to = pair[2];
    if (VOCAB.has(pair[1])) fromWord = pair[1];
  }
  // "to/into a <format>" anywhere (e.g. "save this as a pdf").
  if (!to) {
    const m = lc.match(/\b(?:to|into|as|in)\s+(?:an?\s+|the\s+)?([a-z0-9]+)\b/);
    if (m && VOCAB.has(m[1]) && m[1] !== 'in') to = m[1];
  }
  // A bare trailing/standalone format the user clearly wants ("make it a gif").
  if (!to) {
    const words = lc.match(/[a-z0-9]+/g) ?? [];
    for (const w of words) { if (VOCAB.has(w) && wordFamily(w)) { /* candidate */ } }
  }

  // FROM: prefer the attached file's family; else "my/this/the <familyword>";
  // else the left side of an "X to Y" pair.
  let from: Family | null = fileFamily ?? null;
  if (!from) {
    const m = lc.match(/\b(?:my|this|the|a|an|from)\s+([a-z0-9]+)\b/);
    if (m && wordFamily(m[1])) from = wordFamily(m[1]);
  }
  if (!from && fromWord) from = wordFamily(fromWord);

  return { from, to };
}

/** Strip verbs/format words to leave the subject/topic (best-effort). */
export function extractSubject(text: string): string {
  return text
    .replace(/^\s*(what(’|')?s|whats|what|who|why|how|when|where|which|tell me|explain|define|please|can you|could you)\b/i, '')
    .replace(CREATE_VERB, '')
    .replace(/\b(a|an|the|me|of|about|in|to|into|as|for|image|picture|photo|poster)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim() || text.trim();
}

/**
 * The deterministic FLOOR — always returns a usable Goal with no model. Reuses
 * the validated `classifyIntent` for the family, then adds typed endpoints.
 */
export function inferGoal(text: string, ctx: GoalCtx = {}): Goal {
  const fileFamily = ctx.fileFamily ?? null;
  const lang = detectLang(text);
  const { from, to } = extractEndpoints(text, fileFamily);

  // Blocked/struggling phrasing about an action we may support → assist, even
  // though it's worded as a question ("why can't I edit my pdf").
  if (STRUGGLE_RE.test(text) && (from || CONVERT_EDIT_VERB.test(text) || to)) {
    return { intent: 'assist', from, to, subject: extractSubject(text), lang };
  }

  const fam = classifyIntent(text, { hasFile: ctx.hasFile, hasTopic: ctx.hasTopic });
  let intent: GoalIntent;
  switch (fam) {
    case 'chitchat': intent = 'chat'; break;
    case 'question':
    case 'followup': intent = 'answer'; break;
    case 'capability': intent = 'assist'; break;
    case 'media-subject': intent = 'create'; break;
    default: {
      // 'task' — decide transform vs create from the endpoints + verbs. Bare
      // tasks with no signal fall to 'answer': English classifyIntent can't tell
      // a NON-English question (which looks signal-less) from a command, and the
      // live tool router handles real English imperatives ("uppercase this")
      // regardless of this label — so 'answer' is the safe floor.
      if (to || (from && CONVERT_EDIT_VERB.test(text))) intent = 'transform';
      else if (CREATE_VERB.test(text) && !from && !fileFamily) intent = 'create';
      else if (from || fileFamily) intent = 'transform';
      else intent = 'answer';
    }
  }

  return { intent, from, to, subject: extractSubject(text), lang };
}

// --- model refinement (grammar-constrained) ---------------------------------

/** Build the constrained messages + JSON schema for the model to refine a goal. */
export function goalPrompt(text: string, ctx: GoalCtx, floor: Goal): {
  messages: { role: 'system' | 'user'; content: string }[];
  schema: string;
} {
  const vocab = vocabularyWords();
  const system =
    'Extract what the user WANTS as JSON. Decide one intent:\n' +
    '- "transform": change a file/content into another form or format.\n' +
    '- "create": make something new (no input file needed).\n' +
    '- "answer": a question or request for facts/info.\n' +
    '- "assist": they are stuck or asking how to do something we may support.\n' +
    '- "chat": greeting or small talk.\n' +
    'Set "from"/"to" to a media word ONLY from the allowed list, else "". ' +
    'Set "subject" to the topic in a few words. Set "lang" to the language to answer in (ISO code). ' +
    'Reply with ONLY JSON. /no_think';
  const user =
    `Request: "${text}"\nAttached file: ${ctx.hasFile ? (ctx.fileFamily ?? 'yes') : 'no'}\n` +
    `Best guess: ${JSON.stringify({ intent: floor.intent, from: floor.from, to: floor.to })}`;
  const schema = JSON.stringify({
    type: 'object',
    properties: {
      intent: { type: 'string', enum: ['transform', 'create', 'answer', 'assist', 'chat'] },
      from: { type: 'string', enum: [...vocab, ''] },
      to: { type: 'string', enum: [...vocab, ''] },
      subject: { type: 'string' },
      lang: { type: 'string' },
    },
    required: ['intent'],
  });
  return { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], schema };
}

/** Parse + validate the model's reply, falling back to the floor for bad fields. */
export function parseGoal(raw: string, floor: Goal): Goal {
  let obj: Record<string, unknown> | null = null;
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    obj = JSON.parse(m ? m[0] : raw);
  } catch { return floor; }
  if (!obj) return floor;

  const intents: GoalIntent[] = ['transform', 'create', 'answer', 'assist', 'chat'];
  const intent = intents.includes(obj.intent as GoalIntent) ? (obj.intent as GoalIntent) : floor.intent;
  const fromW = typeof obj.from === 'string' && obj.from ? wordFamily(obj.from) : null;
  const toRaw = typeof obj.to === 'string' && obj.to && VOCAB.has(obj.to) ? obj.to : null;
  const subject = typeof obj.subject === 'string' && obj.subject.trim() ? obj.subject.trim() : floor.subject;
  const lang = typeof obj.lang === 'string' && obj.lang.trim() ? obj.lang.trim().toLowerCase() : floor.lang;

  return {
    intent,
    // Keep the floor's file-derived `from` if the model didn't name one.
    from: fromW ?? floor.from,
    to: toRaw ?? floor.to,
    subject,
    lang,
  };
}
