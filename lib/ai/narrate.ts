/**
 * Xonvert AI — narration & grounding.
 *
 * Two jobs, both about making the assistant *transparent*:
 *  - `narratePlan` turns a Plan into a short, friendly explanation of what the
 *    AI is about to do and which tools it will use — so a user who just wanted
 *    one job done also learns what Xonvert can do (the explicit product goal).
 *  - `capabilityContext` retrieves the most relevant tool capability cards for a
 *    "can you / what can you do / how do I" question, so the language model
 *    answers grounded in the real catalog instead of improvising.
 *
 * Pure / DOM-free.
 */

import { searchTools, confidence } from './retrieval';
import type { Plan } from './planner';

/**
 * A human plan summary: numbered steps naming each tool (with the live link),
 * inferred prerequisite steps flagged, and any clause we couldn't place called
 * out honestly rather than silently dropped.
 */
export function narratePlan(plan: Plan): { text: string; tools: { name: string; href: string }[] } {
  const lines: string[] = [];
  const tools: { name: string; href: string }[] = [];
  plan.steps.forEach((s, i) => {
    const because = s.inferred ? ' _(needed first)_' : '';
    lines.push(`${i + 1}. **${s.name}** — ${s.narration}${because}`);
    tools.push({ name: s.name, href: s.href });
  });
  let text = plan.multi
    ? `Here’s my plan — ${plan.steps.length} steps, all on your device:\n${lines.join('\n')}`
    : lines.join('\n');
  if (plan.unresolved.length) {
    text += `\n\nI’m not sure which tool handles: ${plan.unresolved.map((u) => `“${u}”`).join(', ')} — tell me a bit more and I’ll find it.`;
  }
  return { text, tools };
}

/** Short "done" recap after a chain runs, naming the tools that did the work. */
export function recapPlan(plan: Plan, ranCount: number): string {
  const ran = plan.steps.slice(0, ranCount).map((s) => s.name);
  if (!ran.length) return 'Done.';
  if (ran.length === 1) return `Done — I used **${ran[0]}**.`;
  return `Done — I ran ${ran.length} tools in order: ${ran.map((n) => `**${n}**`).join(' → ')}.`;
}

export interface CapabilityContext {
  /** Capability-card sentences for the model's grounding context. */
  cards: string[];
  /** The matching tools, for one-tap links under the answer. */
  tools: { name: string; href: string; blurb: string }[];
  /** True when there's a clear top tool — gate answering on this so we don't
   *  answer a definitional question ("what is dns") with a random tool. */
  confident: boolean;
}

/**
 * Retrieve the top tools for a capability question. The `cards` go into the
 * model prompt ("answer using ONLY these tools"); the `tools` render as links.
 */
export function capabilityContext(query: string, k = 6): CapabilityContext {
  const ranked = searchTools(query, { limit: k });
  return {
    cards: ranked.map((r) => r.doc.card),
    tools: ranked.map((r) => ({ name: r.doc.name, href: r.doc.href, blurb: r.doc.blurb })),
    confident: confidence(ranked) !== 'weak',
  };
}
