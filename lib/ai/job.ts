/**
 * Xonvert AI — job planner (the brain's COMPOSE-a-project layer).
 *
 * Above single-tool routing and the capability graph sits a class of requests
 * that frontier LLMs cripple to save resources: "write a detailed article about
 * X, with images, as a PDF, and read it aloud." We're on-device, so we spend
 * freely — gather lots of data, have the tiny model ORGANISE and WRITE at length
 * (section by section, since it can't one-shot a long essay), then illustrate /
 * voice / package the result with the tools we already have.
 *
 * The planner turns a goal into an ordered pipeline of STEP TYPES:
 *   gather  — deep multi-source research (facts to write from)
 *   write   — the model organises + writes; long-form = outline then sections
 *   illustrate — fetch images to embed
 *   voice   — text-to-speech to audio
 *   package — assemble into a deliverable file (PDF; DOCX has no producer yet)
 *   transform — a capability-graph media chain (handled by brain.ts)
 *   answer / talk — the short-form leaves
 *
 * Each step is small and bounded — exactly what a 0.6B handles. This module is
 * pure and Node-testable; it PLANS. The executor (AiApp) runs the steps.
 */

import type { Goal } from './goal';

export type WriteForm =
  | 'article' | 'essay' | 'report' | 'blog' | 'story' | 'poem' | 'song'
  | 'letter' | 'email' | 'cover-letter' | 'speech' | 'script' | 'guide'
  | 'review' | 'list' | 'outline' | 'summary' | 'explainer';

export type JobStep =
  | { type: 'gather'; query: string; depth: 'quick' | 'deep' }
  | { type: 'write'; form: WriteForm; topic: string; length: 'short' | 'medium' | 'long'; lang: string }
  | { type: 'illustrate'; subject: string; count: number }
  | { type: 'voice'; lang: string }
  | { type: 'package'; format: 'pdf' | 'docx'; supported: boolean }
  | { type: 'answer'; query: string; lang: string }
  | { type: 'talk'; lang: string };

export interface JobPlan {
  steps: JobStep[];
  /** Plain-language description of what will be delivered, for narration. */
  summary: string;
}

// --- detection (deterministic) ----------------------------------------------

// Maps a phrase to a write form. Longer/most-specific first.
const FORM_PATTERNS: { re: RegExp; form: WriteForm }[] = [
  { re: /\bcover[\s-]?letter\b/i, form: 'cover-letter' },
  { re: /\b(blog ?post|blog)\b/i, form: 'blog' },
  { re: /\b(article|piece)\b/i, form: 'article' },
  { re: /\bessays?\b/i, form: 'essay' },
  { re: /\b(report|white ?paper|case study)\b/i, form: 'report' },
  { re: /\b(short ?story|story|tale|fiction)\b/i, form: 'story' },
  { re: /\bpoem|poetry|haiku|sonnet\b/i, form: 'poem' },
  { re: /\b(song|lyrics)\b/i, form: 'song' },
  { re: /\b(cover letter)\b/i, form: 'cover-letter' },
  { re: /\b(email|e-mail)\b/i, form: 'email' },
  { re: /\bletter\b/i, form: 'letter' },
  { re: /\b(speech|talk|address|toast)\b/i, form: 'speech' },
  { re: /\b(script|screenplay|dialogue)\b/i, form: 'script' },
  { re: /\b(guide|how[\s-]?to|tutorial|walkthrough|manual)\b/i, form: 'guide' },
  { re: /\breview\b/i, form: 'review' },
  { re: /\b(outline|bullet points?)\b/i, form: 'outline' },
  { re: /\b(summary|summari[sz]e|tl;?dr|recap)\b/i, form: 'summary' },
];

// Verbs that signal "produce written content" (vs ask a question).
const WRITE_VERB = /\b(write|compose|draft|create|make|generate|produce|put together|prepare|pen)\b/i;

