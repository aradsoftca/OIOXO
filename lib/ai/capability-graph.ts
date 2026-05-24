/**
 * Xonvert AI — Capability Graph (the brain's keystone).
 *
 * "What Xonvert can do" expressed as a graph a machine can SEARCH, instead of a
 * list a human has to enumerate. Every tool is a typed edge
 *
 *     accepts-family  --[tool]-->  produces-family
 *
 * derived from the registry's own `accepts`/`produces` MIME types — no hand-
 * authored recipes. Path-finding over this graph is what lets the AI fulfil a
 * goal that NO single tool serves: `mp3 → bmp` has no direct tool, but BFS finds
 * the bridge  audio --[visualise]--> image --[convert]--> bmp  on its own.
 *
 * The division of labour that makes a 0.6B model viable: the MODEL only names
 * the goal endpoints (`from`, `to`) — a tiny bounded job. This graph does the
 * "how" by deterministic search, so the plan is always valid and discoverable.
 *
 * Pure / DOM-free / Node-testable. The model is never called here.
 */

import { indexDocs, type IndexDoc } from './tool-index';
import { getBrainWasm } from './wasm-bridge';

/** Coarse media families — the nodes we path-find over. */
export type Family =
  | 'image' | 'audio' | 'video' | 'pdf' | 'text'
  | 'doc' | 'sheet' | 'slides'   // office: word-processing / spreadsheet / presentation
  | 'ebook' | 'archive' | 'font' | '3d' | 'data';

/** Synthetic source node for generators (tools that take no input). */
export const NOTHING = 'nothing' as const;
export type GraphNodeKey = Family | typeof NOTHING;

/** A typed transform: one tool turning one family into another. */
export interface CapEdge {
  toolId: string;
  name: string;
  from: GraphNodeKey;
  to: Family;
  /** Concrete output formats this tool can emit (e.g. {'mp3','wav'}). */
  produces: Set<string>;
}

/** A discovered route from a start family to a goal family. */
export interface CapPath {
  edges: CapEdge[];
  /** Families visited end-to-end, e.g. ['audio','image']. */
  families: GraphNodeKey[];
}

// --- MIME / format normalisation -------------------------------------------

// Subtype → canonical short format word, for the cases where the MIME subtype
// isn't the word people use. Everything else uses the subtype verbatim.
const FORMAT_ALIASES: Record<string, string> = {
  mpeg: 'mp3', 'x-wav': 'wav', 'x-m4a': 'm4a', 'svg+xml': 'svg',
  quicktime: 'mov', 'x-matroska': 'mkv', 'x-msvideo': 'avi',
  'epub+zip': 'epub', jpeg: 'jpg', 'x-7z-compressed': '7z',
  'vnd.rar': 'rar', gzip: 'gz', 'x-bzip2': 'bz2', 'x-tar': 'tar',
  'vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'gltf-binary': 'glb', 'gltf+json': 'gltf',
};

/** The family a MIME type or extension belongs to (null if unknown). */
/** The family a MIME/extension belongs to — runs in WASM when loaded, else the
 *  identical TS below (so behaviour is the same whether or not WASM is ready). */
export function mimeFamily(raw: string): Family | null {
  const w = getBrainWasm();
  if (w) { const r = w.mime_family(raw); return r ? (r as Family) : null; }
  return mimeFamilyTs(raw);
}
function mimeFamilyTs(raw: string): Family | null {
  const m = raw.toLowerCase().trim();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('font/')) return 'font';
  if (m.startsWith('model/')) return '3d';
  // 3D/CAD formats are often declared as file extensions, not MIME types — map
  // them so the type system (chain validation, guardrail) actually works.
  if (/\.(obj|stl|fbx|dae|ply|3ds|gltf|glb|3mf|step|stp|iges|igs|brep|dwg|dxf)$/.test(m)) return '3d';
  if (m === 'application/pdf' || m === '.pdf') return 'pdf';
  if (/(zip|x-7z|rar|x-tar|gzip|x-bzip2)/.test(m)) return 'archive';
  if (/epub|mobi|azw/.test(m)) return 'ebook';
  // Office, split by kind so "to Word" can't be served by a spreadsheet tool.
  if (/spreadsheet|\bms-?excel\b|\.(xlsx?|ods)$/.test(m)) return 'sheet';
  if (/presentation|powerpoint|\.(pptx?|odp)$/.test(m)) return 'slides';
  if (/word|msword|wordprocessing|\.(docx?|odt|rtf)$/.test(m)) return 'doc';
  if (/opendocument/.test(m)) return 'doc';
  if (m.startsWith('text/') || /(json|xml|csv|yaml|x-subrip|vtt)/.test(m)) return 'text';
  if (m.startsWith('application/')) return 'data';
  return null;
}

