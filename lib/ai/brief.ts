/**
 * oioxo AI — the ANALYZE stage (the brain between search and writing).
 *
 * Search COLLECTS many passages; this READS them against the question and keeps
 * only what bears on it — ranked, deduped, grouped — producing a tight `Brief`.
 * Before this stage existed, the writer was handed a raw dump of snippets (and
 * drowned in it) or, worse, a single SERP listing got parroted. The Brief is the
 * "read all, then decide what matters" step every good answer needs.
 *
 * Deterministic and Node-testable. The trained reranker/claim-extractor (Track B)
 * slots in behind `scoreSentence` later without changing this module's interface.
 * See ANSWER_BRAIN.md §7.1.
 */
import { trimExtract, type SearchSource } from './search';
import type { Evidence } from './reason';

/** One relevant claim, kept with its citation and which topic/side it serves. */
export interface BriefPoint {
  text: string;
  source: SearchSource;
  topic: string;
  score: number;
}

export interface Brief {
  question: string;
  /** Ranked, deduped, relevant claims across all sources. */
  points: BriefPoint[];
  /** For a comparison: claims grouped under each entity (in topic order). */
  byTopic?: { topic: string; points: BriefPoint[] }[];
  /** Deduped citations. */
  sources: SearchSource[];
}

export interface BriefOpts {
  /** A decision between options — group the brief per entity. */
  compare?: boolean;
  /** The entities to weigh (for compare). */
  topics?: string[];
  /** Max claims to keep overall. */
  cap?: number;
}

const STOP = new Set([
  'what', 'which', 'where', 'when', 'whom', 'whose', 'about', 'that', 'this', 'with', 'from', 'into',
  'than', 'then', 'better', 'best', 'worse', 'worst', 'versus', 'compared', 'between', 'their', 'there',
  'they', 'does', 'did', 'is', 'are', 'the', 'and', 'or', 'of', 'to', 'a', 'an', 'how', 'why', 'who',
  'you', 'your', 'i', 'me', 'my', 'we', 'do', 'in', 'on', 'for', 'it', 'its', 'be', 'can', 'should',
  'would', 'could', 'will', 'have', 'has', 'opinion', 'think', 'good', 'bad',
]);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Distinctive content words of a string (drop stopwords + very short tokens). */
function contentTerms(s: string): string[] {
  return Array.from(new Set(norm(s).split(' ').filter((w) => w.length >= 3 && !STOP.has(w))));
}

/** Split a passage into clean sentences (markdown/refs already stripped upstream). */
function sentences(text: string): string[] {
  return (text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [text])
    .map((s) => s.trim())
    .filter((s) => s.length >= 24);
}

/**
 * How much does this sentence bear on the question? Relevance-first (share of the
 * question's content terms), with light, GENERAL bonuses for answer-bearing
 * signal — a real number/date, a proper noun, or a comparative/evaluative word
 * (which is what a compare/opinion answer is actually made of). No topic
 * vocabulary, so it generalizes to any subject. This is the swap-point for the
 * trained reranker later.
 */
function scoreSentence(sentence: string, qTerms: string[]): number {
  if (!qTerms.length) return 0.5;
  const hay = new Set(norm(sentence).split(' ').filter(Boolean));
  const overlap = qTerms.filter((t) => hay.has(t)).length / qTerms.length;
  let bonus = 0;
  if (/\b\d/.test(sentence)) bonus += 0.08; // a figure/date — concrete
  if (/(?<=\s)[A-Z][a-z]{2,}/.test(sentence)) bonus += 0.04; // a proper noun
  if (/\b(more|less|better|stronger|faster|cheaper|larger|smaller|higher|lower|unlike|whereas|while|however|because|due to|known for|reliable|popular|recommended)\b/i.test(sentence)) bonus += 0.06;
  // Penalise a sentence that is mostly a question or a call-to-action (listings).
  if (/\?\s*$/.test(sentence)) bonus -= 0.1;
  const lenOk = sentence.length <= 320 ? 0 : -0.05;
  return overlap + bonus + lenOk;
}

