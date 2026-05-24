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
import { candidatesFor, fallbackDecision } from './agent';
import { answerQuestion, cleanQuery, type SearchSource } from './search';
import { matchApp } from './apps';
import { summarize, writeArticle, answerFromNotes, compareFromNotes, converseReply } from '../oioxo/writer';
import { facetQueries, gatherForQueries, gatherComparison } from './research';
import { analyzeQuestion, isGrounded, type Evidence } from './reason';
import { buildBrief, briefToNotes, briefToDigest, briefHasContent } from './brief';
import { decideMove, offerPreface, type Turn } from './converse';
import { findVideos, videoTranscript, wantsVideo, type VideoHit } from './video';
import { detectAnswerType, type AnswerType } from './extract';
import { richAnswer } from './web-read';
import { toEnglish, fromEnglish } from './translate';
import { getCached, putCached } from './search-cache';
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
  /** Visual row — for image requests AND as related imagery under answers. */
  images?: ImageHit[];
  /** Relevant videos to embed (how-to / explain) — we read their words, cite, link. */
  videos?: VideoHit[];
  /** Sources are kept but NOT shown by default (only if the user asks). */
  sources?: SearchSource[];
  /** Related follow-up topics. */
  related?: string[];
}

const HELLO =
  "Hi — I'm oioxo. I can convert and edit files, create things, and answer questions, all on your device. What do you need?";

export type RouteKind = 'chat' | 'code' | 'image' | 'summary' | 'article' | 'app' | 'tool' | 'answer';

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

  if (isCodeTask(text)) return { kind: 'code' };

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
 * Guard the WEAK tool route (a tool chosen by keyword retrieval, not an exact
 * name match). Without an attached file, only trust it when the query actually
 * mentions part of the tool's NAME — otherwise an incidental keyword hijacks a
 * plain phrase or question ("salt and pepper" → the password-*salt* tool,
 * garbled text → "Add Line Numbers"). Vocabulary-free and general.
 */
function fallbackToolOk(text: string, toolId: string, hasFile: boolean): boolean {
  if (hasFile) return true; // a file + a plausible tool is a real edit request
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

/** Images for an answer — show ALL parts of the subject. A comparison fetches a
 *  couple of images of EACH option and interleaves them; otherwise the subject. */
async function imagesForPlan(plan: AnswerPlan, text: string): Promise<ImageHit[]> {
  if (plan.shape === 'code') return [];
  if (plan.gather === 'per-entity' && plan.topics.length >= 2) {
    const lists = await Promise.all(plan.topics.slice(0, 3).map((t) => findImages(t, 2).catch(() => [] as ImageHit[])));
    return interleaveImages(lists, 4);
  }
  return findImages(imageSubjectOf(plan.concept, text), 4).catch(() => []);
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

  // LEARN(structured): the expert page already holds the answer — extract it.
  if (plan.gather === 'structured') {
    const rich = await richAnswer(query, plan.shape as AnswerType).catch(() => null);
    if (rich?.answer) {
      const images = plan.shape === 'code' ? [] : await findImages(text, 4).catch(() => []);
      const videos = await videosP;
      void rememberAnswer(text, rich.answer, rich.related);
      return { text: rich.answer, images, videos: videos.length ? videos : undefined, related: cleanRelated(rich.related), sources: rich.sources };
    }
    // no structured content found → fall through to gathered synthesis
  }

  // LEARN(per-entity | facets): a comparison reads BOTH options AND head-to-head
  // sources broadly so the answer can weigh them; everything else decomposes into
  // facet queries. Either way we gather from MANY sources, not one snippet.
  let related: string[] | undefined;
  let evidence: Evidence[] = await (plan.gather === 'per-entity' && plan.topics.length >= 2
    ? gatherComparison(plan.topics, text)
    : gatherForQueries(facetQueries(text))
  ).catch(() => [] as Evidence[]);
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

  // ANALYZE: read the gathered passages AGAINST the question and keep only what
  // bears on it — ranked, deduped, grouped per side for a comparison. This is the
  // "read all, then decide what matters" brain that turns a dump into a brief.
  const brief = buildBrief(text, evidence, {
    compare: plan.gather === 'per-entity' && plan.topics.length >= 2,
    topics: plan.topics,
  });
  const vids = videos.length ? videos : undefined;

  if (briefHasContent(brief)) {
    const notes = briefToNotes(brief);
    // ORGANIZE: the model weaves the brief — recommend (weigh) vs. answer (rewrite).
    let answer = '';
    try {
      answer = plan.organize === 'recommend' ? await compareFromNotes(text, notes) : await answerFromNotes(text, notes);
    } catch {
      /* model unavailable */
    }
    // A recommendation weaves several sources — guard against drift/invention.
    if (answer && plan.organize === 'recommend' && !isGrounded(answer, evidence, text)) answer = '';
    if (answer) {
      const clean = tidyAnswer(answer);
      const images = await imagesForPlan(plan, text);
      void rememberAnswer(text, clean, related);
      return { text: clean, images, videos: vids, related: cleanRelated(related), sources: brief.sources };
    }
    // The tiny writer couldn't compose — but we DID collect, read, and analyze
    // real sources. Present the BRIEF as a clean, organized answer (a comparison
    // grouped by side), NEVER a single parroted listing. Honest, multi-source.
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
  const reply = await respondCore(text, opts);
  return lang ? localizeReply(reply, lang) : reply;
}

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

/** A short, persona "talk" turn — warm and natural, no search. The writer gives
 *  it voice (writer8's persona training); funReply is the deterministic floor. */
async function talkReply(text: string, history?: Turn[]): Promise<OioxoReply> {
  const convo = (history ?? []).slice(-4).map((t) => `${t.role === 'user' ? 'User' : 'oioxo'}: ${t.text}`).join('\n');
  try {
    const r = await converseReply(text, convo || undefined);
    const clean = tidyAnswer(r);
    if (clean && clean.length >= 8 && !/```/.test(clean)) return { text: clean };
  } catch {
    /* writer unavailable → deterministic floor */
  }
  return { text: funReply(text) ?? HELLO };
}

/** The English-internal engine: move → route → comprehend → answer. Never throws. */
async function respondCore(message: string, opts: RespondOpts = {}): Promise<OioxoReply> {
  const text = message.trim();
  if (!text) return { text: HELLO };
  const fileCat = opts.fileCat ?? null;
  try {
    const safe = safetyReferral(text);
    if (safe) return safe;

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
        return reply;
      }
    }

    const route = decideRoute(text, fileCat);

    if (route.kind === 'chat') return await talkReply(text, opts.history);

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
      try {
        const out = route.kind === 'article' ? await writeArticle(route.src ?? text) : await summarize(route.src ?? text);
        if (out) return { text: out };
      } catch {
        /* fall through to an answer */
      }
    }

    if (route.kind === 'app' && route.app) {
      return { text: `I can open **${route.app.name}** for that — ${route.app.blurb}`, app: route.app };
    }

    if (route.kind === 'tool' && route.toolId) {
      const tool = getTool(route.toolId);
      if (tool) return { text: `I can do that with **${tool.name}** — ${tool.blurb}.`, tool };
    }

    return await answerFlow(text, route.query || text, fileCat);
  } catch {
    return { text: 'Something went wrong handling that — please try again.' };
  }
}
