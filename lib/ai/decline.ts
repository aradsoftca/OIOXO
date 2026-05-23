/**
 * Xonvert AI — honest decline.
 *
 * When the AI genuinely can't do what was asked, the right move isn't to force a
 * wrong tool (the old "make image of X" → abstract art) or to bluff — it's to
 * say so plainly and offer the closest real capability. Small, pure helpers that
 * return a friendly message plus re-runnable suggestion chips.
 */

export interface Decline {
  /** The honest message to show. */
  message: string;
  /** One-tap follow-up phrases that DO map to real capabilities. */
  suggestions: string[];
}

/** Pull the subject out of "make a picture of/about <subject>" for a warmer reply. */
export function mediaSubject(text: string): string {
  const m = text.match(/\b(?:of|about|showing|depicting|featuring|with)\s+(.+?)[?.!]*\s*$/i);
  return (m?.[1] ?? '').trim();
}

/**
 * "Draw/make me an image of <subject>" — we can't synthesize a real depiction.
 * Be honest, then point at the picture-related things we genuinely do.
 */
export function declineMediaSubject(text: string): Decline {
  const subj = mediaSubject(text);
  const about = subj ? ` of “${subj}”` : '';
  return {
    message:
      `I can't paint or photograph a picture${about} from scratch — I'm not an image generator. ` +
      `What I'm great at is working with images you already have, and making graphics from text. Here's what I can do:`,
    suggestions: [
      subj ? `make a poster that says ${subj}` : 'make a poster with my text',
      'make a QR code',
      'remove the background from a photo',
      'find a placeholder image',
    ],
  };
}

/**
 * A factual/opinion/live-data question the answer engine couldn't ground (no
 * solid source found). Admit it rather than letting the tiny model invent facts.
 */
export function declineNoAnswer(): Decline {
  return {
    message:
      "I couldn't find a solid, citable answer for that, so I won't guess. " +
      'I can search the web, work with your files, or run any of the 300+ tools — tell me what you need.',
    suggestions: [],
  };
}
