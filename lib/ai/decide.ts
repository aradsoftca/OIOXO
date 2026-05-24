/**
 * Xonvert AI — the decider (model-FIRST routing).
 *
 * The fix for "acts dumb": retrieval PROPOSES a short list of candidate tools
 * (with what each does AND what it accepts), and the MODEL DISPOSES — it reads
 * the request, understands the intent, and picks one tool, chains a few, answers
 * a question, chats, or HONESTLY DECLINES when nothing fits. The old path let a
 * keyword ranker force the top match (so "convert song to stl" grabbed an audio
 * tool); here the model judges, including saying "I can't do that."
 *
 * Pure / Node-testable. Grammar-constrained so a tiny model can't hallucinate a
 * tool or break JSON. A deterministic fallback covers cold/WASM/garbage output,
 * so behaviour is never worse than retrieval alone — the model only improves it.
 */

import { searchTools, confidence as lexConfidence } from './retrieval';
import { mimeFamily } from './capability-graph';
import { classifyIntent } from './intent';
import { cleanQuery } from './search';
import { getBrainWasm } from './wasm-bridge';

// Serialize candidates to the minimal {id,accepts,produces} the WASM core needs.
function candsJson(cands: ToolCandidate[]): string {
  return JSON.stringify(cands.map((c) => ({ id: c.id, accepts: c.accepts, produces: c.produces })));
}

export type DecisionAction = 'tool' | 'chain' | 'answer' | 'chat' | 'offer';

export interface ToolCandidate {
  id: string;
  name: string;
  blurb: string;
  /** Coarse families this tool accepts / produces, for the model to judge fit. */
  accepts: string[];
  produces: string[];
}

export interface Decision {
  action: DecisionAction;
  /** For 'tool' (one) or 'chain' (ordered) — always real candidate ids. */
  tools: string[];
  /** For 'answer' — what to look up. */
  query?: string;
  /** For 'chat' / 'cannot' — a short message to show the user. */
  reply?: string;
}

const fams = (mimes: string[]): string[] => {
  const s = new Set<string>();
  for (const m of mimes) { const f = mimeFamily(m); if (f) s.add(f); }
  return [...s];
};

/** The few most relevant tools for a request — the menu the model chooses from. */
export function candidatesFor(message: string, fileCat: 'image' | 'audio' | 'video' | 'pdf' | 'text' | null, k = 6): ToolCandidate[] {
  return searchTools(message, { fileCategory: fileCat, limit: k })
    .filter((r) => r.rel >= 0.15 || r.score >= 0.5)
    .slice(0, k)
    .map((r) => ({ id: r.doc.id, name: r.doc.name, blurb: r.doc.blurb, accepts: fams(r.doc.accepts), produces: fams(r.doc.produces) }));
}

/** Retrieval's confidence that a tool matches — when 'confident', the obvious
 *  match is trusted directly and the (noisy) model decision is skipped. */
export function retrievalConfidence(message: string, fileCat: 'image' | 'audio' | 'video' | 'pdf' | 'text' | null): 'confident' | 'ambiguous' | 'weak' {
  return lexConfidence(searchTools(message, { fileCategory: fileCat, limit: 6 }));
}

// Multi-step phrasing — these go to the model so it can build a CHAIN, never the
// single-tool guardrail (which would drop later steps).
const MULTI_STEP = /\b(then|and then|after that)\b|\band\s+(also\s+)?(translate|convert|add|compress|resize|rotate|crop|merge|watermark|make|summari[sz]e|extract|remove|split|blur|sharpen)\b/i;

/**
 * The guardrail: when retrieval is CONFIDENT, the request is a single step, AND
 * the top tool actually ACCEPTS the input type, trust that tool and skip the
 * (noisy) model. Returns the tool to force, or null to let the model decide.
 * Input-type check is what stops a keyword false-match ("cad" → cad-convert for
 * an audio input) — exactly the collapse we must avoid.
 */