// Modifiers — extra deliverables stacked onto a write job.
const WANT_IMAGES = /\b(with|include|add|plus|and|featuring)\b[^.?!]*\b(images?|pictures?|photos?|illustrations?|visuals?|graphics?|figures?)\b|\billustrat(e|ed|ions?)\b/i;
const WANT_VOICE = /\b(read (it|this)? ?(aloud|out|to me)|text[\s-]?to[\s-]?speech|\btts\b|voice[\s-]?over|narrat(e|ed|ion)|audio (version|book)|listen to|as (an? )?(mp3|audio)|spoken)\b/i;
const WANT_PDF = /\b(as |to |in |a |an )?(pdf)\b/i;
const WANT_DOCX = /\b(docx|word doc(ument)?|microsoft word|\.doc)\b/i;

const LONG_CUE = /\b(detailed|in[\s-]?depth|comprehensive|thorough|long|full|extensive|elaborate|deep[\s-]?dive|complete|exhaustive|1000|2000|words?)\b/i;
const SHORT_CUE = /\b(brief|short|quick|concise|one[\s-]?liner|few (lines|sentences)|tl;?dr|snappy)\b/i;

// Forms that are inherently factual → need a research pass before writing.
const FACTUAL_FORMS = new Set<WriteForm>(['article', 'essay', 'report', 'blog', 'guide', 'review', 'explainer', 'summary']);
// Forms that are short by nature regardless of cues.
const SHORT_FORMS = new Set<WriteForm>(['email', 'letter', 'cover-letter', 'poem', 'song', 'outline', 'list']);

export function detectWriteForm(text: string): WriteForm | null {
  for (const p of FORM_PATTERNS) if (p.re.test(text)) return p.form;
  return null;
}

// Phrases that mark the END of the topic (a stacked deliverable begins here).
const TOPIC_CUTS: RegExp[] = [
  /\bwith\s+[^.?!]*\b(images?|pictures?|photos?|illustrations?|visuals?|graphics?|figures?)\b/i,
  /\billustrat(e|ed|ions?)\b/i,
  /\b(and\s+)?(read|narrat|voice[\s-]?over|listen|text[\s-]?to[\s-]?speech|tts|spoken|as (an? )?(mp3|audio))/i,
  /\b(and\s+)?(save|export|deliver(ed)?)?\s*\b(as|to|in)\s+(an?\s+|the\s+)?(pdf|docx|word|document)\b/i,
  // Trailing imperative tail: "… and then make it a pdf", "… make pdf it" — a
  // leftover command that must not become part of the topic/title.
  /\b(and\s+)?(then\s+)?(make|turn|convert|save|export|create|render|put|generate)\b[^.?!]*\b(pdf|docx?|word|document|file|image|audio|mp3|video|it)\b\s*[.?!]*\s*$/i,
];

/**
 * Strip form/modifier phrasing to leave a clean topic ("how soccer affects
 * society") — this becomes the research query, so it must be tidy.
 */
export function cleanTopic(text: string): string {
  // Prefer the explicit topic phrase introduced by a marker ("about X", "on X").
  const marker = text.match(/\b(?:about|on|regarding|concerning|covering|explaining|describing)\s+(.+)$/i);
  let topic = marker ? marker[1] : text;

  if (!marker) {
    // No marker → subtract the request scaffolding instead.
    topic = topic.replace(/^\s*(please\s+)?(can you|could you|i (?:want|need|would like)(?:\s+you)?\s+to)\s+/i, '');
    topic = topic.replace(WRITE_VERB, ' ');
    for (const p of FORM_PATTERNS) topic = topic.replace(p.re, ' ');
  }

  // Cut at the first stacked-deliverable clause (with images / as pdf / read aloud).
  let cut = topic.length;
  for (const re of TOPIC_CUTS) { const m = topic.match(re); if (m && m.index != null && m.index < cut) cut = m.index; }
  topic = topic.slice(0, cut);

  // Remove length cues, then peel leading filler/prepositions until none remain.
  topic = topic.replace(LONG_CUE, ' ').replace(SHORT_CUE, ' ');
  let prev = '';
  while (prev !== topic) {
    prev = topic;
    topic = topic.replace(/^\s*(a|an|the|some|me|to|of|for|on|about|in)\s+/i, '');
  }
  topic = topic
    .replace(/[\s,]+(?:and|with|as|to|in|for)?\s*$/i, '') // dangling tail conjunctions
    .replace(/\s+/g, ' ')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim();

  return topic || text.trim();
}

