/**
 * Xonvert AI — unified tool index.
 *
 * Turns the 323-entry tool registry into a single searchable corpus the AI can
 * route against. Each tool becomes one `IndexDoc` with weighted, tokenised
 * text (name + keywords + blurb + category) plus the metadata the router needs
 * to decide *how* to run it (inline engine vs hand-off to the tool page) and
 * *what* it accepts/produces.
 *
 * This is the lexical foundation. The semantic (embedding) layer in Phase 2
 * indexes the same `searchText`, so the two stay in sync.
 */

import { TOOLS } from '@/lib/registry';
import type { ToolManifest, Category, ComputeTier } from '@/lib/registry/types';
import { knowledgeFor } from './knowledge';

export interface IndexDoc {
  id: string;
  name: string;
  blurb: string;
  category: Category;
  compute: ComputeTier;
  keywords: string[];
  accepts: string[];
  produces: string[];
  href: string;
  /** Whether the tool can run with no file (generators, calculators, lookups). */
  needsFile: boolean;
  /** Pre-tokenised, weighted terms (term repeated by field weight). */
  terms: string[];
  /** Term frequencies, precomputed once so search never rebuilds them. */
  tf: Map<string, number>;
  /** sqrt(term count) — precomputed length normaliser for the ranker. */
  norm: number;
  /** Human-readable blob used by the embedding layer. */
  searchText: string;
  /** Plain-language capability sentence — what the AI tells the user (Layer 2). */
  card: string;
}

const STOP = new Set([
  'a', 'an', 'the', 'to', 'of', 'and', 'or', 'for', 'with', 'my', 'me', 'this',
  'that', 'it', 'is', 'in', 'on', 'into', 'as', 'from', 'your', 'you', 'i',
  'can', 'please', 'pls', 'want', 'need', 'make', 'do', 'how', 'what', 'file',
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** File-category hints from a manifest's accept list, for routing. */
function acceptsCategory(accepts: string[]): 'image' | 'audio' | 'video' | 'pdf' | 'text' | 'any' | null {
  const a = accepts.join(' ');
  if (/image\//.test(a)) return 'image';
  if (/audio\//.test(a)) return 'audio';
  if (/video\//.test(a)) return 'video';
  if (/pdf/.test(a)) return 'pdf';
  if (/text|json|csv/.test(a)) return 'text';
  if (accepts.length) return 'any';
  return null;
}

function buildDoc(t: ToolManifest): IndexDoc {
  const keywords = t.keywords ?? [];
  const accepts = t.accepts ?? [];
  const produces = t.produces ?? [];
  const know = knowledgeFor(t);
  // Field weighting: name and keywords matter most, but curated utterances —
  // how people actually phrase the request — are just as decisive, so they get
  // the same ×2 boost. Auto-derived knowledge terms (MIME words, category &
  // action synonyms) add recall at ×1 without drowning the distinctive words.
  const terms = [
    ...tokenize(t.name), ...tokenize(t.name),     // name ×2
    ...keywords.flatMap((k) => tokenize(k)), ...keywords.flatMap((k) => tokenize(k)), // keywords ×2
    ...know.utterances.flatMap((u) => tokenize(u)), ...know.utterances.flatMap((u) => tokenize(u)), // utterances ×2
    ...know.terms.flatMap((w) => tokenize(w)),    // MIME/category/action synonyms ×1
    ...tokenize(t.blurb),
    ...tokenize(t.category),
  ];
  const tf = new Map<string, number>();
  for (const t of terms) tf.set(t, (tf.get(t) ?? 0) + 1);
  return {
    id: t.id,
    name: t.name,
    blurb: t.blurb,
    category: t.category,
    compute: t.compute,
    keywords,
    accepts,
    produces,
    href: `/tools/${t.id}`,
    needsFile: acceptsCategory(accepts) !== null && acceptsCategory(accepts) !== 'any' ? true : accepts.length > 0,
    terms,
    tf,
    norm: Math.sqrt(terms.length || 1),
    // Embeddings see the full human surface: name, keywords, blurb, the curated
    // capability card, and real utterances — so semantic matches understand the
    // tool by meaning, not just its short blurb.
    searchText: [t.name, keywords.join(', '), know.card, know.utterances.join('. ')].filter(Boolean).join('. '),
    card: know.card,
  };
}

let _docs: IndexDoc[] | null = null;
let _byId: Map<string, IndexDoc> | null = null;

export function indexDocs(): IndexDoc[] {
  if (!_docs) _docs = TOOLS.map(buildDoc);
  return _docs;
}

export function docById(id: string): IndexDoc | undefined {
  if (!_byId) _byId = new Map(indexDocs().map((d) => [d.id, d]));
  return _byId.get(id);
}

/**
 * Build the index + document-frequency table ahead of time. Cheap, but doing it
 * during an idle callback (rather than on the first query) means the very first
 * routing call is instant even on a slow phone. Idempotent.
 */
export function warmIndex(): void {
  indexDocs();
  docFreq();
}

/** Document frequency per term — used by the lexical ranker (idf). */
let _df: Map<string, number> | null = null;
export function docFreq(): Map<string, number> {
  if (_df) return _df;
  const df = new Map<string, number>();
  for (const d of indexDocs()) {
    for (const term of d.tf.keys()) df.set(term, (df.get(term) ?? 0) + 1); // tf keys are unique
  }
  _df = df;
  return df;
}