export function guardrailTool(message: string, cands: ToolCandidate[], inputFam: string | null, conf: 'confident' | 'ambiguous' | 'weak'): ToolCandidate | null {
  const w = getBrainWasm();
  if (w) {
    try {
      const id = w.guardrail_tool(message, candsJson(cands), inputFam ?? '', conf);
      return id ? (cands.find((c) => c.id === id) ?? null) : null;
    } catch { /* fall through to TS */ }
  }
  return guardrailToolTs(message, cands, inputFam, conf);
}
function guardrailToolTs(message: string, cands: ToolCandidate[], inputFam: string | null, conf: 'confident' | 'ambiguous' | 'weak'): ToolCandidate | null {
  if (conf !== 'confident' || !cands.length) return null;
  if (MULTI_STEP.test(message)) return null;
  const top = cands[0];
  // Require POSITIVE type compatibility: when we know the input family, only
  // force the tool if it EXPLICITLY accepts that family. "Not excluded" wasn't
  // enough — cad-convert's CAD extensions map to no known family (empty accepts),
  // so a "not excluded" check wrongly fired it for an audio "m4a to cad". When no
  // input family is known (e.g. a generator request with no file), there's
  // nothing to contradict, so the confident match stands.
  if (inputFam && !top.accepts.includes(inputFam)) return null;
  return top;
}

export interface DecideCtx {
  /** Family of an attached/working file, if any. */
  fileFamily?: string | null;
  /** Whether a file is attached this turn. */
  hasFile?: boolean;
  /** The previous topic, so the model can resolve follow-ups. */
  lastTopic?: string | null;
  /** The assistant's last message — so a collaboration continues: if it offered
   *  "paste the text and I'll summarize" and the user now pastes text, the model
   *  connects them and acts on the pending goal. Memory via context, not a rule. */
  lastReply?: string | null;
}

/** Build the grammar-constrained decision messages + JSON schema. */
export function decisionPrompt(message: string, candidates: ToolCandidate[], ctx: DecideCtx): {
  messages: { role: 'system' | 'user'; content: string }[];
  schema: string;
} {
  const menu = candidates.length
    ? candidates.map((c) => {
        const io = [c.accepts.length ? `takes ${c.accepts.join('/')}` : 'takes text/none', c.produces.length ? `makes ${c.produces.join('/')}` : ''].filter(Boolean).join(', ');
        return `- ${c.id}: ${c.name} — ${c.blurb} (${io})`;
      }).join('\n')
    : '(no tool looks relevant)';

  const system =
    'You are Xonvert, a capable file-tools assistant. Pick the BEST way to handle the request. Most requests CAN be done — default to using a tool.\n' +
    '- "tool": one tool does what they want → set tools to that single id. If a tool\'s name matches the action (they say "compress" and there\'s a compress tool), USE it.\n' +
    '- "chain": the request names TWO actions (joined by "and"/"then", e.g. "remove background then convert to jpg", "transcribe and translate") → list a tool id for EACH action, in order. If a tool exists for each step, use "chain" — do NOT pick "offer".\n' +
    '- "answer": they ask a question or want facts/info/a definition (who/what/when/where/why/how is…, a price, the news) → set query. A question is "answer", never "chat".\n' +
    '- "chat": ONLY a greeting, thanks, or small talk with no request (e.g. "hi", "thanks") → set reply.\n' +
    '- "offer": use this ONLY when the input genuinely cannot become the requested output with ANY listed tool (e.g. turning an audio file into a 3D model). Just set action to "offer" — a friendly way-forward message is written separately. Do NOT use "offer" for normal edits or conversions a listed tool clearly handles.\n' +
    'Pick ids ONLY from the list. Reply with ONLY JSON like {"action":"tool","tools":["the-id"]}. /no_think';

  const fileLine = ctx.hasFile ? `Attached file type: ${ctx.fileFamily ?? 'unknown'}` : 'Attached file: none';
  const topicLine = ctx.lastTopic ? `\nEarlier topic: ${ctx.lastTopic}` : '';
  const replyLine = ctx.lastReply ? `\nYou just said to the user: "${ctx.lastReply.slice(0, 200)}" — if this request continues that, act on it.` : '';
  const user = `Request: "${message}"\n${fileLine}${topicLine}${replyLine}\nTools you could use:\n${menu}`;

  // Constrain only `action` by enum (robust across every grammar engine).
  // `tools` are free strings here and VALIDATED against candidate ids in
  // parseDecision — an array-of-enum compiles to broken/empty grammar in some
  // engines (llama.cpp emitted an empty rule), so we don't rely on it.
  const schema = JSON.stringify({
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['tool', 'chain', 'answer', 'chat', 'offer'] },
      // Cap the array so the model can't run away listing ids and truncate the
      // JSON mid-token (seen on the WASM path). A chain never needs >4 steps.
      tools: { type: 'array', items: { type: 'string' }, maxItems: 4 },
      query: { type: 'string' },
      reply: { type: 'string' },
    },
    required: ['action'],
  });
  return { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], schema };
}