/** The short format word for a MIME (e.g. 'image/bmp'→'bmp', 'audio/mpeg'→'mp3'). */
export function mimeFormat(raw: string): string | null {
  const w = getBrainWasm();
  if (w) { const r = w.mime_format(raw); return r ? r : null; }
  return mimeFormatTs(raw);
}
function mimeFormatTs(raw: string): string | null {
  const m = raw.toLowerCase().trim();
  if (m.startsWith('.')) return m.slice(1);
  const slash = m.indexOf('/');
  if (slash < 0) return null;
  let sub = m.slice(slash + 1);
  if (sub === '*') return null; // family wildcard, not a concrete format
  sub = sub.replace(/^x-/, '');
  return FORMAT_ALIASES[m.slice(slash + 1)] ?? FORMAT_ALIASES[sub] ?? sub;
}

// A user-facing word ("bmp", "mp3", "word", "picture") → its family. Lets the
// model emit a plain goal token and the graph resolve which family to target.
const WORD_FAMILY: Record<string, Family> = {
  // families themselves
  image: 'image', picture: 'image', photo: 'image', pic: 'image', img: 'image',
  audio: 'audio', sound: 'audio', music: 'audio', song: 'audio',
  video: 'video', movie: 'video', clip: 'video',
  pdf: 'pdf', text: 'text', txt: 'text', doc: 'doc', document: 'doc',
  word: 'doc', spreadsheet: 'sheet', excel: 'sheet', sheet: 'sheet',
  powerpoint: 'slides', slides: 'slides', presentation: 'slides', deck: 'slides',
  ebook: 'ebook', archive: 'archive', zip: 'archive', font: 'font',
  '3d': '3d', model: '3d', data: 'data',
  // common formats
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', avif: 'image',
  gif: 'image', bmp: 'image', tiff: 'image', svg: 'image', ico: 'image', heic: 'image',
  mp3: 'audio', wav: 'audio', flac: 'audio', ogg: 'audio', aac: 'audio', m4a: 'audio',
  mp4: 'video', mov: 'video', webm: 'video', mkv: 'video', avi: 'video',
  docx: 'doc', odt: 'doc', rtf: 'doc', xlsx: 'sheet', ods: 'sheet',
  pptx: 'slides', odp: 'slides',
  epub: 'ebook', mobi: 'ebook', csv: 'text', json: 'text', html: 'text', md: 'text',
  ttf: 'font', otf: 'font', woff: 'font', stl: '3d', obj: '3d', glb: '3d', gltf: '3d',
};

/** Resolve a free user word/format to a family, or null (WASM when loaded). */
export function wordFamily(word: string): Family | null {
  const w = getBrainWasm();
  if (w) { const r = w.word_family(word); return r ? (r as Family) : null; }
  return WORD_FAMILY[word.toLowerCase().trim()] ?? null;
}

/** Every word the graph understands as a media family or format. The grammar
 *  enum the goal extractor constrains the model's `from`/`to` to. */
export function vocabularyWords(): string[] {
  return Object.keys(WORD_FAMILY);
}

// --- graph construction ------------------------------------------------------

function familiesOf(mimes: string[]): Family[] {
  const out = new Set<Family>();
  for (const m of mimes) { const f = mimeFamily(m); if (f) out.add(f); }
  return [...out];
}

function formatsOf(mimes: string[]): Set<string> {
  const out = new Set<string>();
  for (const m of mimes) { const f = mimeFormat(m); if (f) out.add(f); }
  return out;
}

let _edges: CapEdge[] | null = null;
let _adj: Map<GraphNodeKey, CapEdge[]> | null = null;

