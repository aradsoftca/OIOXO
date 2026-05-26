/**
 * oioxo AI — the conversation MOVE policy (ANSWER_BRAIN.md §2).
 *
 * A real assistant reads the room every turn and picks a MOVE using the
 * conversation so far — it does not classify-and-dump. Search is a move INSIDE a
 * conversation, not a replacement for it:
 *
 *   "i want to go back to school"  → talk   → warm encouragement, no search
 *   "i need money for school"      → offer  → acknowledge + look it up (localized)
 *
 * IMPORTANT — this is a deliberately THIN deterministic FLOOR, not a regex brain.
 * The real move decision is the trained ENCODER (Track B), which reads any
 * phrasing + history → the move. Per the reliability contract this floor only has
 * to be never-worse-than-today; the encoder refines it. So we keep the signals
 * few and structural, NOT a growing catalog of phrases.
 */

export type Move = 'talk' | 'offer' | 'answer' | 'route';
export interface Turn {
  role: 'user' | 'assistant';
  text: string;
}
export interface MovePlan {
  move: Move;
  /** The need/topic to look up (offer), carried with conversation context. */
  topic?: string;
}
export interface ConverseCtx {
  history?: Turn[];
  /** Coarse locale label for "in your area" framing ("your area" if unknown). */
  locale?: string;
}

const isQuestion = (t: string) =>
  /\?\s*$/.test(t) ||
  /^\s*(who|what|why|how|when|where|which|whom|whose|is|are|was|were|does|do|did|can|could|should|would|will|has|have)\b/i.test(t) ||
  // embedded info-seeking — "… where do I start", "… how do I begin", "how to …"
  /\b(how|where|what|which)\s+(do|should|can|could|would|to)\s+(i|you)?\b/i.test(t) ||
  /\b(where\s+(do|to)\s+i?\s*start|where\s+to\s+begin|how\s+to\b|tips?\s+(for|on)\b|advice\s+(for|on)\b|help\s+me\b)/i.test(t);

// Structural cue: a RESOURCE need — needing a THING, not aspiring to DO something.
// "i need <noun>" (not "i need TO <verb>"), "looking for …", "how do i
// get/afford/find …". An aspiration ("i want to go back to school") is NOT this —
// it's a goal to encourage (talk). The noun is whatever follows, not a list.
// "i need help <doing X>" is a TASK request (route to the tool/answer), not a
// resource to look up locally — so exclude "to" (aspiration) and "help" (assistance).
const NEED_RE = /\b(i need(?!\s+(to|help)\b)|i'?m looking for|looking for|how (do|can) i (get|find|afford|pay for|buy)|where (do|can) i (get|find|buy))\b/i;

// A short personal/emotional statement or ASPIRATION (no question, no resource
// need) — the "talk" turn (encourage, relate, no search).
const PERSONAL_RE = /\b(i (feel|think|believe|want to|wanna|wish|hope|love|hate|miss|am|'m|decided|plan to|'?d (like|love) to)|i'?ve been|my )\b/i;

/** Pull the subject of a stated need into a searchable topic, carrying the
 *  conversation's running subject when the need is bare ("i need money" after
 *  "back to school" → "money for school"). Floor-level; the encoder does this
 *  far better with real understanding. */
function needTopic(text: string, history?: Turn[]): string {
  let topic = text
    .replace(NEED_RE, '')
    .replace(/^\s*(some|a|an|the|to)\s+/i, '')
    .replace(/[?.!]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // If the need is short/bare, ground it in the last user topic ("money" → keep
  // the prior subject as context so the search is "money for <prior>").
  const lastUser = [...(history ?? [])].reverse().find((t) => t.role === 'user' && t.text.trim() && !NEED_RE.test(t.text));
  if (lastUser && topic.split(/\s+/).length <= 2) {
    const prior = lastUser.text.replace(/[?.!]+$/g, '').replace(/^\s*i\s+(want to|need to|wish i could)\s+/i, '').trim();
    if (prior && !topic.toLowerCase().includes(prior.toLowerCase())) topic = `${topic} for ${prior}`;
  }
  return topic;
}

/**
 * Decide this turn's move. THIN floor:
 *   - a question / actionable request → let the existing router handle it (route)
 *   - a stated need → offer to look it up (search-and-weave with an acknowledgement)
 *   - a personal/emotional statement → talk (persona reply, no search)
 *   - everything else → route (the default answer/tool pipeline)
 */
export function decideMove(message: string, ctx: ConverseCtx = {}): MovePlan {
  const text = message.trim();
  if (!text) return { move: 'talk' };

  // A stated need that is NOT phrased as a direct question → offer to search.
  if (NEED_RE.test(text) && !isQuestion(text)) {
    const topic = needTopic(text, ctx.history);
    if (topic) return { move: 'offer', topic };
  }

  // A short personal/emotional statement with no question and no need → talk.
  if (!isQuestion(text) && PERSONAL_RE.test(text) && text.split(/\s+/).length <= 14) {
    return { move: 'talk' };
  }

  return { move: 'route' };
}

/** A localized, acknowledging preface for an OFFER turn ("Let me look up what
 *  options exist in your area …"). Floor copy; writer8 + persona make it sing. */
export function offerPreface(topic: string, locale?: string): string {
  const where = locale && locale.trim() ? locale.trim() : 'your area';
  return `Good goal — let me look up the options for **${topic}** in ${where}.`;
}