/**
 * Free-form prompt for the resourceful WAY-FORWARD message (used after the
 * decision returns 'offer'). Separated from the structured decision because
 * writing a helpful sentence and emitting clean JSON are different skills — a
 * small model does each better alone. It reasons about the gap and proposes a
 * path (do part / ask for the missing input / suggest a first step).
 */
// A compact, TRUE summary of what Xonvert can do — so the resourceful offer is
// grounded in real abilities, not a hallucinated "use a music converter". This
// is a general capability description, not a per-task rule.
export const CAPABILITY_OVERVIEW =
  'convert & edit images, audio, video, and PDFs; transcribe audio/video to text; ' +
  'extract audio from video; summarize or translate TEXT; read text from a PDF or an image (OCR); ' +
  'turn audio into a waveform image; make QR codes; merge/split/compress PDFs; turn text or images into a PDF. ' +
  'It works on a file the user provides or text they paste — it cannot fetch web pages, social media, or streaming links itself.';

export function offerPrompt(message: string, ctx: DecideCtx): { messages: { role: 'system' | 'user'; content: string }[] } {
  const system =
    'You are Xonvert, a resourceful assistant. The user wants something no single tool does directly. ' +
    'Be resourceful like an expert: using ONLY the real abilities listed, find a TRUE way forward. ' +
    'In 1–2 friendly sentences either (a) offer to do the part you genuinely can, (b) ask for the exact input you\'d need (e.g. the text, the transcript, or the file), or (c) suggest a real first step. ' +
    'Do NOT invent abilities or name external software you don\'t have. Be specific to THEIR request.\n' +
    `What Xonvert can do: ${CAPABILITY_OVERVIEW} /no_think`;
  const fileLine = ctx.hasFile ? ` They attached a ${ctx.fileFamily ?? 'file'}.` : '';
  return { messages: [{ role: 'system', content: system }, { role: 'user', content: `The user asked: "${message}".${fileLine} Give them a TRUE, helpful way forward using only the abilities above.` }] };
}

/** Does a proposed chain type-connect? Each step's produced family must feed the
 *  next step's accepted family. Unknown/empty types are given the benefit of the
 *  doubt (only a KNOWN mismatch rejects), so we never block a real chain. */
export function chainConnects(tools: string[], cands: ToolCandidate[]): boolean {
  const byId = new Map(cands.map((c) => [c.id, c]));
  for (let i = 0; i < tools.length - 1; i++) {
    const a = byId.get(tools[i]); const b = byId.get(tools[i + 1]);
    if (!a || !b) continue;
    if (a.produces.length && b.accepts.length && !a.produces.some((p) => b.accepts.includes(p))) return false;
  }
  return true;
}

