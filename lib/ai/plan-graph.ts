/**
 * Xonvert AI — composition planner (Task Brain, layer 2).
 *
 * The leap from "route one request" to "orchestrate": recognise when a goal
 * needs TWO capabilities wired together — a *producer* (a calc/lookup that
 * yields a value) feeding a *renderer* (a tool that puts that value onto an
 * image/pdf). "make an image with my loan calculation on it" =
 *   finance-mortgage  →(text)→  gen-poster(text = result).
 *
 * The link is decided by TYPES (schema.ts): a producer whose output is `text`
 * can fill a renderer's text content slot. We detect the two capabilities from
 * the request, build the graph, extract whatever slot values are already in the
 * sentence, and report which required slots are still missing so the dialogue
 * layer can ask. Deterministic / pure / Node-testable — the model isn't needed
 * to plan this; at most it later tie-breaks an ambiguous tool choice.
 */

import { docById } from './tool-index';
import { toolSchema, toolName, textContentSlot, type Slot, type ValueType } from './schema';
import { tryFinance } from './finance-ops';

export interface GraphSlot { slot: Slot; value?: string; }
export interface GraphNode {
  toolId: string;
  name: string;
  produces: ValueType;
  slots: GraphSlot[];
  /** Index of the node whose output fills this node's text content slot. */
  inputFromNode?: number;
}
export interface GraphPlan {
  kind: 'compose' | 'none';
  nodes: GraphNode[];
  /** Required slots with no value yet — what the dialogue layer must ask for. */
  missing: { nodeIdx: number; slot: Slot }[];
  /** One-line description of the composed plan, for narration. */
  summary: string;
}

const NONE: GraphPlan = { kind: 'none', nodes: [], missing: [], summary: '' };

// A render target the user wants the result placed onto, mapped to the best
// text→image / text→pdf tool that actually exists in the registry.
function pickRenderer(text: string): string | null {
  const t = text.toLowerCase();
  if (/\bqr\b/.test(t)) return 'gen-qr-code';
  // text → image (a titled graphic) via the inline poster composer.
  if (/\b(image|picture|pic|poster|graphic|wallpaper|thumbnail|banner|card)\b/.test(t)) return 'render-poster';
  // text → pdf via the inline text-to-pdf engine.
  if (/\b(pdf|document|report)\b/.test(t)) return 'render-pdf';
  return null;
}

// Producer capabilities: a cue in the request → the tool that computes that
// value. Kept explicit for the common, high-value cases; extend freely.
const PRODUCER_CUES: { re: RegExp; id: string }[] = [
  { re: /\b(loan|mortgage|repayment|monthly payment)\b/i, id: 'finance-mortgage' },
  { re: /\binvest(?:ment|ing)?\b/i, id: 'finance-investment' },
  { re: /\bsavings?\b/i, id: 'finance-savings' },
  { re: /\b(bmi|body mass)\b/i, id: 'calc-bmi' },
  { re: /\bpercent(age)?\b/i, id: 'calc-percent' },
  { re: /\btip\b/i, id: 'calc-tip' },
];

function pickProducer(text: string): string | null {
  for (const c of PRODUCER_CUES) if (c.re.test(text) && docById(c.id)) return c.id;
  return null;
}

// --- slot value extraction (deterministic; never the model) -----------------