/** Build (once) the typed edge list from every tool's accepts/produces. */
export function capEdges(): CapEdge[] {
  if (_edges) return _edges;
  const edges: CapEdge[] = [];
  for (const doc of indexDocs()) {
    const toFams = familiesOf(doc.produces);
    if (!toFams.length) continue; // declares no media output → not a graph edge
    const produces = formatsOf(doc.produces);
    const fromFams: GraphNodeKey[] = doc.accepts.length ? familiesOf(doc.accepts) : [NOTHING];
    const fromSet = new Set(fromFams);
    for (const from of fromFams) {
      for (const to of toFams) {
        if (from === to && doc.accepts.length) {
          // Same-family transform (e.g. image→image convert/edit). Keep it: it's
          // how a format tail (png→bmp) is satisfied and how editors are reached.
          edges.push({ toolId: doc.id, name: doc.name, from, to, produces });
        } else if (from !== to && !fromSet.has(to)) {
          // Genuine one-way bridge (audio→image waveform, video→audio extract):
          // the tool produces `to` but can't itself ingest it. A universal format
          // converter that accepts BOTH families isn't a media transmuter — it
          // converts within each lane — so we skip its phantom cross edges
          // (e.g. convert-anything would otherwise claim image→audio).
          edges.push({ toolId: doc.id, name: doc.name, from, to, produces });
        }
      }
    }
  }
  _edges = edges;
  return edges;
}

function adjacency(): Map<GraphNodeKey, CapEdge[]> {
  if (_adj) return _adj;
  const adj = new Map<GraphNodeKey, CapEdge[]>();
  for (const e of capEdges()) {
    const list = adj.get(e.from) ?? [];
    list.push(e);
    adj.set(e.from, list);
  }
  _adj = adj;
  return adj;
}

/** Reset memoised graph (tests / hot-reload). */
export function _resetGraph(): void { _edges = null; _adj = null; }

// --- path-finding ------------------------------------------------------------

export interface FindOptions {
  /** Max number of tools in a chain (default 3). */
  maxHops?: number;
  /** Concrete goal format (e.g. 'bmp') — ensures the final edge can emit it. */
  goalFormat?: string | null;
  /** How many distinct paths to return (default 4, shortest first). */
  limit?: number;
}

/**
 * Find tool chains that transform `from` family into `to` family. BFS by hop
 * count, so the SHORTEST (fewest-tool) routes come first. Cross-family edges
 * only between distinct families per step (no spinning inside one family),
 * except the final hop may stay in-family to satisfy a concrete `goalFormat`.
 */
export function findPaths(from: GraphNodeKey | null, to: Family, opts: FindOptions = {}): CapPath[] {
  const maxHops = opts.maxHops ?? 3;
  const limit = opts.limit ?? 4;
  const adj = adjacency();
  const start: GraphNodeKey = from ?? NOTHING;
  const results: CapPath[] = [];

  // BFS over (node, visited families, edges-so-far). Visited set prevents cycles.
  const queue: { node: GraphNodeKey; visited: Set<GraphNodeKey>; edges: CapEdge[] }[] = [
    { node: start, visited: new Set([start]), edges: [] },
  ];

  const seenSig = new Set<string>(); // dedupe by tool sequence

  while (queue.length && results.length < limit * 3) {
    const cur = queue.shift()!;
    if (cur.edges.length >= maxHops) continue;
    for (const e of adj.get(cur.node) ?? []) {
      // Don't revisit a family we've already passed through (avoids loops),
      // unless it's the goal itself (a final in-family convert is allowed).
      if (e.to !== to && cur.visited.has(e.to)) continue;
      const edges = [...cur.edges, e];
      const sig = edges.map((x) => x.toolId).join('>');
      if (e.to === to) {
        // Reaching the goal FAMILY completes the route. A concrete `goalFormat`
        // is a preference (used to rank below + append a tail in planCapability),
        // never a hard filter — converters rarely advertise every format they
        // can emit, so gating on it would hide valid routes.
        if (!seenSig.has(sig)) {
          seenSig.add(sig);
          results.push({ edges, families: [start, ...edges.map((x) => x.to)] });
        }
        continue; // don't extend past the goal
      }
      queue.push({ node: e.to, visited: new Set([...cur.visited, e.to]), edges });
    }
  }

  // Shortest first; then prefer a terminal edge that actually advertises the
  // requested format (so 'bmp' favours a path ending on a bmp-capable tool).
  const wants = opts.goalFormat;
  results.sort((a, b) => {
    if (a.edges.length !== b.edges.length) return a.edges.length - b.edges.length;
    if (wants) {
      const aw = a.edges[a.edges.length - 1].produces.has(wants) ? 0 : 1;
      const bw = b.edges[b.edges.length - 1].produces.has(wants) ? 0 : 1;
      if (aw !== bw) return aw - bw;
    }
    return 0;
  });
  return results.slice(0, limit);
}