function lengthFor(form: WriteForm, text: string): 'short' | 'medium' | 'long' {
  if (SHORT_CUE.test(text)) return 'short';
  if (LONG_CUE.test(text)) return 'long';
  if (SHORT_FORMS.has(form)) return 'short';
  if (form === 'article' || form === 'essay' || form === 'report') return 'long';
  return 'medium';
}

/**
 * Plan a composition job, or return null if this isn't one (let brain.ts handle
 * it as a transform / single tool / answer / chat). A job exists when the user
 * wants WRITTEN CONTENT produced — a named form, or a write-verb + a topic.
 */
export function planJob(goal: Goal, message: string): JobPlan | null {
  const form = detectWriteForm(message);
  // A job needs a WRITE intent: a write/compose verb is required so a stray form
  // NOUN can't trigger it — "slugify the title my blog post" mentions "blog" but
  // is a text op, not a request to WRITE a blog. Either "<write-verb> … <form>"
  // or "<write-verb> … about <topic>".
  const hasWriteVerb = WRITE_VERB.test(message);
  const isWrite =
    (form != null && hasWriteVerb) ||
    (hasWriteVerb && goal.intent !== 'transform' && /\b(about|on|regarding|covering|explaining|that)\b/i.test(message));
  if (!isWrite) return null;
  // "summarize THIS" with a file is a tool op, not a research-and-write job.
  if (form === 'summary' && (goal.from || /\bthis\b/i.test(message))) return null;

  const resolvedForm: WriteForm = form ?? 'article';
  const topic = cleanTopic(message);
  const length = lengthFor(resolvedForm, message);
  const lang = goal.lang;

  const steps: JobStep[] = [];

  // 1) Research first for factual forms (skip for purely creative ones).
  if (FACTUAL_FORMS.has(resolvedForm)) {
    steps.push({ type: 'gather', query: topic, depth: length === 'long' ? 'deep' : 'quick' });
  }

  // 2) The core write (long-form is outlined + written in sections downstream).
  steps.push({ type: 'write', form: resolvedForm, topic, length, lang });

  // 3) Stacked deliverables, in production order.
  if (WANT_IMAGES.test(message)) steps.push({ type: 'illustrate', subject: topic, count: length === 'long' ? 3 : 1 });
  const wantDocx = WANT_DOCX.test(message);
  const wantPdf = WANT_PDF.test(message) && !wantDocx;
  if (wantDocx) steps.push({ type: 'package', format: 'docx', supported: false });
  else if (wantPdf) steps.push({ type: 'package', format: 'pdf', supported: true });
  if (WANT_VOICE.test(message)) steps.push({ type: 'voice', lang });

  return { steps, summary: describe(steps, resolvedForm, topic) };
}

function describe(steps: JobStep[], form: WriteForm, topic: string): string {
  const parts: string[] = [];
  if (steps.some((s) => s.type === 'gather')) parts.push('research it');
  parts.push(`write ${aOrAn(form)} ${form}${topic ? ` on ${topic}` : ''}`);
  if (steps.some((s) => s.type === 'illustrate')) parts.push('add images');
  const pkg = steps.find((s) => s.type === 'package') as Extract<JobStep, { type: 'package' }> | undefined;
  if (pkg) parts.push(pkg.supported ? `export to ${pkg.format.toUpperCase()}` : `export to ${pkg.format.toUpperCase()} (not available — I'll deliver a PDF instead)`);
  if (steps.some((s) => s.type === 'voice')) parts.push('read it aloud');
  return `I'll ${parts.join(', then ')}.`;
}

function aOrAn(w: string): string { return /^[aeiou]/i.test(w) ? 'an' : 'a'; }
