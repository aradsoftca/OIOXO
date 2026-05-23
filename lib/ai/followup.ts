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

  return null;
}
