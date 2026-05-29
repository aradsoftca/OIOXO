/**
 * oioxo chat engine — a reliable, in-place response path for the platform shell.
 *
 * Reuses the proven brain primitives (intent classifier, deterministic routing,
 * the real search/answer engine) so the modern white chat works WITHOUT a model
 * round-trip: chit-chat is answered instantly, a tool request resolves to the
 * right tool, and a question is answered from live search. The full AiApp engine
 * remains the richer path; this is the dependable core the platform UI runs on.
 */
import { classifyIntent } from './intent';
import { routeToTool } from './router';
import { rewriteFollowup } from './followup';
import { matchAppSemantic } from './app-match';
import { matchGame, gameIntro, gameMenu, type GameKind } from './games';
import { candidatesFor, fallbackDecision } from './agent';
import { answerQuestion, cleanQuery, type SearchSource } from './search';
import { matchApp } from './apps';
import { summarize, writeArticle, converseReply } from '../oioxo/writer';
import { facetQueries, gatherForQueries, gatherComparison } from './research';
import { analyzeQuestion, type Evidence } from './reason';
import { readAnswer } from './reader';
import { consensusAnswer } from './consensus';
import { gatherOnDevice, enrichTopPages, wikipediaBestArticles } from './sources';
import { tryCompute } from './compute';
import { rerank, scorePassages } from './rerank';
import { buildBrief, briefToDigest, briefHasContent } from './brief';
import { synthesizeText } from './synth';
import { decideMove, offerPreface, type Turn } from './converse';
import { findVideos, videoTranscript, wantsVideo, type VideoHit } from './video';
import { detectGeoIntent, answerGeo, type GeoPoint } from './geo';
import { detectAnswerType, looksInstructional, type AnswerType } from './extract';
import { richAnswer } from './web-read';
import { toEnglish, fromEnglish } from './translate';
import { getCached, putCached } from './search-cache';
import { capturePreference, remember, recallLanguage, recallName } from './user-memory';
import { detectFormat, renderFormat } from './format';
import { tryCheck } from './check-ops';
// v3: SmolVLM-256M-Brain (165MB int8, under the 180MB budget) supersedes the
// 360M conductor. Same planTurn() shape; the brain emits the 8-slot plan
// (added style + remember) that the engine already partially consumes.
// Conductor stays as backup — flip the import back if v3 needs rollback.
import { planTurn } from './brain-runtime';
import { findImages } from './image-search';
import { funReply } from '../ai-magic';
import { getTool, TOOLS } from '../registry';
import type { ToolManifest } from '../registry/types';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const catFile = (c: string): FileCat =>
  c === 'image' ? 'image' : c === 'audio' ? 'audio' : c === 'video' ? 'video' : c === 'pdf' ? 'pdf' : c === 'text' || c === 'subtitle' ? 'text' : null;
// Tool-name index for the exact-match guardrail — a name can map to several
// tools (image/pdf/video "Add Watermark"), so keep the list and pick by file.
const TOOLS_BY_NAME = new Map<string, ToolManifest[]>();
for (const t of TOOLS) {
  const k = norm(t.name);
  (TOOLS_BY_NAME.get(k) ?? TOOLS_BY_NAME.set(k, []).get(k)!).push(t);
}

/** If the request IS a tool's name (e.g. "uppercase", "pdf to images", "add
 *  watermark"), route straight to it — short tool-name queries score low in
 *  retrieval and otherwise fall through to search or image-intent. When several
 *  tools share a name, prefer the one matching the attached file's type. */
function exactToolMatch(text: string, fileCat: FileCat): string | null {
  const q = norm(text);
  if (q.length < 3) return null;
  const hits = TOOLS_BY_NAME.get(q);
  if (!hits || !hits.length) return null;
  if (fileCat) {
    const byFile = hits.find((t) => catFile(t.category) === fileCat);
    if (byFile) return byFile.id;
  }
  return hits[0].id;
}

type ImageHit = Awaited<ReturnType<typeof findImages>>[number];

/**
 * If the user is asking to SEE something (image/photo/picture/…), return the
 * subject to look up — else null. General: strips the request phrasing, works
 * for any subject (not a per-entity rule).
 */