/**
 * High-level entry the brain calls: given goal endpoints as plain words/families,
 * return the best route (or null if the goal is outside what our tools can do —
 * the signal to fall back to search/answer). `fromWord` may be null when the
 * input is a known file family (pass that family directly as `fromFamily`).
 */
export function planCapability(
  fromFamily: GraphNodeKey | null,
  toWord: string,
  opts: FindOptions = {},
): CapPath | null {
  const toFamily = wordFamily(toWord) ?? (mimeFamily(toWord) as Family | null);
  if (!toFamily) return null;
  const goalFormat = opts.goalFormat ?? wordToFormat(toWord);
  const paths = findPaths(fromFamily, toFamily, { ...opts, goalFormat });
  const best = paths[0];
  if (!best) return null;

  // Append a format-conversion tail when a concrete format was asked for and the
  // route's final tool doesn't already emit it — e.g. audio→image (waveform)
  // then image→bmp (convert). The tail is an in-family converter that advertises
  // the format; if none exists, return the family route unchanged.
  if (goalFormat) {
    const last = best.edges[best.edges.length - 1];
    if (!last.produces.has(goalFormat)) {
      const edges = capEdges();
      // Prefer an in-family edge that advertises the exact format; otherwise the
      // family's generic format-converter (manifests rarely list every output
      // format they can emit — the convert engine handles the rest).
      const tail =
        edges.find((e) => e.from === toFamily && e.to === toFamily && e.produces.has(goalFormat) && e.toolId !== last.toolId) ??
        edges.find((e) => e.from === toFamily && e.to === toFamily && /convert|format/i.test(e.toolId) && e.toolId !== last.toolId);
      if (tail) {
        return { edges: [...best.edges, tail], families: [...best.families, toFamily] };
      }
    }
  }
  return best;
}

/** A concrete format word if `word` names one (else null — it's just a family). */
export function wordToFormat(word: string): string | null {
  const bw = getBrainWasm();
  if (bw) { const r = bw.word_to_format(word); return r ? r : null; }
  const w = word.toLowerCase().trim();
  // It's a format only if it's not one of the bare family names.
  const FAMILY_WORDS = new Set(['image', 'picture', 'photo', 'audio', 'sound', 'music',
    'video', 'movie', 'text', 'doc', 'document', 'sheet', 'spreadsheet', 'slides',
    'presentation', 'ebook', 'archive', 'font', 'data', '3d', 'model']);
  if (FAMILY_WORDS.has(w)) return null;
  return WORD_FAMILY[w] ? w.replace(/^jpeg$/, 'jpg') : null;
}

/** Does any single tool transform `from`→`to` directly (1 hop)? */
export function hasDirect(from: GraphNodeKey, to: Family): boolean {
  return (adjacency().get(from) ?? []).some((e) => e.to === to);
}

/** Debug/observability: families reachable from a start within maxHops. */
export function reachableFrom(from: GraphNodeKey, maxHops = 3): Set<Family> {
  const adj = adjacency();
  const seen = new Set<Family>();
  let frontier: GraphNodeKey[] = [from];
  for (let hop = 0; hop < maxHops; hop++) {
    const next: GraphNodeKey[] = [];
    for (const n of frontier) for (const e of adj.get(n) ?? []) {
      if (!seen.has(e.to)) { seen.add(e.to); next.push(e.to); }
    }
    frontier = next;
  }
  return seen;
}