export function extractSlot(slot: Slot, text: string): string | undefined {
  const t = text;
  switch (slot.type) {
    case 'currency': {
      const m = t.match(/\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m|thousand|million)?/i);
      if (!m) return undefined;
      let n = parseFloat(m[1].replace(/,/g, ''));
      const u = (m[2] ?? '').toLowerCase();
      if (u === 'k' || u === 'thousand') n *= 1e3; else if (u === 'm' || u === 'million') n *= 1e6;
      return String(n);
    }
    case 'percent': { const m = t.match(/(\d+(?:\.\d+)?)\s*%/); return m ? m[1] : undefined; }
    case 'years': { const m = t.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/i); return m ? m[1] : undefined; }
    case 'number': case 'integer': { const m = t.match(/\b(\d+(?:\.\d+)?)\b/); return m ? m[1] : undefined; }
    case 'dimensions': {
      const m = t.match(/(\d{2,5})\s*(?:x|×|by)\s*(\d{2,5})/i) || t.match(/(\d{2,5})\s*(?:px)?\s*wide/i) || t.match(/(\d{1,3})\s*%/);
      return m ? m[0] : undefined;
    }
    case 'duration': { const m = t.match(/(?:first|last)?\s*\d+\s*(?:s|sec|seconds?|minutes?|min)/i); return m ? m[0].trim() : undefined; }
    case 'color': { const m = t.match(/#[0-9a-f]{3,8}\b|\b(red|blue|green|black|white|yellow|orange|purple|pink|gray|grey)\b/i); return m ? m[0] : undefined; }
    default: return undefined; // text content is asked, not scraped
  }
}

function buildNode(toolId: string, text: string): GraphNode | null {
  const schema = toolSchema(toolId);
  if (!schema) return null;
  const slots: GraphSlot[] = schema.slots.map((slot) => ({ slot, value: extractSlot(slot, text) }));
  return { toolId, name: toolName(toolId), produces: schema.produces, slots };
}

/**
 * Plan a request as a composition graph if it wires a producer into a renderer;
 * otherwise return `none` so the normal single-tool pipeline handles it.
 */
export function planGraph(text: string): GraphPlan {
  const rendererId = pickRenderer(text);
  const producerId = pickProducer(text);

  // Composition only when BOTH a render target AND a value producer are named —
  // "compress this image" names a target but no producer, so it's not a compose.
  if (rendererId && producerId) {
    const producer = buildNode(producerId, text);
    const renderer = buildNode(rendererId, text);
    if (producer && renderer) {
      // Wire the producer's text output into the renderer's text content slot.
      const contentSlot = textContentSlot(rendererId);
      if (contentSlot) {
        const gs = renderer.slots.find((s) => s.slot.name === contentSlot.name);
        if (gs) { gs.value = '«result»'; renderer.inputFromNode = 0; }
      }
      const nodes = [producer, renderer];
      const missing = collectMissing(nodes);
      return {
        kind: 'compose',
        nodes,
        missing,
        summary: `I'll calculate with ${producer.name}, then put the result on an ${renderer.produces} via ${renderer.name}.`,
      };
    }
  }
  return NONE;
}

/** Read a node's filled slot value by name. */
function slotVal(node: GraphNode, name: string): string | undefined {
  return node.slots.find((s) => s.slot.name === name)?.value;
}

/**
 * Run a PRODUCER node (a calc/finance tool) from its filled slots and return the
 * computed text result, or null. Pure — reuses the same inline formulas the rest
 * of the AI trusts, so the number is correct and Node-testable.
 */
export function runProducer(node: GraphNode): string | null {
  const amount = slotVal(node, 'amount'), rate = slotVal(node, 'rate'), years = slotVal(node, 'years');
  let phrase = '';
  if (node.toolId === 'finance-mortgage') phrase = `mortgage ${amount} at ${rate}% for ${years} years`;
  else if (node.toolId === 'finance-investment') phrase = `invest ${amount} at ${rate}% for ${years} years`;
  else if (node.toolId === 'finance-savings') phrase = `save ${amount} per month at ${rate}% for ${years} years`;
  if (!phrase) return null;
  return tryFinance(phrase)?.result ?? null;
}

/** Required slots across all nodes that still have no value. */
export function collectMissing(nodes: GraphNode[]): { nodeIdx: number; slot: Slot }[] {
  const out: { nodeIdx: number; slot: Slot }[] = [];
  nodes.forEach((n, i) => {
    for (const gs of n.slots) {
      if (gs.slot.required && (gs.value == null || gs.value === '') && gs.slot.default == null) {
        out.push({ nodeIdx: i, slot: gs.slot });
      }
    }
  });
  return out;
}