function imageRequestSubject(text: string): string | null {
  const t = text.trim();
  // Action-on-a-file verbs mean a TOOL request ("compress this image"), NOT a
  // "show me images" request — never treat those as image-show.
  if (/\b(compress|resize|rotate|crop|convert|remove|removing|edit|editing|blur|sharpen|flip|watermark|upscale|enhance|grayscale|greyscale|invert|denoise|annotate|extract|combine|merge|split|optimi[sz]e|pixelate|brighten|darken|make)\b/i.test(t)) {
    return null;
  }
  const look = t.match(/\bwhat\s+do(?:es)?\s+(.+?)\s+look\s+like\b/i);
  if (look) return look[1].trim();
  const IMG = /\b(image|images|picture|pictures|photo|photos|pic|pics|wallpaper|wallpapers)\b/i;
  const showVerb = /\b(show|find|see|display|fetch|grab|search for|look up|google)\b/i.test(t);
  const ofX = /\b(image|images|picture|pictures|photo|photos|pic|pics|wallpaper|wallpapers)\s+of\b/i.test(t);
  const trailing = /\b(image|images|picture|pictures|photo|photos|pic|pics|wallpaper|wallpapers)\s*[?.!]*$/i.test(t);
  // Require a genuine "see this" signal — not just the word appearing somewhere.
  if (!((showVerb && IMG.test(t)) || ofX || trailing)) return null;
  const subject = t
    .replace(/^\s*(can you|could you|please|pls|i want|i need|i'?d like)\s+/i, '')
    .replace(/^\s*(show|find|get|see|display|give|send|fetch|grab|search for|look up|google)\s+(me\s+)?/i, '')
    .replace(/\b(an?|some|the|few|couple of)\s+/i, ' ')
    .replace(IMG, ' ')
    .replace(/\b(of|for|with|showing|about)\b/i, ' ')
    .replace(/[?.!]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return subject.length > 1 ? subject : null;
}

export type FileCat = 'image' | 'audio' | 'video' | 'pdf' | 'text' | null;

export interface OioxoReply {
  /** Markdown-ish assistant text. */
  text: string;
  /** When the best move is a tool, the manifest to surface as a card. */
  tool?: ToolManifest;
  /** When the request is an app intent (call, send, chat…), the app to launch. */
  app?: { name: string; href: string; blurb: string };
  /** Code task → prompt the user to open the Coding workspace (+ download coder). */
  openCode?: boolean;
  /** Play an interactive game in chat (deterministic on-device engine, not the LLM). */
  game?: { kind: GameKind };
  /** Visual row — for image requests AND as related imagery under answers. */
  images?: ImageHit[];
  /** Relevant videos to embed (how-to / explain) — we read their words, cite, link. */
  videos?: VideoHit[];
  /** Map points to plot (geo questions: distance / where) + whether to connect them. */
  map?: { points: GeoPoint[]; line?: boolean };
  /** Sources are kept but NOT shown by default (only if the user asks). */
  sources?: SearchSource[];
  /** Related follow-up topics. */
  related?: string[];
}

const HELLO =
  "Hi — I'm oioxo. I can convert and edit files, create things, and answer questions, all on your device. What do you need?";

// META / SELF / PRODUCT questions — the user is asking ABOUT the assistant or the
// service (who it is, what it can do, price, privacy, formats), NOT about the world.
// These must NEVER be web-searched ("is this free" → a SERP about the word "free" is a
// disaster); answer from who/what we are. General families (subject = us), anchored so
// real-world look-alikes ("how much to fly to Paris", "is it safe to eat raw eggs")
// still go to normal search.
const META_IDENTITY =
  /^\s*(who are you|what are you|what'?s your name|your name\b|tell me about yourself|introduce yourself|are you (a |an )?(chat ?gpt|gpt|ai|an ai|a bot|a robot|human|real|sentient|conscious|alive|claude|gemini|siri|alexa|google|openai))/i;
const META_CAPABILITY =
  /^\s*(what can you (do|help)|what do you do\b|what are your (capabilities|features|skills)|how (do|can) you help|what (kind of )?(things|stuff) can you)/i;
const META_PRICING =
  /^\s*(is (this|it|oioxo|the app|this app|this tool|this site)\s+(free|paid)\b|is (this|it) free to use\b|free to use\b|do i (have to|need to) pay\b|is there a (fee|subscription|paywall|free (version|tier|plan))\b|what'?s the (price|cost|pricing)\b|how much (is|does) (this|it|oioxo)( cost)?( to use)?\s*\??$|how much to use\b|cost to use\b)/i;
const META_PRIVACY =
  /\b((is|are) my (data|files?)\s+(safe|secure|private)|my (data|files?)\s+(safe|secure|private|stored)\b|do you (store|save|keep|upload|sell|share) my\b|where (are|is) my (files?|data)\b|where do (my|the) files? go\b|(do you|does (it|this)) work offline\b|works? offline\b|need(s)? internet\b|require[s]? internet\b|is (this|it) private\s*\??$)/i;
const META_FORMATS =
  /\b(what (file )?(formats?|types?|file ?types?) (can|do) you\b|which (formats?|files?) (can|do) you\b|what can you convert\b)/i;
const META_HELP =
  /^\s*(help|i (need|want|could use) (some )?help|can you help( me)?( out)?|what (can|should) i do( here| now)?|what now|how (does|do i use) this( work)?|where do i start)\s*[?.!]*$/i;
function metaSelfReply(text: string): OioxoReply | null {
  const t = text.trim();
  if (META_HELP.test(t)) {
    return { text: "Happy to help! I can convert and edit files (images, audio, video, PDFs, text), generate things, answer questions, and run handy apps — all on your device. What are you trying to do?" };
  }
  if (META_PRICING.test(t)) {
    return { text: "oioxo is free to use for everyday tasks. There's an optional upgrade for heavier or faster work, but you can do a lot without paying anything." };
  }
  if (META_PRIVACY.test(t)) {
    return { text: "Your files stay on your device — oioxo does the work locally and doesn't upload them to any server, so your data stays private. Many tools work offline, too." };
  }
  if (META_FORMATS.test(t)) {
    return { text: "I handle a wide range — images (JPG, PNG, WebP, GIF, HEIC…), audio (MP3, WAV, M4A…), video (MP4, WebM…), documents (PDF, Word, and more) and text. Send your file and tell me what you'd like it converted to." };
  }
  if (META_CAPABILITY.test(t)) {
    return { text: "Quite a lot — all on your device: I convert and edit files (images, audio, video, PDFs, text), generate things like QR codes, passwords and posters, answer questions using live web search with sources, and run handy apps like file-sharing and chat. What are you working on?" };
  }
  if (META_IDENTITY.test(t)) {
    return { text: "I'm oioxo — a private assistant that runs on your device, so your files stay with you. I can convert and edit files, create things, and answer questions with live search. (I'm my own assistant, not ChatGPT or another company's.)" };
  }
  return null;
}
function isMetaSelf(text: string): boolean {
  return metaSelfReply(text) != null;
}

// TRANSFORM-the-user's-text commands ("translate this", "summarize this",
// "proofread this") with NO content attached. The user wants us to ACT on something
// they haven't given yet — web-searching the concept ("summarize this" → an article
// ABOUT summarization) is the disaster. Recognize the missing input and ASK for it
// (the agentic "ask one thing" floor). Only fires with no file and no actual content.
const TRANSFORM_VERB =
  /^\s*(translate|summari[sz]e|proofread|rewrite|paraphrase|reword|rephrase|simplify|condense|fix (my |the )?(grammar|spelling|punctuation|wording))\b/i;
const TRANSFORM_DEICTIC =
  /\b(this|that|it|the following|my (text|essay|paragraph|message|writing|email|letter|grammar|spelling|note|sentence|paragraphs))\b/i;
function transformInputAsk(text: string, hasFile: boolean): OioxoReply | null {
  if (hasFile) return null;                 // a file IS the input
  const t = text.trim();
  if (!TRANSFORM_VERB.test(t)) return null;
  // Real content present (a "verb: <text>" block or a long body) → let it through.
  const afterColon = t.split(/:(.+)/s)[1]?.trim() ?? '';
  if (afterColon.length > 40 || t.length > 120) return null;
  const bare = t.split(/\s+/).length <= 3;
  if (!bare && !TRANSFORM_DEICTIC.test(t)) return null; // named an object → not "this"
  const verb = /translate/i.test(t) ? 'translate'
    : /summari[sz]e|condense/i.test(t) ? 'summarize'
    : /proofread|grammar|spelling|punctuation/i.test(t) ? 'proofread'
    : /simplif/i.test(t) ? 'simplify' : 'rewrite';
  const langHint = verb === 'translate' ? " (and the language, if it isn't in your message)" : '';
  return { text: `Sure — paste the text you'd like me to ${verb}${langHint}, or attach a file, and I'll do it right away.` };
}

// TIME / DATE "now" — answer from the device clock, never web-search ("what time
// is it" → a NIST phone-number page is a disaster). A location ("in tokyo") makes it
// a timezone/geo question → leave it for the geo path, not the local clock.
const ASK_TIME = /\b(what(?:'?s| is) the time\b|what time is it\b|current time\b|time (right )?now\b|the time now\b)/i;
const ASK_DATE = /\b(what(?:'?s| is)( the| today'?s)? date\b|what day is it\b|what'?s the day\b|today'?s date\b|current date\b|what'?s the date\b)/i;
const TIME_HAS_LOCATION = /\bin\s+[a-z][a-z ]+\??$/i;
function timeNowReply(text: string): OioxoReply | null {
  const t = text.trim();
  if (TIME_HAS_LOCATION.test(t)) return null; // "what time is it in tokyo" → geo/timezone
  const now = new Date();
  if (ASK_TIME.test(t)) {
    return { text: `It's ${now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} where you are right now.` };
  }
  if (ASK_DATE.test(t)) {
    return { text: `Today is ${now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.` };
  }
  return null;
}

// SOCIAL turns — affirmations, closings, and FRUSTRATION AT the assistant. Must be
// acknowledged warmly, NEVER web-searched ("yes" → a Wikipedia page on the word "yes";
// "you're useless" → an SEO page about useless things). Anchored to standalone short
// turns so a real request ("yes convert this") is untouched.
const FRUSTRATION =
  /\b(you(?:'?re| are)? (useless|stupid|dumb|wrong|bad|terrible|awful|broken|no help|not help(ing|ful))|this is (useless|stupid|dumb|pointless|garbage|terrible|a waste|trash)|you (don'?t|do not|never) (understand|get it|get me|listen|help)|(that'?s|that is) (wrong|not what i (asked|meant|wanted)|not right|useless)|wrong answer|not helpful|makes no sense)\b/i;
// The WHOLE message is just social/filler tokens (so "ok cool thanks", "great that
// helped", "yeah nice" all match) — but a topic word ("great WALL of china") breaks it.
const AFFIRM_CLOSE =
  /^(\s*(y(es|eah|ep|up|a)|no(pe)?|ok(ay)?|kk?|sure|cool|nice|great|good|fine|alright|perfect|awesome|got|gotcha|understood|makes|sense|sounds|will|do|bye|goodbye|see|ya|cya|you|good ?night|night|later|gtg|nvm|never|mind|that|that'?s|helped|helpful|all|it|thanks?|thank|thx|ty|cheers|man|mate|buddy|so|much|though|then|appreciate|appreciated|np|problem|no)[\s,!.]*)+$/i;
// The user venting about their OWN state (not the AI) → empathy + a gentle offer,
// never a fact sheet (the audit returned a mental-health PDF for "I'm so stressed").
const VENTING =
  /\b(i'?m (so |really |feeling )?(stressed|tired|exhausted|overwhelmed|anxious|sad|depressed|miserable|done|fed up|burnt? out|burned out)|i feel (like )?(awful|terrible|down|low|lost|stuck|hopeless|overwhelmed|like (everything|nothing|crap|shit))|everything('?s| is)? (going wrong|falling apart|a mess|so hard)|nothing (i try )?(works?|is working|is going right)|i can'?t (focus|cope|deal|take it|do this)|having (a|the) (bad|rough|hard|worst) (day|time|week)|so frustrating|i give up)\b/i;
function socialReply(text: string): OioxoReply | null {
  const t = text.trim();
  if (VENTING.test(t)) {
    return { text: "That sounds genuinely tough — I'm sorry you're going through it. I'm happy to just listen, or if there's something concrete I can take off your plate (look something up, sort a file, draft a message), tell me and I'll jump on it." };
  }
  if (FRUSTRATION.test(t)) {
    return { text: "Sorry — that wasn't helpful. Tell me what you're trying to do and I'll take a different approach." };
  }
  if (AFFIRM_CLOSE.test(t)) {
    if (/\b(bye|goodbye|see ya|cya|see you|good ?night|later|gtg)\b/i.test(t)) return { text: 'Take care! 👋' };
    if (/\b(that helped|that('?s)? (great|helpful))\b/i.test(t)) return { text: "Glad that helped! Anything else?" };
    if (/\b(thanks?|thank you|ty|cheers)\b/i.test(t)) return { text: "You're welcome — anything else I can help with?" };
    if (/^\s*(no(pe)?|no thanks?|nothing|nvm|never ?mind|that('?s)? (all|it))\b/i.test(t)) return { text: "No problem — I'm here whenever you need me." };
    return { text: 'Got it 👍 — what would you like to do next?' };
  }
  return null;
}
function isSocial(text: string): boolean {
  return socialReply(text) != null;
}

// WORD DEFINITION — "define X", "what does X mean", "meaning of X" for a SINGLE word
// → a real dictionary, not the open web (which gave an offensive slang snippet for
// "ubiquitous"). Deliberately NOT "what is X" (that's a concept → the encyclopedic
// lead handles it better). Single-word only; falls through otherwise.
const DEFINE_WORD =
  /^\s*(?:define|definition of|meaning of|what(?:'?s| is) the meaning of|what does)\s+(?:the\s+word\s+)?["']?([a-z][a-z-]{1,30})["']?\s*(?:mean|means)?\s*[?.!]*$/i;
async function defineWord(text: string): Promise<OioxoReply | null> {
  const m = text.trim().match(DEFINE_WORD);
  if (!m) return null;
  const word = m[1].toLowerCase();
  try {
    const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!r.ok) return null;
    const data: any = await r.json();
    const meaning = (Array.isArray(data) ? data[0] : null)?.meanings?.[0];
    const def = meaning?.definitions?.[0]?.definition;
    if (!def) return null;
    const pos = meaning?.partOfSpeech ? ` (${meaning.partOfSpeech})` : '';
    const ex = meaning?.definitions?.[0]?.example;
    const w = word.charAt(0).toUpperCase() + word.slice(1);
    return { text: `**${w}**${pos}: ${def}${ex ? `\n\n*e.g. "${ex}"*` : ''}` };
  } catch {
    return null; // offline / not found → normal flow
  }
}

// CURRENCY conversion — needs a live rate, so use a free no-key FX API instead of
// web-searching ("100 usd to eur" had returned minimum-wage-by-country junk). Falls
// through (null) for non-currency or when offline. Unit conversion (compute.ts) runs
// FIRST, so "5 km to miles" never reaches here.
const CUR: Record<string, string> = {
  usd: 'USD', dollar: 'USD', dollars: 'USD', buck: 'USD', bucks: 'USD',
  eur: 'EUR', euro: 'EUR', euros: 'EUR', gbp: 'GBP', pound: 'GBP', pounds: 'GBP', quid: 'GBP',
  jpy: 'JPY', yen: 'JPY', cad: 'CAD', aud: 'AUD', chf: 'CHF', cny: 'CNY', yuan: 'CNY', rmb: 'CNY',
  inr: 'INR', rupee: 'INR', rupees: 'INR', krw: 'KRW', won: 'KRW', brl: 'BRL', mxn: 'MXN',
  rub: 'RUB', ruble: 'RUB', rubles: 'RUB', try: 'TRY', lira: 'TRY', sek: 'SEK', nok: 'NOK', dkk: 'DKK', zar: 'ZAR',
};
const curCode = (s: string): string | null =>
  CUR[s] ?? CUR[s.replace(/s$/, '')] ?? (/^[a-z]{3}$/.test(s) ? s.toUpperCase() : null);
async function convertCurrency(text: string): Promise<OioxoReply | null> {
  const m = text.toLowerCase().match(/(?:convert\s+)?(\d+(?:\.\d+)?)\s*([a-z]{1,8})\s+(?:to|in|into)\s+([a-z]{1,8})\b/);
  if (!m) return null;
  const from = curCode(m[2]), to = curCode(m[3]);
  if (!from || !to || from === to) return null;
  const amount = parseFloat(m[1]);
  try {
    const r = await fetch(`https://api.frankfurter.app/latest?amount=${amount}&from=${from}&to=${to}`);
    if (!r.ok) return null;
    const out = (await r.json())?.rates?.[to];
    if (typeof out !== 'number') return null;
    return { text: `${amount} ${from} = **${out.toFixed(2)} ${to}** at today's rate.` };
  } catch {
    return null; // offline / unsupported currency → normal flow
  }
}

// NO-CONTENT input — only punctuation / symbols / emoji ("?", "...", "👍"). Never
// web-search it ("?" → a Wikipedia page on the question mark); acknowledge or ask.
const POSITIVE_EMOJI = /[\u{1F44D}\u{1F600}-\u{1F64F}\u{2764}\u{1F389}\u{1F44F}\u{1F525}\u{1F60D}]/u;
function noContentReply(text: string): OioxoReply | null {
  const t = text.trim();
  if (!t || /[a-z0-9]/i.test(t)) return null; // empty (HELLO upstream) or has real content
  if (POSITIVE_EMOJI.test(t)) return { text: "Glad you're happy! 😄 Anything else I can help with?" };
  return { text: 'Did you want to ask something? I can convert files, answer questions, and run tools — just tell me what you need.' };
}

export type RouteKind = 'chat' | 'code' | 'image' | 'summary' | 'article' | 'app' | 'tool' | 'answer' | 'game';

/** A coding task (pasted code, or "review/refactor/fix … code/function/bug"),
 *  which belongs in the Coding workspace, not an inline chat answer. General. */
function isCodeTask(text: string): boolean {
  if (/```[\s\S]*?```/.test(text)) return true; // pasted code block
  if (/\b(review|refactor|debug|optimi[sz]e|lint|fix|improve|rewrite)\b[^.]{0,40}\b(code|function|bug|script|snippet|class|component|module|error|stack ?trace|repo|project|file)\b/i.test(text)) {
    return true;
  }
  // Looks like a multi-line code paste (many code tokens across lines).
  const tokens = (text.match(/[;{}()=]|=>|\bfunction\b|\bconst\b|\blet\b|\bimport\b|\bdef\b|\bclass\b|\breturn\b/g) || []).length;
  return text.length > 120 && /\n/.test(text) && tokens >= 6;
}
export interface Route {
  kind: RouteKind;
  subject?: string; // image
  app?: { name: string; href: string; blurb: string };
  toolId?: string;
  query?: string; // answer
  src?: string; // summary/article source text
  gameKind?: GameKind; // game: launch this board in chat
  gameMenu?: boolean;  // game: they want to play but didn't name one → show the menu
}

/** The running conversation topic — the SUBJECT of the most recent user turn —
 *  so a follow-up ("where was he born?", "what about its population?") can be
 *  resolved against it. Uses the comprehension layer's concept (the same subject
 *  the answer path searches on), falling back to a cleaned query. Null when there's
 *  no prior turn. Floor-level topic tracking; a trained intent head sharpens it. */
function lastTopicOf(history?: Turn[]): string | null {
  const lastUser = [...(history ?? [])].reverse().find((t) => t.role === 'user' && t.text.trim());
  if (!lastUser) return null;
  const concept = comprehendAnswer(lastUser.text).concept?.trim();
  if (concept && concept.length >= 2) return concept;
  const q = cleanQuery(lastUser.text)?.trim();
  return q && q.length >= 2 ? q : null;
}

/**
 * ENCODER-REFINED routing — the trained-encoder path the pure regex/lexical
 * `decideRoute` can't reach. `decideRoute` stays the deterministic floor (no
 * model, Node-testable, the eval target); this lets the SEMANTIC tool router
 * (`routeToTool` — the lexical+embedding hybrid the WebLLM app already uses)
 * RECOVER a tool the keyword/regex layer missed on a paraphrase: "make my photo
 * smaller" has no tool-NAME token, so `fallbackToolOk` rejects it and decideRoute
 * falls to 'answer' — but the encoder sees the MEANING (≈ resize/compress).
 *
 * MONOTONIC by construction: only fires when decideRoute found NO tool (kind
 * 'answer'), and only when the hybrid router is itself `confident` (its own
 * semantic-veto already folds in). It never overrides chat/code/image/summary/app
 * or a tool decideRoute already resolved → it can only ADD correct tool routings.
 * The arad-trained tool-routing reranker slots in behind `routeToTool` later, with
 * zero caller changes. `router` is injectable for deterministic Node tests.
 */
export async function refineRouteWithEncoder(
  text: string,
  fileCat: FileCat,
  base: Route,
  router: typeof routeToTool = routeToTool,
): Promise<Route> {
  if (base.kind !== 'answer') return base; // only the no-tool boundary can improve
  // An explain/how-to question stays an answer — don't let a confident embedding
  // match re-hijack "what is a qr code" into the QR tool (same rule as fallbackToolOk).
  if (!fileCat && looksInformational(text)) return base;
  let routing: Awaited<ReturnType<typeof routeToTool>>;
  try { routing = await router(text, fileCat); } catch { return base; }
  if (!routing.semantic) return base;      // embeddings cold → no signal beyond lexical
  if (routing.confidence === 'confident' && routing.top) {
    return { kind: 'tool', toolId: routing.top.doc.id };
  }
  return base;
}

/**
 * PURE routing decision — no network/model side effects, so thousands of prompts
 * can be evaluated in Node to find error CLASSES (the "prompt trainer"). respond()
 * executes whatever this decides; the eval harness checks this against expected.
 */
export function decideRoute(message: string, fileCat: FileCat = null): Route {
  const text = message.trim();
  const hasFile = fileCat != null;
  if (!text) return { kind: 'chat' };
  if (classifyIntent(text, { hasFile }) === 'chitchat') return { kind: 'chat' };
  // A question ABOUT the assistant ("what can you do", "are you chatgpt") or a social
  // turn ("yes", "thanks", "you're useless") is a talk turn, not a web search —
  // handled by talkReply's metaSelfReply / socialReply.
  if (!hasFile && (isMetaSelf(text) || isSocial(text))) return { kind: 'chat' };

  if (isCodeTask(text)) return { kind: 'code' };

  // GAME: "let's play chess / connect four / tic-tac-toe" → launch an interactive
  // board (a deterministic engine plays the opponent). Matched before tools so
  // "play chess" isn't hijacked; matchGame ignores questions ABOUT a game.
  const gm = matchGame(text);
  if (gm) return 'menu' in gm ? { kind: 'game', gameMenu: true } : { kind: 'game', gameKind: gm.kind };

  // Exact tool-name request wins over image-intent ("pdf to images" is a TOOL,
  // not an image search) and the weak-confidence fall-through.
  const exact = exactToolMatch(text, fileCat);
  if (exact) return { kind: 'tool', toolId: exact };

  const subject = imageRequestSubject(text);
  if (subject) return { kind: 'image', subject };

  const wantSummary = /\b(summari[sz]e|summary|summari[sz]ation|tl;?dr|recap|sum it up)\b/i.test(text);
  const wantArticle = /\b(write|draft|compose)\b[^.]*\b(article|blog|post|write-?up)\b/i.test(text);
  if (wantSummary || wantArticle) {
    const src = (text.split(/:(.+)/s)[1] ?? text).trim();
    if (src.length > 140) return { kind: wantArticle ? 'article' : 'summary', src };
  }

  const app = matchApp(text);
  if (app) return { kind: 'app', app: { name: app.name, href: app.href, blurb: app.blurb } };

  const cands = candidatesFor(text, fileCat);
  const decision = fallbackDecision(text, cands, hasFile);
  if (decision.action === 'tool' && decision.tool && fallbackToolOk(text, decision.tool, hasFile)) {
    return { kind: 'tool', toolId: decision.tool };
  }
  return { kind: 'answer', query: decision.query || text };
}

/**
 * An INFORMATIONAL / how-to QUESTION — the user wants it EXPLAINED, not DONE.
 * "what is a qr code", "how do I remove a background", "explain base64" must be
 * ANSWERED even though a keyword matches a tool's name; only a bare imperative
 * ("make a qr code", "compress this") or an attached file is a real tool request.
 * General linguistic rule (interrogative/explanatory opener), not a per-tool patch.
 */
const INFO_QUESTION =
  /^\s*(what(\s|'|’|s\b)|how (do|does|to|can|could|would|should|might)\b|why\b|when\b|who\b|where\b|which\b|whose\b|explain\b|define\b|describe\b|tell me\b|teach me\b|tutorial\b|guide to\b|difference between\b|can you (explain|tell|describe)\b|is (it|there|a|an)\b)/i;
export function looksInformational(text: string): boolean {
  return INFO_QUESTION.test(text.trim());
}

/**
 * Guard the WEAK tool route (a tool chosen by keyword retrieval, not an exact
 * name match). Without an attached file, only trust it when the query actually
 * mentions part of the tool's NAME — otherwise an incidental keyword hijacks a
 * plain phrase or question ("salt and pepper" → the password-*salt* tool,
 * garbled text → "Add Line Numbers"). Vocabulary-free and general.
 */
function fallbackToolOk(text: string, toolId: string, hasFile: boolean): boolean {
  if (hasFile) return true; // a file + a plausible tool is a real edit request
  // An explain/how-to question wants an ANSWER, never a tool launch — even when a
  // tool name token matches ("what is base64" ≠ run the Base64 tool).
  if (looksInformational(text)) return false;
  const tool = getTool(toolId);
  if (!tool) return false;
  const q = new Set(norm(text).split(' ').filter((w) => w.length > 2));
  const nameToks = norm(tool.name).split(' ').filter((w) => w.length > 2);
  return nameToks.some((w) => q.has(w));
}

/** Keep only genuine follow-up TOPICS as chips. Raw search-result titles
 *  ("Ghormeh Sabzi | The Mediterranean Dish", "X Recipe - Allrecipes") read like
 *  a source dump and aren't good questions to click — drop anything with a site
 *  separator, a domain, or headline length. */
function cleanRelated(related?: string[]): string[] | undefined {
  if (!related?.length) return undefined;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r0 of related) {
    const r = r0.trim();
    const key = norm(r);
    if (!r || seen.has(key)) continue;
    if (/[|]/.test(r) || /\s[-–—]\s/.test(r)) continue; // "Foo | Site" / "Foo - Site"
    if (/\.(com|org|net|io|gov|edu)\b/i.test(r)) continue; // a URL / site name
    if (r.split(/\s+/).length > 6) continue; // a headline, not a topic
    seen.add(key);
    out.push(r);
    if (out.length >= 4) break;
  }
  return out.length ? out : undefined;
}

/**
 * The COMPREHENSION layer — the front door for every answer prompt. Before we
 * search anything we read what the prompt actually IS: its concept (what it's
 * about), its shape (a single fact, a comparison between options, a how-to, a
 * recipe, code, an explanation, a list/recommendation, a definition), and from
 * that, HOW to learn about it and HOW to organize the reply. recipe/compare/etc.
 * are not separate code paths — they're outcomes of this one understanding, so
 * the same pipeline handles them uniformly (and the eval can probe it directly).
 */
export type AnswerShape = 'recipe' | 'howto' | 'code' | 'compare' | 'explain' | 'list' | 'define' | 'fact';
export interface AnswerPlan {
  /** What the prompt is about, cleaned of filler. */
  concept: string;
  /** The kind of thing being asked. */
  shape: AnswerShape;
  /** What to learn about — one topic, or each side of a comparison. */
  topics: string[];
  /** HOW to learn it: pull an expert page's structured answer, fetch each option
   *  separately, or decompose into facets. */
  gather: 'structured' | 'per-entity' | 'facets';
  /** HOW to organize the reply for this shape. */
  organize: 'extract' | 'recommend' | 'explain' | 'state' | 'define';
}

/** Understand a prompt before answering: concept + shape + how to handle it. */
export function comprehendAnswer(text: string): AnswerPlan {
  const concept = cleanQuery(text) || text.trim();
  const type = detectAnswerType(text); // recipe | howto | code | definition | general
  const analysis = analyzeQuestion(text); // single | compare | explain | list | factoid

  // Structured concepts: the expert answer (ingredients+steps / steps / code)
  // already exists on a page — extract it rather than author it.
  if (type === 'recipe') return { concept, shape: 'recipe', topics: [concept], gather: 'structured', organize: 'extract' };
  if (type === 'code') return { concept, shape: 'code', topics: [concept], gather: 'structured', organize: 'extract' };
  if (type === 'howto') return { concept, shape: 'howto', topics: [concept], gather: 'structured', organize: 'extract' };

  // A decision between options → learn each side, then weigh and recommend.
  if (analysis.kind === 'compare' && analysis.topics.length >= 2) {
    return { concept, shape: 'compare', topics: analysis.topics, gather: 'per-entity', organize: 'recommend' };
  }
  // Explanations and lists/recommendations need facts woven from several angles.
  if (analysis.kind === 'explain') return { concept, shape: 'explain', topics: [concept], gather: 'facets', organize: 'explain' };
  if (analysis.kind === 'list') return { concept, shape: 'list', topics: [concept], gather: 'facets', organize: 'state' };
  if (type === 'definition') return { concept, shape: 'define', topics: [concept], gather: 'facets', organize: 'define' };
  return { concept, shape: 'fact', topics: [concept], gather: 'facets', organize: 'state' };
}

/** Round-robin merge several image lists into one row, de-duped — so a
 *  comparison shows a couple of EACH side (cadillac, mazda, cadillac, mazda)
 *  rather than four of whichever the resolver picked. */
function interleaveImages(lists: ImageHit[][], cap = 4): ImageHit[] {
  const out: ImageHit[] = [];
  const seen = new Set<string>();
  const depth = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < depth && out.length < cap; i++) {
    for (const l of lists) {
      const img = l[i];
      if (img && !seen.has(img.url)) {
        seen.add(img.url);
        out.push(img);
        if (out.length >= cap) break;
      }
    }
  }
  return out;
}

// Interrogatives — structural question markers (NOT topic vocabulary). Used to
// find the bare subject for image lookup: the words before the first question
// word ("world war i how started and how ended" → "world war i"), so we resolve
// the real entity instead of searching the whole messy question.
const QWORD = /\b(?:how|why|what|when|where|who|which|whom|whose)\b/i;
function imageSubjectOf(concept: string, fallback: string): string {
  const before = concept.split(QWORD)[0]?.trim();
  return before && before.length >= 2 ? before : concept || fallback;
}

// Images only help a concrete, SEEABLE subject (a place, animal, object, person,
// food, landmark). For process / number / advice / troubleshooting / yes-no /
// "difference between" questions, 4 stock photos are just noise — the audit showed
// images firing on "why is my internet slow", "3/8 as a decimal", "stock market".
const NONVISUAL =
  /\b(how (do|to|can|should|much|many|long|old|far)|why (is|do|does|are|did|can|would)|difference between|vs\.?|versus|calculate|convert|percent|\btip\b|should i|is it (safe|ok|okay|bad|worth|normal|good)|wo n'?t|won'?t|not work|doesn'?t work|so slow|keeps? (crash|drop|restart)|fix\b|error|stress|nervous|frustrat|depress|recommend|suggest|worth it|safe to|how does .* work)\b/i;

/** Images for an answer — show ALL parts of the subject. A comparison fetches a
 *  couple of images of EACH option and interleaves them; otherwise the subject. */
async function imagesForPlan(plan: AnswerPlan, text: string): Promise<ImageHit[]> {
  if (plan.shape === 'code') return [];
  if (NONVISUAL.test(text)) return []; // non-visual intent → no noisy stock photos
  if (plan.gather === 'per-entity' && plan.topics.length >= 2) {
    const lists = await Promise.all(plan.topics.slice(0, 3).map((t) => findImages(t, 2).catch(() => [] as ImageHit[])));
    return interleaveImages(lists, 4);
  }
  return findImages(imageSubjectOf(plan.concept, text), 4).catch(() => []);
}

/**
 * THE NO-DUMB GATE — the system invariant: no answer-path reply ships if it's
 * visibly dumb. Catches the failure shapes that make an AI look broken: empty/too
 * short, degenerate repetition, disambiguation/encyclopedic dumps ("X may refer
 * to…"), a list of source titles, or leaked scaffolding ("according to the
 * notes"). Sense/factual correctness is the reranker+verifier's job; THIS catches
 * the visibly-wrong output so we can fall back gracefully instead of shipping it.
 * Returns true when the reply must NOT be shown as-is.
 */
const DUMB_PATTERNS =
  /\b(may (also )?refer to|is a disambiguation|see also wiki|according to the (notes?|sources?|information|text)|as an ai( language)?( model)?|i (don'?t|do not) have (enough|access|the ability)|i (cannot|can'?t) (answer|access|browse)|the (notes?|sources?) (do not|don'?t|lack)|here are (some|the) (results|sources|links))\b/i;
export function isDumbAnswer(reply: string): boolean {
  const r = (reply || '').replace(/\s+/g, ' ').trim();
  if (r.length < 15) return true;
  // SAFETY veto: explicit/adult content must never ship as an answer (the audit
  // surfaced porn-site text leaking for "a good movie tonite").
  if (/\b(porn|pornography|xxx|nsfw|explicit sex|hardcore|nude girls?|sex (cam|chat|website)|escort)\b/i.test(r)) return true;
  if (/^[#*\-•>`|]|```/.test(r)) return false; // structured (recipe/code/list) is intentional
  if (DUMB_PATTERNS.test(r)) return true;
  const w = r.toLowerCase().split(/\s+/);
  if (w.length >= 8) {
    const grams = w.slice(0, -2).map((_, i) => w.slice(i, i + 3).join(' '));
    if (new Set(grams).size < grams.length * 0.62) return true; // degenerate 3-gram repetition
  }
  if (w.length >= 6) {
    const c: Record<string, number> = {};
    for (const x of w) if (x.length > 2) c[x] = (c[x] || 0) + 1;
    if (Math.max(0, ...Object.values(c)) / w.length > 0.35) return true; // one word dominates
  }
  // a pile of source-title cruft (pipes / " - Site" / domains) rather than prose
  if ((r.match(/\s[|]\s|\s[-–—]\s[A-Z]|\.(com|org|net|io)\b/g) || []).length >= 3) return true;
  return false;
}

/** The honest, graceful reply when the gate vetoes — better than a dumb answer. */
function gracefulFallback(concept: string): OioxoReply {
  const c = (concept || '').trim();
  return {
    text: c && c.length <= 40
      ? `I couldn't pin down a reliable answer about ${c} just now. Could you add a detail or rephrase it? I'd rather get it right than guess.`
      : "I couldn't pin down a reliable answer to that just now — could you rephrase or add a detail? I'd rather get it right than guess.",
  };
}

/** Never open an answer mid-sentence. When gathered text starts with punctuation
 *  or lowercase (a clipped fragment like ", the Middle East…"), cut to the first
 *  real sentence start. Purely structural — no content rules. */
function tidyAnswer(s: string): string {
  const raw = (s || '').trim();
  if (!raw) return raw;
  // Leave structured answers (markdown lists/headings, code blocks, tables)
  // alone — their leading "*", "#", "```", digit are intentional, not fragments.
  if (/^[#*\-•>`|]|^\d+[.)]|```/.test(raw)) return raw;
  let t = raw.replace(/\s+/g, ' ');
  if (/^[^A-Z0-9"'(¿¡]/.test(t)) {
    const m = t.match(/[A-Z][\s\S]*$/);
    if (m && m[0].length >= 40) t = m[0].trim();
    else t = t.replace(/^[^\w"'(]+/, '').trim();
  }
  return t;
}

/** The first `n` clean sentences of a text (the encyclopedic lead = the answer). */
function firstSentences(text: string, n = 3): string {
  const ss = (text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+/g) ?? [text]).map((s) => s.trim()).filter((s) => s.length > 15);
  return ss.slice(0, n).join(' ').trim();
}
/** Strip Wikipedia's phonetic/pronunciation parentheticals ("(/ˈkænbrə/ ⓘ …)"). */
function stripPhonetics(s: string): string {
  return s
    .replace(/\s*\(\s*\/[^)]*\/[^)]*\)/g, '')
    .replace(/\s*\([^()]*[ˈˌːⓘ][^()]*\)/g, '')
    .replace(/\s{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
}

/** Store a learned answer in the device's knowledge base for instant recall on a
 *  future equivalent question. Best-effort; no-op off-device (Node/SSR). */
async function rememberAnswer(text: string, answer: string, related?: string[]): Promise<void> {
  if (!answer || answer.length < 20) return;
  await putCached(text, { answer, query: text, sources: [], related }).catch(() => {});
}

/**
 * Drop a passage that is a navigational/marketing LISTING rather than
 * information — the "Compare prices, options … and more" / "Find out with X
 * tool" blurbs that read like an answer but say nothing. Structural, not a
 * per-site rule: a call-to-action plus a "and more / reviews / specs" tail.
 * Returns the cleaned prose, or '' to reject it.
 */
function cleanPassage(s: string): string {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const cta = /\b(compare prices|find out with|shop |browse |see (pricing|listings?)|view (all )?listings?|book now|get a quote|head-?to-?head .*tool)\b/i.test(t);
  const filler = /\b(and more|reviews?( and| ,)|specs?( and| ,)|deals?|expert and consumer)\b/i.test(t);
  if (cta && filler) return '';
  return t;
}

/**
 * Answer pipeline driven by the comprehension layer: understand → LEARN (gather
 * the way the concept needs) → ORGANIZE (synthesize the way the shape needs).
 */
async function answerFlow(text: string, query: string, _fileCat: FileCat): Promise<OioxoReply> {
  const plan = comprehendAnswer(text);

  // MULTIMODAL: a how-to / explain question is better WITH a video — and we can
  // read what's SAID in it (transcript) as a source no text model can. Fetch in
  // parallel so it never slows the answer; best-effort, attached when found.
  const videosP: Promise<VideoHit[]> = wantsVideo(text, plan.shape)
    ? findVideos(plan.concept || text, 2).catch(() => [])
    : Promise.resolve([]);

  // MEMORY (learn & recall): a question we've answered before — even worded
  // differently but meaning the same — is recalled instantly from the device's
  // own knowledge base, no network. This is the "remember for next time" layer.
  const recalled = await getCached(text).catch(() => null);
  if (recalled?.answer) {
    const images = await imagesForPlan(plan, text);
    return { text: tidyAnswer(recalled.answer), images, related: cleanRelated(recalled.related) };
  }

  // PRACTICAL / HOW-TO / RECIPE / CODE / "best way" / "substitute" / how-why: a
  // Wikipedia LEAD here gives a DEFINITION ("a bicycle is a vehicle…"), the wrong
  // shape. These SKIP the encyclopedic-lead below and flow to the whole-internet
  // gather → the trained reader (readAnswer, in-browser) → synthesizeText fallback —
  // so the model ranks real how-to/explanation sentences instead of a definition.
  const atype = detectAnswerType(text);
  const factualLookup = /\b(capital|population|tallest|largest|who (is|was|are|wrote|invented|founded)|when (did|was|is|will)|where (is|are|was)|how (much|many|old|far|long|tall|big))\b/i.test(text);
  const practical = !factualLookup && (
    atype === 'howto' || atype === 'recipe' || atype === 'code' ||
    /^\s*(how|why)\b/i.test(text) ||
    /\b(substitutes?|alternative|replace|best way|fix\b|unclog|stop|tips?|steps?|recipe|should i|recommend|suggest|troubleshoot|not working|wo n'?t|won'?t)\b/i.test(text)
  );

  // ENCYCLOPEDIC LEAD (explain/define/fact, NON-practical): Wikipedia search finds the
  // right article from a natural question ("why is the sky blue" → Diffuse sky
  // radiation; "capital of australia" → Canberra), and an article's LEAD paragraph
  // is the definition/explanation/value. We fetch the top 2 articles, score each
  // lead against the question with the reranker, and if one is confidently relevant
  // we answer from it — cited, authoritative, and bypassing the noisy general web
  // gather (also faster). Falls through if no confident article.
  // Only for ENCYCLOPEDIC questions, where a Wikipedia lead IS the answer. SKIP
  // current/specific-VALUE questions (cost, net worth, dating, calories, latest)
  // — those answers live in the live web, not a stable article lead (the battery
  // showed the lead path regressing quantity/people otherwise).
  const valueOrCurrent = /\b(how much|how many|cost|costs?|price[ds]?|worth|net worth|salary|calorie|dating|married|girlfriend|boyfriend|latest|newest|current(ly)?|today|this year|20\d\d|release date|when (did|will|is|was)|who is .* (dating|married))\b/i;
  if (!practical && (plan.shape === 'explain' || plan.shape === 'define' || plan.shape === 'fact') && !valueOrCurrent.test(text)) {
    try {
      // Fetch SEVERAL candidates (the best article may be #3 — "capital of
      // australia" ranks ACT #1 but Canberra #3) and let the reranker pick the
      // article whose LEAD best answers the question.
      const arts = await wikipediaBestArticles(text, 4);
      if (arts.length) {
        const leads = arts.map((a) => firstSentences(a.text, 3));
        const scores = (await scorePassages(text, leads)) ?? leads.map(() => 0);
        let bestI = 0;
        scores.forEach((s, i) => { if (s > scores[bestI]) bestI = i; });
        if (scores[bestI] > 0 && leads[bestI].length > 60) {
          // Lead with the best article's opening (reranker-picked). Dropped the
          // 65MB distilbert-QA value-span step — owned, smaller, zero HF; a span
          // head folds into the reranker later if precise-value extraction needs it.
          const out = tidyAnswer(stripPhonetics(leads[bestI]));
          const images = await imagesForPlan(plan, text);
          void rememberAnswer(text, out, undefined);
          return { text: out, images, sources: [arts[bestI].source] };
        }
      }
    } catch { /* fall through to the general gather */ }
  }

  // LEARN(structured): the expert page already holds the answer — extract it.
  // VALIDATE it's really instructions, not a nav/link menu the extractor latched
  // onto ("fix python error" → a language sidebar). If it's junk, fall through to
  // the general gather+reader below instead of returning the menu.
  if (plan.gather === 'structured') {
    const rich = await richAnswer(query, plan.shape as AnswerType).catch(() => null);
    if (rich?.answer && (plan.shape === 'code' || looksInstructional(rich.answer))) {
      const images = plan.shape === 'code' ? [] : await findImages(text, 4).catch(() => []);
      const videos = await videosP;
      void rememberAnswer(text, rich.answer, rich.related);
      return { text: rich.answer, images, videos: videos.length ? videos : undefined, related: cleanRelated(rich.related), sources: rich.sources };
    }
    // no usable structured content → fall through to gathered synthesis
  }

  // LEARN(per-entity | facets): a comparison reads BOTH options AND head-to-head
  // sources broadly so the answer can weigh them; everything else decomposes into
  // facet queries. Either way we gather from MANY sources, not one snippet.
  let related: string[] | undefined;
  // GATHER — on the USER'S device first: Wikipedia (CORS-direct, origin=*) for
  // facts + Reddit (JSONP, no CORS) for real opinions/comparisons. No proxy, no
  // server of ours. Reddit comments carry their upvotes as `votes` for the reader.
  let evidence: Evidence[] = await gatherOnDevice(text, plan).catch(() => [] as Evidence[]);
  // Supplement with the broad web read ONLY if the on-device sources were thin —
  // keeps answers multi-source without leaning on the open-web reader gateway.
  if (evidence.length < 3) {
    const more = await (plan.gather === 'per-entity' && plan.topics.length >= 2
      ? gatherComparison(plan.topics, text)
      : gatherForQueries(facetQueries(text))
    ).catch(() => [] as Evidence[]);
    evidence = [...evidence, ...more];
  }
  // Drop navigational/marketing listings ("compare prices … and more") so both
  // the synthesis and any digest read real information, not a sales blurb.
  const informative = evidence.map((e) => ({ ...e, text: cleanPassage(e.text) })).filter((e) => e.text);
  if (informative.length) evidence = informative;
  // Last resort for GATHERING only: the single-source answer engine — used when
  // the broad read found nothing, never to override notes we already collected.
  if (!evidence.length) {
    const a = await answerQuestion(query).catch(() => null);
    if (a?.answer) {
      evidence = [{ topic: text, text: a.answer, source: a.sources?.[0] ?? { title: '', url: '', site: '' } }];
      related = a.related;
    }
  }

  // MULTIMODAL evidence: if we found a video, read its transcript/description and
  // fold it into the evidence — answering from what's actually SAID in the video,
  // cited. Best-effort: a failed read just means no video text, never a worse answer.
  const videos = await videosP;
  if (videos.length) {
    const vt = await videoTranscript(videos[0]).catch(() => null);
    if (vt && vt.text) evidence.push({ topic: text, text: vt.text, source: vt.source });
  }

  // RERANK: the trained cross-encoder reorders passages by ANSWER-BEARING
  // relevance — pushing the passage that actually answers the question to the top
  // (fixes the topical-but-not-answering selection the battery exposed). Graceful:
  // keeps the gathered order if the model isn't available. Keep the best ~10.
  try { evidence = (await rerank(text, evidence, (e) => e.text)).slice(0, 10); } catch { /* keep order */ }

  // PAGE-BODY READ (reranker-gated): the reranker put the right pages on top, but
  // some snippets are still thin. OPEN the top pages and read their real body — ANY
  // site (Stack Overflow, Amazon, a blog), Wikipedia via its API, the rest via
  // Common Crawl — so the reader extracts what the page actually says, not a
  // fragment. Most of the core hits were already read in gather; this catches the
  // ones a thin snippet under-ranked.
  try { evidence = await enrichTopPages(evidence, 5); } catch { /* keep snippets */ }

  // ANALYZE: read the gathered passages AGAINST the question and keep only what
  // bears on it — ranked, deduped, grouped per side for a comparison. This is the
  // "read all, then decide what matters" brain that turns a dump into a brief.
  const brief = buildBrief(text, evidence, {
    compare: plan.gather === 'per-entity' && plan.topics.length >= 2,
    topics: plan.topics,
  });
  const vids = videos.length ? videos : undefined;

  if (briefHasContent(brief)) {
    // CROSS-CHECK FIRST — the research move a one-pass model can't make: cluster
    // every gathered source against every other, and when ≥2 INDEPENDENT domains
    // AGREE on the lead claim, answer with the consensus-fused brief (cited,
    // complete, cross-checked, current). Gated on agreement≥2 so it only fires
    // where it's strictly better than a single extracted passage — never
    // regressing the single-source / structured-shape cases the reader handles.
    let consensus: Awaited<ReturnType<typeof consensusAnswer>> = null;
    try { consensus = await consensusAnswer(text, plan, evidence); } catch { /* model cold */ }
    if (consensus?.text && consensus.agreement >= 2) {
      const clean = tidyAnswer(consensus.text);
      const images = await imagesForPlan(plan, text);
      void rememberAnswer(text, clean, related);
      return { text: clean, images, videos: vids, related: cleanRelated(related), sources: brief.sources };
    }

    // ORGANIZE — the READER: the encoder points at the real sentences that
    // answer the question and assembles them by shape. It never paraphrases, so
    // names/numbers stay exact and the answer can't hallucinate (the generative
    // writer corrupted facts — see the gemini benchmark). Cold encoder → null.
    let read: Awaited<ReturnType<typeof readAnswer>> = null;
    try { read = await readAnswer(text, plan, evidence); } catch { /* encoder cold/unavailable */ }
    if (read?.text) {
      const clean = tidyAnswer(read.text);
      const images = await imagesForPlan(plan, text);
      void rememberAnswer(text, clean, related);
      return { text: clean, images, videos: vids, related: cleanRelated(related), sources: brief.sources };
    }
    // Fallback when the trained reader is cold: the relevance-gated synthesis over
    // the SAME gathered evidence — keeps only sentences that bear on the question
    // and drops nav/forum/SEO junk (much stronger than the raw digest, no model).
    try {
      const s = synthesizeText(text, evidence.map((e) => ({ text: e.text, source: e.source })));
      if (s && s.answer && s.answer.length > 80 && !isDumbAnswer(s.answer)) {
        const images = await imagesForPlan(plan, text);
        void rememberAnswer(text, s.answer, related);
        return { text: tidyAnswer(s.answer), images, videos: vids, related: cleanRelated(related), sources: s.sources.length ? s.sources : brief.sources };
      }
    } catch { /* fall through to the digest */ }

    // Fallback: the deterministic digest — still extractive and multi-source,
    // never a paraphrase. Used only when the encoder isn't available.
    const digest = briefToDigest(brief);
    if (digest) {
      const images = await imagesForPlan(plan, text);
      void rememberAnswer(text, digest, related);
      return { text: tidyAnswer(digest), images, videos: vids, related: cleanRelated(related), sources: brief.sources };
    }
  }

  // Truly nothing to answer with. We reached answerFlow because the request is a
  // QUESTION (decideRoute already ruled out a tool) — so NEVER dead-end it by
  // surfacing an unrelated tool ("Add Line Numbers" for a recipe). Be honest.
  return {
    text:
      plan.shape === 'recipe'
        ? "I couldn't pull up a reliable recipe just now — try again in a moment, or name the dish more specifically."
        : "I couldn't find a solid answer for that just now. Try rephrasing it, or attach a file and tell me what to do with it.",
  };
}

/** Translate a finished reply back into the user's language. We translate the
 *  prose and the related-topic chips, but never code blocks (universal) and we
 *  leave tool/app cards' own fields to the UI. Best-effort — keeps English on
 *  failure so the user always gets the content. */
async function localizeReply(reply: OioxoReply, lang: string): Promise<OioxoReply> {
  const out: OioxoReply = { ...reply };
  if (reply.text && !/```/.test(reply.text)) {
    const t = await fromEnglish(reply.text, lang).catch(() => null);
    if (t) out.text = t;
  }
  if (reply.related?.length) {
    const tr = await Promise.all(reply.related.map((r) => fromEnglish(r, lang).catch(() => null)));
    out.related = reply.related.map((r, i) => tr[i] || r);
  }
  return out;
}

/**
 * Produce one assistant reply. MULTILINGUAL SHELL: we understand and answer in
 * English — the engine's strong language, where the whole comprehension /
 * gather / synthesis pipeline lives — then translate the reply back to the
 * user's language. A Persian "which car should I buy" is understood as a
 * recommendation and answered in Persian, not parroted as an ad snippet. No-op
 * for English. Never throws.
 */
export interface RespondOpts {
  fileCat?: FileCat;
  /** Prior turns for multi-turn context (the move policy carries the topic). */
  history?: Turn[];
  /** Coarse locale for "in your area" framing (e.g. a city/country label). */
  locale?: string;
}

export async function respond(message: string, opts: RespondOpts = {}): Promise<OioxoReply> {
  const original = message.trim();
  if (!original) return { text: HELLO };
  // Detect + translate the prompt to English (null/no-op when already English).
  let lang: string | null = null;
  let text = original;
  try {
    const tr = await toEnglish(original);
    if (tr && tr.lang && tr.lang !== 'en') { text = tr.text; lang = tr.lang; }
  } catch {
    /* translation unavailable → answer in the original text */
  }
  // Honor a remembered language preference ("always reply in Spanish") when the
  // user wrote in English (their stored choice wins for the reply language).
  if (!lang) {
    const pref = recallLanguage();
    const code = pref ? LANG_CODE[pref.toLowerCase()] : null;
    if (code) lang = code;
  }
  const reply = await respondCore(text, opts);
  return lang ? localizeReply(reply, lang) : reply;
}

// Language NAME (as the user says it) → ISO code for the translate layer.
const LANG_CODE: Record<string, string> = {
  spanish: 'es', french: 'fr', german: 'de', italian: 'it', portuguese: 'pt', dutch: 'nl',
  arabic: 'ar', chinese: 'zh', mandarin: 'zh', japanese: 'ja', korean: 'ko', russian: 'ru',
  hindi: 'hi', persian: 'fa', farsi: 'fa', turkish: 'tr', polish: 'pl', swedish: 'sv',
  greek: 'el', hebrew: 'he', thai: 'th', vietnamese: 'vi', indonesian: 'id', english: 'en',
};

/**
 * SAFETY POLICY LAYER: we do not give medical or mental-health advice — these
 * need a qualified professional, and a data-analyzer engine must not pretend to
 * diagnose or treat. Returns a referral (stronger for crisis), or null to
 * proceed. Runs on the English text, so the referral localizes for any language.
 * This is a deliberate domain gate, not a per-question rule.
 */
export function safetyReferral(text: string): OioxoReply | null {
  const t = text.toLowerCase();
  // Crisis / self-harm → urgent, compassionate redirect first.
  if (/\b(suicid\w*|kill myself|end my life|self[- ]?harm|hurt myself|want to die)\b/.test(t)) {
    return {
      text:
        "I'm really sorry you're going through this — I can't help with this myself, but you deserve real support right now. Please reach out to a local crisis line or emergency services immediately, or talk to someone you trust. You are not alone.",
    };
  }
  // Personal medical or mental-health ADVICE (diagnosis / treatment / symptoms /
  // medication / "should I…", "is it normal that I…", mental-health states).
  const medical =
    /\b(symptoms?|diagnos\w+|treat(ment|ed|ing)?|cure|remed\w+|medication|medicine|dosage|dose|prescri\w+|antibiotics?|side effects?|is it normal (that|if|to)|should i (take|see a doctor|be worried|stop taking)|do i have|what'?s wrong with me|infection|tumou?r|rash|fever|pregnan\w+)\b/;
  const psych =
    /\b(depress\w+|anxiet\w+|anxious|panic attacks?|bipolar|ptsd|ocd|eating disorder|therap(y|ist)|mental health|i (feel|am|'m) (so |really |very )?(sad|hopeless|worthless|empty|depressed|anxious))\b/;
  if (medical.test(t) || psych.test(t)) {
    return {
      text:
        "I'm not able to give medical or mental-health advice — that really should come from a qualified doctor or licensed professional who can assess your situation properly. Please reach out to one. If it's urgent, contact your local emergency services.",
    };
  }
  return null;
}

/**
 * HARM REFUSAL — graceful, calibrated refusal of genuinely harmful/illegal requests
 * to DO or MAKE something (not informational/historical questions). Deterministic
 * floor: more reliable than teacher-learned (Gemini's own filters resist generating
 * harmful examples). Tightly scoped + excludes benign look-alikes ("bath bomb",
 * "kill a process", "glue gun", defensive security) so it never over-refuses.
 */
export function harmRefusal(text: string): OioxoReply | null {
  const t = text.toLowerCase();
  const wantsToMake = /\b(how (to|do i|can i)|help me|build|make|create|construct|give me instructions)\b/.test(t);
  // weapons / explosives
  if (wantsToMake
    && /\b(bomb|explosive|grenade|detonator|napalm|molotov|ied|silencer|untraceable (gun|firearm)|ghost gun|3d ?printed gun)\b/.test(t)
    && !/\bbath bomb|photo ?bomb|glue gun|nail gun|water gun|squirt gun|nerf\b/.test(t)) {
    return { text: "I can't help with making weapons or explosives — that's genuinely dangerous and I won't provide it. I'm happy to explain the science or history of a topic safely, though." };
  }
  // serious violence / harming a person's health (incl. "make someone sick", poison)
  if (/\b(how to|how do i|best way to|easiest way to|help me|ways to|how can i)\b/.test(t)
    && /\b(kill|murder|poison|hurt|harm|attack|assault|stab|strangle|get rid of|make (someone|somebody|him|her|them|people|my \w+) (sick|ill)|sicken|infect)\b/.test(t)
    && /\b(someone|somebody|a person|people|my (ex|wife|husband|boss|neighbou?rs?|teacher)|him|her|them)\b/.test(t)) {
    return { text: "I can't help with harming anyone. If you're overwhelmed or angry, talking to someone you trust or a professional really can help — and if anyone is in danger, please contact your local emergency services." };
  }
  // unauthorized access / spying on others (plural "neighbors" included)
  if (/\b(hack|break into|get into|spy on|track|stalk|steal|read)\b/.test(t)
    && /\b(someone|somebody|my (ex|partner|girlfriend|boyfriend|wife|husband|friend|neighbou?rs?|kid'?s)|his|her|their|a person'?s|other people'?s)\b/.test(t)
    && /\b(account|phone|password|instagram|facebook|snapchat|whatsapp|email|wi-?fi|wifi|camera|location|messages?|texts?|dms?)\b/.test(t)) {
    return { text: "I can't help access someone else's account or device — that's a privacy and legal line I won't cross. If it's YOUR own account you're locked out of, I can walk you through the official recovery steps." };
  }
  // breaking into / picking a lock on property that isn't yours
  if (/\b(pick|picking|bypass|break into|breaking into|hotwire|jimmy|force open)\b/.test(t)
    && /\b(lock|padlock|door|car|house|safe|window|vehicle)\b/.test(t)
    && /\b(is ?n'?t (mine|yours|theirs|hers|his)|not (mine|my own|yours)|someone else|neighbou?rs?|stranger'?s|that i do ?n'?t own)\b/.test(t)) {
    return { text: "I can't help break into something that isn't yours — that's a legal line I won't cross. If it's YOUR own lock, car, or home you're locked out of, the safe route is a licensed locksmith or the official recovery process." };
  }
  // illicit drug synthesis
  if (/\b(how to|make|synthesi[sz]e|cook|produce|manufacture)\b/.test(t)
    && /\b(meth|methamphetamine|cocaine|heroin|fentanyl|mdma|crack cocaine|crystal meth)\b/.test(t)) {
    return { text: "I can't help with making illegal drugs. If substance use is affecting you or someone you know, a doctor or a local helpline can offer real, confidential support." };
  }
  // malware to attack (not defend/learn/remove)
  if (/\b(write|create|make|build|code|develop)\b/.test(t)
    && /\b(virus|malware|ransomware|trojan|keylogger|spyware|botnet|worm)\b/.test(t)
    && !/\b(remove|protect|detect|scan|antivirus|defend|prevent|against|how (does|do)|what is)\b/.test(t)) {
    return { text: "I won't write malware. If you want to understand how it works to defend against it, or need help removing an infection, I'm glad to help with that." };
  }
  return null;
}

/**
 * SOFT advice disclaimer (the "dark layer"). The hard `safetyReferral` REFUSES
 * personal medical/crisis; this is for questions we DO answer but that touch
 * legal / medical / financial / safety matters — we add ONE brief, FRIENDLY
 * reminder that the answer is general info from public sources, may not fit the
 * reader's situation, and a qualified professional should be consulted. Done
 * DETERMINISTICALLY in the engine (not trusted to a 135M model) so it appears
 * every time → real liability cover. Returns the footer to append, or null.
 */
function adviceDisclaimer(query: string): string | null {
  const q = query.toLowerCase();
  let who: string | null = null;
  if (/\b(legal|law|lawsuit|sue[ds]?|my rights|contract|copyright|patent|trademark|tenant|landlord|eviction|divorce|custody|inheritance|will\b|visa|immigration|attorney|lawyer)\b/.test(q)) who = 'lawyer';
  else if (/\b(invest(ing|ment|ments)?|stocks?|crypto|bitcoin|tax(es|able)?|loan|mortgage|retirement|401k|ira\b|pension|debt|bankruptcy|insurance|portfolio|financial)\b/.test(q)) who = 'licensed financial advisor';
  else if (/\b(symptoms?|disease|medication|medicine|dosage|dose|supplements?|treatment|diagnos\w+|side effects?|disorder|illness|infection|prescri\w+)\b/.test(q)) who = 'doctor or pharmacist';
  else if (/\b(electrical|wiring|gas leak|carbon monoxide|toxic|poison\w*|hazard\w*|asbestos|structural)\b/.test(q)) who = 'qualified professional';
  if (!who) return null;
  return `\n\n_Just a heads-up — this is general information from public sources and may not fit your exact situation, so please check with a ${who} before acting on it._`;
}

/** Append the soft advice disclaimer to an answer reply when the topic warrants
 *  it. Only touches prose answers (not tool/app/code cards or empty replies). */
function withAdviceDisclaimer(reply: OioxoReply, query: string): OioxoReply {
  if (!reply.text || reply.tool || reply.app || reply.openCode) return reply;
  const disc = adviceDisclaimer(query);
  return disc ? { ...reply, text: reply.text + disc } : reply;
}

/** Extractive summary of the user's OWN supplied text — the deterministic floor so
 *  "summarize this: <text>" NEVER web-searches the user's words. Ranks sentences by
 *  content-word frequency (length-normalized), returns the top few in original order. */
function extractiveSummary(src: string, n = 3): string | null {
  const clean = (src || '').replace(/\s+/g, ' ').trim();
  const sents = (clean.match(/[^.!?]+[.!?]+/g) ?? []).map((s) => s.trim()).filter((s) => s.length > 20);
  if (sents.length === 0) return null;
  if (sents.length <= n) return clean;
  const STOP = new Set('the a an and or but of to in on at for with is are was were be been it this that as by from has have had its their his her they them we you i he she'.split(' '));
  const freq: Record<string, number> = {};
  for (const w of clean.toLowerCase().match(/[a-z]+/g) ?? []) if (w.length > 2 && !STOP.has(w)) freq[w] = (freq[w] || 0) + 1;
  const score = (s: string) => {
    const ws = s.toLowerCase().match(/[a-z]+/g) ?? [];
    return ws.reduce((a, w) => a + (freq[w] || 0), 0) / Math.sqrt(Math.max(1, ws.length));
  };
  return sents
    .map((s, i) => ({ s, i, sc: score(s) }))
    .sort((a, b) => b.sc - a.sc)
    .slice(0, n)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s)
    .join(' ');
}

/** A short, persona "talk" turn — warm and natural, no search. The writer gives
 *  it voice (writer8's persona training); funReply is the deterministic floor. */
async function talkReply(text: string, history?: Turn[]): Promise<OioxoReply> {
  // A self/identity/capability question or a social turn gets a correct, on-brand
  // answer — never the tiny writer guessing or a web search.
  const meta = metaSelfReply(text);
  if (meta) return meta;
  const social = socialReply(text);
  if (social) return social;
  const convo = (history ?? []).slice(-4).map((t) => `${t.role === 'user' ? 'User' : 'oioxo'}: ${t.text}`).join('\n');
  // True chitchat ("lol", "haha", "good morning") → the persona floor.
  const fun = funReply(text);
  if (fun) return { text: fun };
  try {
    const r = await converseReply(text, convo || undefined);
    const clean = tidyAnswer(r);
    if (clean && clean.length >= 8 && !/```/.test(clean)) return { text: clean };
  } catch {
    /* writer unavailable → deterministic floor */
  }
  // A SUBSTANTIVE message that landed in "chat" by mistake — a problem, a request,
  // an implicit question ("my computer won't turn on", "my cake sank", "best ramen")
  // — must be ANSWERED, not met with the greeting. The greeting is only for an
  // empty/bare opener. (Audit: this misfire returned "Hi, I'm oioxo" to real needs.)
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words >= 3 || /\?\s*$/.test(text)) {
    const a = await answerFlow(text, text, null).catch(() => null);
    if (a && a.text && a.text.length > 1) return a;
  }
  return { text: HELLO };
}

/** The English-internal engine: move → route → comprehend → answer. Never throws. */
async function respondCore(message: string, opts: RespondOpts = {}): Promise<OioxoReply> {
  const text = message.trim();
  if (!text) return { text: HELLO };
  const fileCat = opts.fileCat ?? null;
  try {
    // Symbol/emoji-only input ("?", "👍") → acknowledge, never web-search.
    if (!fileCat) {
      const nc = noContentReply(text);
      if (nc) return nc;
    }

    const safe = safetyReferral(text);
    if (safe) return safe;
    // Refuse genuinely harmful/illegal "how to do X" requests (calibrated, floor).
    const harm = harmRefusal(text);
    if (harm) return harm;

    // COMPUTE: arithmetic / percent / unit-rate → answer EXACTLY on-device, never
    // web-search it (the battery caught "15% of 240" → news headlines).
    const computed = tryCompute(text);
    if (computed) return { text: computed };

    // CHECK / VALIDATE inline — "is this a valid email?", "how strong is this
    // password?", "is this JSON valid?", "is this a real card number?" — done live,
    // instantly, on-device (heavier net checks route to the net-* tools).
    if (!fileCat) {
      const checked = tryCheck(text);
      if (checked) return { text: checked };
    }

    // TIME / DATE "now" → from the device clock, never a web search.
    if (!fileCat) {
      const timeR = timeNowReply(text);
      if (timeR) return timeR;
    }

    // CREATIVE: an original poem/story/song is the one thing extraction can't fake
    // — be honest and hand off rather than stitch one from search snippets.
    if (/\b(write|compose|create|draft|make me)\b[^.]{0,30}\b(poem|haiku|story|short story|song|lyrics|rap|limerick|joke)\b/i.test(text)) {
      return { text: "That's a creative write — I'm strong at finding real facts and running tools, but for an original poem or story I'd rather hand off to a dedicated writing model than stitch one together from search results." };
    }

    // ORIGINAL VISUAL ART we can't generate ("draw a cat", "paint a sunset") — be
    // honest, offer image SEARCH / editing instead (article/"me" required so "draw
    // conclusions" / "draw blood" don't match).
    if (!fileCat && (/\b(draw|paint|sketch|illustrate|doodle)\s+(me\s+|a\s+|an\s+|the\s+|some\s+)/i.test(text)
      || /\b(generate|create|make)\s+(me\s+)?(a|an)?\s*(image|picture|drawing|illustration|painting|artwork)\s+(of|about|showing)/i.test(text))) {
      return { text: "I can't create original drawings, but I can find real photos of it, or edit an image you upload — want me to search for some?" };
    }

    // BUILD a software project → the Coding workspace, not a web search.
    if (!fileCat && /\b(make|build|create|develop|code|write)\s+(me\s+)?(a|an|my)?\s*(website|web ?app|web ?page|web ?site|landing page|application|program|script|chrome extension|browser extension|mobile app|game)\b/i.test(text)) {
      return { text: "I can help you build that in the Coding workspace — open it (and grab a coder model sized to your device) and I'll scaffold and edit the project with you.", openCode: true };
    }

    // WEATHER with no place → ask for the location instead of web-searching "weather".
    if (!fileCat && /^\s*((?:what(?:'?s| is)|how(?:'?s| is))\s+(?:the\s+)?weather(?:\s+(?:today|tomorrow|now|like|right now|outside))?|weather\s+(?:today|tomorrow|now|forecast|right now)|is it (?:going to |gonna )?(?:rain|snow))\s*[?.!]*$/i.test(text)
      && !/\bin\s+[a-z]/i.test(text)) {
      return { text: 'Happy to check the weather — which city or place should I look up?' };
    }

    // TRANSFORM with no input ("translate this", "summarize this") → ask for the text
    // instead of web-searching the concept (the agentic "ask one thing" floor).
    const transformAsk = transformInputAsk(text, fileCat != null);
    if (transformAsk) return transformAsk;

    // SELF / SOCIAL turns ("what can you do", "is this free", "i need help", "yes",
    // "thanks", "you're useless") — answer from who we are / acknowledge warmly, BEFORE
    // the move policy can mistake them for a need to web-search ("i need help" → don't
    // "look up help in your area"). No file in hand.
    if (!fileCat) {
      const selfOrSocial = metaSelfReply(text) ?? socialReply(text);
      if (selfOrSocial) return selfOrSocial;
      // MEMORY: a lasting preference ("call me Alex", "always reply in Spanish",
      // "remember I'm vegetarian") → store on-device. If the turn is JUST the
      // preference, acknowledge; otherwise store silently and keep handling the request.
      const pref = capturePreference(text);
      if (pref) {
        remember(pref.kind, pref.value);
        if (text.split(/\s+/).length <= 14 && !/\?\s*$/.test(text)) {
          if (pref.kind === 'name') return { text: `Nice to meet you, ${pref.value}! I'll remember that.` };
          if (pref.kind === 'language') return { text: `Got it — I'll reply in ${pref.value} from now on.` };
          return { text: "Got it — I'll remember that, and keep it in mind going forward." };
        }
      }
      // Single-word definition → dictionary, not the open web.
      const def = await defineWord(text);
      if (def) return def;
      // Currency conversion → live FX rate, not a web search.
      const cur = await convertCurrency(text);
      if (cur) return cur;
    }

    // GEO: a maps question ("how far is X from Y", "where is X") — understand the
    // intent, geocode on our own server, COMPUTE on-device (haversine), state it
    // plainly + plot it. Falls through to normal search if a place can't resolve.
    if (!fileCat) {
      const gi = detectGeoIntent(text);
      if (gi) {
        const g = await answerGeo(gi).catch(() => null);
        if (g) return { text: g.text, map: { points: g.points, line: g.line } };
      }
    }

    // THE TRAINED CONDUCTOR (when deployed) plans the turn. MONOTONIC + fail-safe:
    // null when cold/not-hosted → the deterministic floor below runs unchanged
    // (reliability contract). Today we apply its capture + a self-contained reply;
    // full plan-driven chain execution + diagnostic loops are tuned against the live
    // v2 model. Runs AFTER the instant fast-paths (speed: floor-first), before routing.
    const plan = await planTurn(text, opts.history ?? [], fileCat != null, fileCat).catch(() => null);
    if (plan) {
      if (plan.remember) remember('fact', plan.remember);
      if (plan.turnRole === 'chitchat' && plan.reply.trim()) return { text: plan.reply };
    }

    // CONVERSATION MOVE (no file in hand — a file means a tool op, not chat).
    // Search is a move INSIDE the conversation: a stated need → acknowledge and
    // look it up (localized); a personal/emotional line → just talk.
    if (!fileCat) {
      const mv = decideMove(text, { history: opts.history, locale: opts.locale });
      if (mv.move === 'talk') return await talkReply(text, opts.history);
      if (mv.move === 'offer' && mv.topic) {
        const reply = await answerFlow(mv.topic, mv.topic, null);
        // Prepend an acknowledging, localized preface so it reads as a helpful
        // offer being fulfilled, not a cold result dump.
        const preface = offerPreface(mv.topic, opts.locale);
        reply.text = reply.text ? `${preface}\n\n${reply.text}` : preface;
        return withAdviceDisclaimer(reply, mv.topic);
      }
    }

    // MULTI-TURN: keep a 2–3 question thread on-topic. Resolve a follow-up
    // ("where was he born?", "what about its population?") into a standalone query
    // using the running topic, so the answer path doesn't lose the subject. Guarded
    // (rewriteFollowup only fires on pronoun/bare continuations; self-contained
    // questions pass through unchanged). The ORIGINAL text is kept for persona/talk;
    // the resolved query drives routing + answering.
    const qText = (!fileCat && rewriteFollowup(text, lastTopicOf(opts.history))) || text;

    // Pure deterministic route, then let the semantic encoder RECOVER a tool the
    // regex/lexical floor missed on a paraphrase (monotonic — see refineRouteWithEncoder).
    const route = await refineRouteWithEncoder(qText, fileCat, decideRoute(qText, fileCat));

    if (route.kind === 'chat') return await talkReply(text, opts.history);

    if (route.kind === 'game') {
      if (route.gameMenu || !route.gameKind) return { text: gameMenu() };
      return { text: gameIntro(route.gameKind), game: { kind: route.gameKind } };
    }

    if (route.kind === 'code') {
      return {
        text:
          'This looks like a coding task. I work on code in the **Coding workspace** — open it (and download a coder model sized to your device), then I can review, refactor, and edit your files there.',
        openCode: true,
      };
    }

    if (route.kind === 'image' && route.subject) {
      const images = await findImages(route.subject, 4).catch(() => []);
      if (images.length) {
        // If we resolved the subject to a real entity (the lead image is a
        // Wikimedia page image), name it back — "michel jordan" → confirm
        // "Michael Jordan" so the user sees we understood WHO they meant.
        const lead = images[0];
        const resolved = lead.source === 'Wikimedia' && lead.title.trim();
        const text = resolved && norm(lead.title) !== norm(route.subject) ? `Here's **${lead.title}**:` : '';
        return { text, images };
      }
      // no images → fall through to an answer
    }

    if (route.kind === 'summary' || route.kind === 'article') {
      const src = route.src ?? text;
      try {
        const out = route.kind === 'article' ? await writeArticle(src) : await summarize(src);
        if (out) return { text: out };
      } catch {
        /* model unavailable → extractive floor below */
      }
      // FLOOR: summarize the user's OWN text extractively — never web-search their words.
      const ex = extractiveSummary(src);
      if (ex) return { text: ex };
    }

    if (route.kind === 'app' && route.app) {
      return { text: `I can open **${route.app.name}** for that — ${route.app.blurb}`, app: route.app };
    }

    if (route.kind === 'tool' && route.toolId) {
      const tool = getTool(route.toolId);
      if (tool) return { text: `I can do that with **${tool.name}** — ${tool.blurb}.`, tool };
    }

    // SEMANTIC APP fallback — the regex `matchApp` only catches set phrasings, so a
    // paraphrased app request ("let me show a friend what's on my screen" → Screen
    // Share, "I want to talk to someone face to face" → Video Call) falls through to
    // search. The encoder matches it by MEANING against the flagship apps. Gated:
    // only when nothing else routed (kind 'answer') and the match is confident, so
    // it can only ADD app launches, never hijack a real question. (Browser-only;
    // returns null when embeddings are cold → graceful.)
    if (!fileCat && route.kind === 'answer') {
      const app = await matchAppSemantic(qText).catch(() => null);
      if (app) return { text: `I can open **${app.name}** for that — ${app.blurb}`, app };
    }

    // THE NO-DUMB GATE (system invariant): a search answer ships only if it isn't
    // visibly dumb; otherwise fall back to an honest clarify rather than embarrass.
    // NEVER-BLOCK (speed): a search answer must return fast or yield honestly — a
    // frozen 30s+ reply is worse than an honest one. Cap the whole answer flow; on
    // timeout, the graceful fallback. Most good answers land in 1–4s; this only
    // bites a stalled gather (esp. on a weak device / slow network).
    const TIMED_OUT = Symbol('timeout');
    const raced = await Promise.race([
      answerFlow(qText, route.query || qText, fileCat),
      new Promise<typeof TIMED_OUT>((r) => setTimeout(() => r(TIMED_OUT), 15000)),
    ]);
    if (raced === TIMED_OUT) return gracefulFallback(comprehendAnswer(qText).concept);
    const ans = raced;
    const isProse = !!ans.text && !ans.tool && !ans.app && !ans.openCode && !ans.game;
    if (isProse && isDumbAnswer(ans.text)) {
      return gracefulFallback(comprehendAnswer(qText).concept);
    }
    // Honor an output-format directive ("briefly", "in 3 sentences", "in bullets").
    const fmt = detectFormat(qText);
    if (isProse && fmt.form) ans.text = renderFormat(ans.text, fmt);
    return withAdviceDisclaimer(ans, qText);
  } catch {
    return { text: 'Something went wrong handling that — please try again.' };
  }
}