/** Near-duplicate guard: same opening ~6 content words → already have it. */
function dupKey(s: string): string {
  return contentTerms(s).slice(0, 6).sort().join(' ');
}

/**
 * Build the Brief: rank every sentence of every passage by relevance to the
 * question, drop dupes and weak lines, and keep the strongest — diversity-capped
 * so no single source dominates. For a comparison, also group the kept claims
 * under whichever entity they mention.
 */
export function buildBrief(question: string, evidence: Evidence[], opts: BriefOpts = {}): Brief {
  const cap = opts.cap ?? 8;
  const qTerms = contentTerms(question);
  const scored: BriefPoint[] = [];
  const seen = new Set<string>();

  for (const e of evidence) {
    for (const s of sentences(e.text)) {
      const key = dupKey(s);
      if (!key || seen.has(key)) continue;
      const score = scoreSentence(s, qTerms);
      if (score <= 0.12) continue; // essentially off-topic
      seen.add(key);
      scored.push({ text: s, source: e.source, topic: e.topic, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  // Diversity cap: at most 3 claims from any one site, so the brief weighs
  // several independent sources rather than leaning on one.
  const perSite = new Map<string, number>();
  const points: BriefPoint[] = [];
  for (const p of scored) {
    const site = p.source.site || 'web';
    if ((perSite.get(site) ?? 0) >= 3) continue;
    perSite.set(site, (perSite.get(site) ?? 0) + 1);
    points.push(p);
    if (points.length >= cap) break;
  }

  // Citations, deduped, strongest first.
  const srcSeen = new Set<string>();
  const sources: SearchSource[] = [];
  for (const p of points) {
    if (p.source.url && !srcSeen.has(p.source.url)) { srcSeen.add(p.source.url); sources.push(p.source); }
  }

  const brief: Brief = { question, points, sources: sources.slice(0, 4) };

  if (opts.compare && opts.topics && opts.topics.length >= 2) {
    brief.byTopic = opts.topics.slice(0, 3).map((topic) => {
      const k = norm(topic);
      const mine = points.filter(
        (p) => norm(p.topic).includes(k) || k.includes(norm(p.topic)) || norm(p.text).includes(k),
      );
      return { topic, points: mine };
    });
  }
  return brief;
}

/** Render the Brief as labelled notes for the writer prompt — a comparison keeps
 *  the two sides separated so the model can weigh them. */
export function briefToNotes(brief: Brief, maxChars = 2400): string {
  let out: string;
  if (brief.byTopic?.length) {
    out = brief.byTopic
      .map((g) => `${g.topic}:\n` + (g.points.length ? g.points.map((p) => `- ${p.text}`).join('\n') : '- (little found)'))
      .join('\n\n');
  } else {
    out = brief.points.map((p) => `- ${p.text}`).join('\n');
  }
  return out.slice(0, maxChars);
}

/** Title-case a short entity label ("toyota camry" → "Toyota Camry"). */
function titleCase(s: string): string {
  return s.replace(/\b([a-z])([a-z']*)/gi, (m, a: string, b: string) =>
    m === m.toUpperCase() ? m : a.toUpperCase() + b.toLowerCase());
}

/**
 * The honest, no-model fallback: present the Brief itself as a clean,
 * multi-source answer — a comparison grouped by side, else the top claims woven
 * into a short paragraph. NEVER a single parroted listing. Used when the writer
 * can't compose or isn't grounded.
 */
export function briefToDigest(brief: Brief): string {
  if (brief.byTopic?.length) {
    const sides = brief.byTopic
      .map((g) => {
        const body = trimExtract(g.points.map((p) => p.text).join(' '), 280, 2);
        return body ? `**${titleCase(g.topic)}** — ${body}` : '';
      })
      .filter(Boolean);
    if (sides.length >= 2) return sides.join('\n\n');
  }
  return trimExtract(brief.points.map((p) => p.text).join(' '), 600, 4);
}

/** Has the Brief got enough signal to be worth writing from? */
export function briefHasContent(brief: Brief): boolean {
  return brief.points.length > 0;
}