/** Parse + validate the model's reply into a Decision, or null if unusable. */
export function parseDecision(raw: string, candidates: ToolCandidate[]): Decision | null {
  const w = getBrainWasm();
  if (w) {
    try {
      const out = w.parse_decision(raw, candsJson(candidates));
      if (!out) return null;
      const d = JSON.parse(out) as { action: DecisionAction; tools?: string[]; query?: string; reply?: string };
      return { action: d.action, tools: d.tools ?? [], query: d.query, reply: d.reply };
    } catch { /* fall through to TS */ }
  }
  return parseDecisionTs(raw, candidates);
}
function parseDecisionTs(raw: string, candidates: ToolCandidate[]): Decision | null {
  if (!raw) return null;
  let obj: Record<string, unknown>;
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    obj = JSON.parse(m ? m[0] : raw);
  } catch { return null; }
  const action = obj.action;
  if (action !== 'tool' && action !== 'chain' && action !== 'answer' && action !== 'chat' && action !== 'offer') return null;

  const ids = new Set(candidates.map((c) => c.id));
  const tools = Array.isArray(obj.tools) ? (obj.tools as unknown[]).filter((t): t is string => typeof t === 'string' && ids.has(t)) : [];

  if (action === 'tool' || action === 'chain') {
    if (!tools.length) return null; // claimed a tool but named none valid → unusable
    // Trust the tools, not the label: 2+ valid tools is a chain even if the model
    // said "tool" (small models routinely mislabel) — so the extra steps survive.
    if (tools.length > 1) {
      // But a chain must TYPE-CONNECT (each step's output feeds the next's input).
      // The model, told to "find a way", sometimes strings incompatible tools
      // (audio-convert → 3d-convert for "song to stl"). If the path isn't real,
      // it's not doable — fall to a resourceful offer instead of a broken chain.
      if (!chainConnects(tools, candidates)) return { action: 'offer', tools: [] };
      return { action: 'chain', tools };
    }
    return { action: 'tool', tools };
  }
  if (action === 'answer') {
    const q = typeof obj.query === 'string' && obj.query.trim() ? obj.query.trim() : undefined;
    return { action: 'answer', tools: [], query: q };
  }
  // 'chat' / 'offer': keep the model's resourceful reply, but drop it if it's a
  // tool-id DUMP (arrows, or ≥2 candidate ids pasted in) — those must never show.
  // A normal sentence with a hyphenated word ("step-by-step") is fine to keep.
  const r = typeof obj.reply === 'string' ? obj.reply.trim() : '';
  const idHits = candidates.reduce((n, c) => (r.includes(c.id) ? n + 1 : n), 0);
  const junk = !r || r.length > 320 || /[→]|->|::=/.test(r) || idHits >= 2;
  return { action, tools: [], reply: junk ? undefined : r };
}

/**
 * Deterministic decision when the model can't be used (cold / WASM / garbage).
 * Reuses the intent classifier + retrieval confidence so it's always sane — the
 * model only ever makes it smarter, never worse than today's behaviour.
 */
export function fallbackDecision(message: string, candidates: ToolCandidate[], ctx: DecideCtx): Decision {
  const fam = classifyIntent(message, { hasFile: ctx.hasFile, hasTopic: !!ctx.lastTopic });
  if (fam === 'chitchat') return { action: 'chat', tools: [] };
  if (fam === 'question' || fam === 'followup') return { action: 'answer', tools: [], query: cleanQuery(message) };
  const conf = lexConfidence(searchTools(message, { limit: 6 }));
  if (candidates.length && conf !== 'weak') return { action: 'tool', tools: [candidates[0].id] };
  // No confident tool: a file in hand still wants action; otherwise look it up.
  return ctx.hasFile && candidates.length ? { action: 'tool', tools: [candidates[0].id] } : { action: 'answer', tools: [], query: cleanQuery(message) };
}
