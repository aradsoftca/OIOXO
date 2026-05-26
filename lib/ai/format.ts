/**
 * format — honor an output-format directive in the user's message (maturity #4).
 *
 * "briefly", "in 3 sentences", "in bullet points", "as a list" → shape the prose
 * answer accordingly. Deterministic floor for the directives a floor can do well
 * (length / bullets); the subtler ones (one-word, yes/no, table) are left to the
 * trained writer's style-conditioning. Never touches already-structured answers
 * (markdown lists / code / tables) — their shape is intentional. Pure / Node-testable.
 */
export interface FmtDirective { form: 'bullets' | 'brief' | 'sentences' | null; n?: number }

const N_SENTENCES = /\bin\s+(\d+)\s+sentences?\b/i;
const BULLETS = /\b(in\s+bullet\s*points?|as\s+(a\s+)?bulleted?\s*list|bullet\s*points?|as\s+a\s+list|in\s+a\s+list|list\s+(it|them|these|out))\b/i;
const BRIEF = /\b(brief(ly)?|in\s+short|short\s+answer|keep\s+it\s+(short|brief)|in\s+(a|one)\s+(sentence|line)|one\s+sentence|tl;?dr|just\s+the\s+gist|in\s+a\s+nutshell)\b/i;

/** Detect an output-format directive in the user's message (null when none). */
export function detectFormat(text: string): FmtDirective {
  const m = text.match(N_SENTENCES);
  if (m) return { form: 'sentences', n: Math.max(1, Math.min(8, Number(m[1]))) };
  if (BULLETS.test(text)) return { form: 'bullets' };
  if (BRIEF.test(text)) return { form: 'brief' };
  return { form: null };
}

function sentences(t: string): string[] {
  return (t.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [t])
    .map((s) => s.trim()).filter((s) => s.length > 1);
}

/** Reshape a PROSE answer to the requested format. Leaves structured/code answers
 *  and anything with no directive untouched. */
export function renderFormat(answer: string, d: FmtDirective): string {
  const a = (answer || '').trim();
  if (!d.form || !a) return answer;
  if (/^[#*\-•>`|]|```|^\d+[.)]\s/.test(a)) return answer; // already a list / code / table
  const ss = sentences(a);
  if (d.form === 'brief') return ss[0] || a;
  if (d.form === 'sentences') return ss.slice(0, d.n || 2).join(' ') || a;
  if (d.form === 'bullets') {
    const items = ss.slice(0, 6).map((s) => '• ' + s.replace(/[.!?]+$/, '').trim());
    return items.length > 1 ? items.join('\n') : a;
  }
  return answer;
}
