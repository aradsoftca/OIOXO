/**
 * Xonvert AI — proactive next-step suggestions (Task Brain, layer 4).
 *
 * A real assistant doesn't just answer and stop — it notices what you might want
 * next. After a factual answer about a topic ("how is David Beckham"), it offers
 * the things the catalog can do *with that topic*: a poster, a PDF, a QR to the
 * source. After producing a file, it offers the obvious follow-ups. These are
 * re-runnable phrases the existing pipeline already handles, so tapping one just
 * runs it. Pure / DOM-free.
 */

/** Suggestions to offer after answering a factual question about `topic`. */
export function suggestAfterAnswer(topic: string): string[] {
  const t = topic.replace(/^(who|what|how|why|where|when)\s+(is|are|was|were|did|does)\s+/i, '').trim() || topic;
  const short = t.length > 40 ? t.slice(0, 40).replace(/\s+\S*$/, '') : t;
  return [`make a poster about ${short}`, `save this as a PDF`];
}

/** True if a tapped suggestion means "turn the answer I just gave into a PDF". */
export function isSaveAsPdf(text: string): boolean {
  return /\b(save (this|that|it)? ?as (a )?pdf|make (a )?pdf (of|from) (this|that|the answer)|export (this|that) (to|as) pdf)\b/i.test(text);
}
