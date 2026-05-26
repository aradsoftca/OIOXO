/**
 * Xonvert AI — conversational follow-up resolution.
 *
 * What makes an assistant feel alive across a conversation: it remembers what
 * you were just talking about. "Who is Einstein?" → answer → "where was he
 * born?" should know "he" = Einstein. We resolve pronouns and bare
 * continuations against the last topic, rewriting the message into a standalone
 * query the search engine can answer. Pure / Node-testable.
 */

// Subject/object pronouns that, in a follow-up, refer back to the last topic.
const SUBJECT_PRONOUN = /\b(he|him|she|they|them|it)\b/gi;
const POSSESSIVE = /\b(his|her|its|their|hers|theirs)\b/gi;
// A pronoun anywhere signals the message leans on prior context.
const HAS_PRONOUN = /\b(he|him|his|she|her|hers|it|its|they|them|their|theirs)\b/i;
// Bare continuations: "and the population?", "what about its height?".
const CONTINUATION = /^\s*(and|also|but|so|then|what about|how about|what of)\b/i;
// A message that introduces its OWN clear subject isn't a context-dependent
// follow-up (a capitalised proper noun, or a quoted/explicit entity).
const HAS_OWN_SUBJECT = /\b[A-Z][a-z]{3,}\b/;
// ELLIPTICAL interrogative follow-up about an OWNER-REQUIRING attribute:
// "what's the capital", "who's the president", "what's the population" after a topic
// clearly mean "<topic>'s capital/…". Bounded to relational attributes that need an
// owner, so a self-contained question ("what's the meaning of life", "what's the best
// laptop") never matches → no new dumbness, only resolves the genuinely elliptical.
const ELLIPTICAL_Q =
  /^\s*(what(?:'?s| is| are| was| were)?|who(?:'?s| is| was)?|when (?:was|is|did)|where (?:is|was))\b/i;
const RELATIONAL_ATTR =
  /\b(capital|population|currency|languages?|president|prime minister|ceo|founder|mayor|king|queen|area|height|weight|age|gdp|economy|climate|weather|time ?zone|flag|anthem|religion|leader|governor|nickname|motto|borders?|continent|region)\b/i;

/**
 * Rewrite a follow-up into a standalone query using `lastTopic`, or null if the
 * message stands on its own (or there's no topic to resolve against).
 */
export function rewriteFollowup(text: string, lastTopic: string | null): string | null {
  if (!lastTopic) return null;
  const t = text.trim();
  const words = t.split(/\s+/).length;
  if (words > 14) return null; // long, self-contained question — don't touch

  if (HAS_PRONOUN.test(t)) {
    // Replace pronouns with the topic so the query is self-contained.
    const q = t
      .replace(POSSESSIVE, `${lastTopic}'s`)
      .replace(SUBJECT_PRONOUN, lastTopic)
      .replace(/\s+/g, ' ')
      .trim();
    return q === t ? null : q;
  }

  // Bare continuation with no subject of its own → attach the topic.
  if (CONTINUATION.test(t) && !HAS_OWN_SUBJECT.test(t)) {
    const tail = t.replace(CONTINUATION, '').replace(/^\s*(the|a|an)\s+/i, '').replace(/[?.!]+$/g, '').trim();
    return tail ? `${lastTopic} ${tail}` : null;
  }

  // Elliptical interrogative about an owner-requiring attribute → "<topic> <attr>".
  // Only when the attribute TRAILS OFF (nothing completes it): "what's the capital"
  // resolves, but "what's the capital OF australia" already names its owner → leave it.
  if (ELLIPTICAL_Q.test(t) && !HAS_OWN_SUBJECT.test(t)) {
    const m = t.match(RELATIONAL_ATTR);
    if (m) {
      const after = t.slice((m.index ?? 0) + m[0].length).replace(/[?.!]+$/g, '').trim();
      if (!after || /^(again|now|then|please|too|currently)$/i.test(after)) {
        return `${lastTopic} ${m[0].trim()}`;
      }
    }
  }

  return null;
}
