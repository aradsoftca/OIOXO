/**
 * Xonvert AI — the decider (agent brain, step 1).
 *
 * The insight that makes a 0.5B smart: the intelligence lives in the TOOLS and
 * the LIVE DATA, not in the model's memory. So the model never has to "know"
 * anything — it only makes one small, bounded decision: given the request and
 * the few most relevant tools, should I run a TOOL, SEARCH the web (and for
 * what), or just CHAT? That choice — pick from ~5, or write a query — is well
 * within a tiny model's reach, especially with the output constrained to a
 * schema so it physically can't hallucinate a tool or break JSON.
 *
 * This module is pure: it builds the prompt + schema, parses/validates the
 * model's reply, and provides a deterministic FALLBACK decision for when the
 * model is cold, on the WASM path (no grammar), or returns junk. The caller
 * (AiApp) owns the engine and runs the actual model call. Node-testable.
 */

import { searchTools, confidence } from './retrieval';
import { classifyIntent } from './intent';
import { cleanQuery } from './search';

export type AgentAction = 'tool' | 'search' | 'chat';

export interface Candidate { id: string; name: string; blurb: string; }

export interface Decision {
  action: AgentAction;
  /** When action==='tool', the chosen tool id (always one of the candidates). */
  tool?: string;
  /** When action==='search', the query to look up (model-written or cleaned). */
  query?: string;
}

/** The few most relevant tools for a request — the menu the model chooses from. */
export function candidatesFor(message: string, fileCat: 'image' | 'audio' | 'video' | 'pdf' | 'text' | null, k = 5): Candidate[] {
  const ranked = searchTools(message, { fileCategory: fileCat, limit: k });
  // Drop near-irrelevant tail so the model isn't tempted by junk options.
  return ranked.filter((r) => r.rel >= 0.2 || r.score >= 0.6).slice(0, k).map((r) => ({ id: r.doc.id, name: r.doc.name, blurb: r.doc.blurb }));
}

/** Build the grammar-constrained triage messages + JSON schema for the model. */
export function triagePrompt(message: string, candidates: Candidate[], hasFile: boolean): {
  messages: { role: 'system' | 'user'; content: string }[];
  schema: string;
} {
  const menu = candidates.length
    ? candidates.map((c) => `- ${c.id}: ${c.name} — ${c.blurb}`).join('\n')
    : '(no tool looks relevant)';
  const system =
    'You route a user request for Xonvert, a file-tools + answer app. Choose ONE action:\n' +
    '- "tool": the user wants to DO something to a file or create/convert/edit/generate — set "tool" to the best id from the list.\n' +
    '- "search": the user asks a question or wants facts, info, news, prices, definitions — set "query" to a concise web search.\n' +
    '- "chat": greeting, thanks, or small talk.\n' +
    'Prefer "search" for any factual question — never answer facts from memory. ' +
    'Reply with ONLY JSON: {"action":"tool|search|chat","tool":"","query":""}.';
  const user = `Request: "${message}"\nAttached file: ${hasFile ? 'yes' : 'no'}\nRelevant tools:\n${menu}`;
  const ids = candidates.map((c) => c.id);
  const schema = JSON.stringify({
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['tool', 'search', 'chat'] },
      tool: { type: 'string', enum: [...ids, ''] },
      query: { type: 'string' },
    },
    required: ['action'],
  });
  return { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], schema };
}

/** Parse + validate the model's reply into a Decision, or null if unusable. */
export function parseDecision(raw: string, candidates: Candidate[]): Decision | null {
  if (!raw) return null;
  let obj: { action?: unknown; tool?: unknown; query?: unknown };
  try {
    const m = raw.match(/\{[\s\S]*\}/); // tolerate prose around the JSON (WASM path)
    obj = JSON.parse(m ? m[0] : raw);
  } catch { return null; }
  const action = obj.action;
  if (action !== 'tool' && action !== 'search' && action !== 'chat') return null;
  if (action === 'tool') {
    const tool = typeof obj.tool === 'string' ? obj.tool : '';
    const ok = candidates.find((c) => c.id === tool);
    if (!ok) return null; // invalid/hallucinated tool → treat as unusable
    return { action: 'tool', tool };
  }
  if (action === 'search') {
    const q = typeof obj.query === 'string' && obj.query.trim() ? obj.query.trim() : undefined;
    return { action: 'search', query: q };
  }
  return { action: 'chat' };
}

/**
 * Deterministic decision for when the model can't be used (cold / WASM / bad
 * output). Reuses the intent classifier and retrieval confidence so behaviour is
 * always sane — the model only ever makes it *better*, never worse.
 */
export function fallbackDecision(message: string, candidates: Candidate[], hasFile: boolean): Decision {
  const fam = classifyIntent(message, { hasFile });
  if (fam === 'chitchat') return { action: 'chat' };
  if (fam === 'question' || fam === 'followup') return { action: 'search', query: cleanQuery(message) };
  // task / capability: use the top candidate if retrieval is confident, else
  // a factual fallback (search) keeps us useful instead of dead-ending.
  if (candidates.length && confidence(searchTools(message, { limit: 5 })) !== 'weak') {
    return { action: 'tool', tool: candidates[0].id };
  }
  return hasFile ? { action: 'tool', tool: candidates[0]?.id } : { action: 'search', query: cleanQuery(message) };
}
