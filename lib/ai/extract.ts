/**
 * Xonvert AI — structured extraction (the "frontier on find-and-respond" magic).
 *
 * The best recipe / how-to / definition already exists on the web, written by an
 * expert — better than any model could author. So instead of asking the 0.5B to
 * GENERATE an answer, we FIND the best page, read it, and PULL OUT the structured
 * answer it already contains: a recipe's ingredients + steps, a how-to's numbered
 * steps, a definition, a code block. Present that, cited. The model authors
 * nothing; the expert content is the answer.
 *
 * Pure / DOM-free: takes the reader's markdown, returns clean markdown — so the
 * whole thing (e.g. "cupcake recipe" → real ingredients + steps) is Node-testable.
 */

export type AnswerType = 'recipe' | 'howto' | 'code' | 'definition' | 'general';

const RECIPE_CUE = /\b(recipe|how (do|to) (i )?(make|bake|cook|prepare)|ingredients for|how (is|are) .* (made|baked|cooked))\b/i;
const HOWTO_CUE = /\b(how (do|to|can) (i|you)?\s|step by step|tutorial|guide to|instructions for|how to|steps to)\b/i;
const CODE_CUE = /\b(code|function|snippet|regex|syntax|how to (write|code|implement))\b/i;
// A programming language named alongside a coding verb → a code question
// ("python read a file", "javascript sort an array"), which the literal CODE_CUE
// misses.
const LANG = /\b(python|javascript|typescript|node(?:js)?|java|rust|golang|go|sql|bash|shell|php|ruby|c\+\+|c#|kotlin|swift|html|css|react)\b/i;
const CODE_VERB = /\b(read|write|loop|print|parse|sort|reverse|split|append|function|array|string|file|class|method|import|install|connect|query|regex|snippet|example|syntax|error)\b/i;
const DEFINE_CUE = /\b(what (is|are|does)|define|definition of|meaning of|what'?s)\b/i;

/** Classify the kind of answer a question wants, to pick an extraction strategy. */
export function detectAnswerType(query: string): AnswerType {
  if (RECIPE_CUE.test(query)) return 'recipe';
  if (CODE_CUE.test(query) || (LANG.test(query) && CODE_VERB.test(query))) return 'code';
  if (HOWTO_CUE.test(query)) return 'howto';
  if (DEFINE_CUE.test(query)) return 'definition';
  return 'general';
}

// --- markdown helpers -------------------------------------------------------

/** Index of the first heading line whose text matches `re`, from `start`. */
function headingIdx(lines: string[], re: RegExp, start = 0): number {
  for (let i = start; i < lines.length; i++) {
    const h = lines[i].match(/^#{1,6}\s+(.*)$/);
    if (h && re.test(h[1])) return i;
  }
  return -1;
}

/** Strip markdown links/images/bold from a line → readable text. */
function clean(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** List/step items in a section's lines (bullets or numbered), cleaned. */
function items(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const m = raw.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (m) { const t = clean(m[1]); if (t.length > 1) out.push(t); }
  }
  return out;
}

// Headings that mark the END of the steps block on a typical recipe/how-to page
// (everything useful comes before them).
const END_CUE = /\b(tips?|notes?|store|storage|nutrition|video|watch|faq|frequently|can i|related|more recipes|comments?|navigation|reviews?|variations?|substitutions?)\b/i;

// --- per-type extraction ----------------------------------------------------

/**
 * A recipe = the ingredients list + the steps. Recipe sites nest ingredients
 * under sub-headings ("Cupcake Ingredients" → "For the Frosting" → bullets), so
 * we collect ALL list items in the RANGE between the ingredients heading and the
 * method heading (and steps from the method heading to the first wrap-up
 * section), ignoring intervening sub-headings.
 */
function extractRecipe(md: string): string | null {
  const lines = md.split('\n');
  const ingI = headingIdx(lines, /\bingredients?\b/i);
  const methodI = headingIdx(lines, /\b(how to make|instructions?|directions?|method|preparation|steps)\b/i, ingI >= 0 ? ingI : 0);
  if (ingI < 0 || methodI < 0 || methodI <= ingI) return null;
  let endI = -1;
  for (let i = methodI + 1; i < lines.length; i++) {
    const h = lines[i].match(/^#{1,4}\s+(.*)$/);
    if (h && END_CUE.test(h[1])) { endI = i; break; }
  }
  const ingList = items(lines.slice(ingI + 1, methodI));
  const stepList = items(lines.slice(methodI + 1, endI > 0 ? endI : methodI + 120));
  if (ingList.length < 2 || stepList.length < 2) return null;
  return ['**Ingredients**', ...ingList.slice(0, 30).map((i) => `• ${i}`), '', '**Steps**', ...stepList.slice(0, 25).map((s, i) => `${i + 1}. ${s}`)].join('\n');
}

/** A how-to = the ordered steps. Take the longest run of list items on the page,
 *  preferring one under a steps/instructions heading. */
function extractHowto(md: string): string | null {
  const lines = md.split('\n');
  let best: string[] = [];
  const stepsI = headingIdx(lines, /\b(steps|instructions?|directions?|how to|guide|method)\b/i);
  if (stepsI >= 0) {
    let endI = -1;
    for (let i = stepsI + 1; i < lines.length; i++) { const h = lines[i].match(/^#{1,4}\s+(.*)$/); if (h && END_CUE.test(h[1])) { endI = i; break; } }
    best = items(lines.slice(stepsI + 1, endI > 0 ? endI : stepsI + 80));
  }
  if (best.length < 3) {
    // Fallback: scan the whole doc for the densest contiguous list.
    const all = items(lines);
    if (all.length > best.length) best = all;
  }
  if (best.length < 3) return null;
  return ['**Steps**', ...best.slice(0, 15).map((s, i) => `${i + 1}. ${s}`)].join('\n');
}

/** A code answer = the first substantial fenced code block. */
function extractCode(md: string): string | null {
  const m = md.match(/```[\w-]*\n([\s\S]*?)```/);
  if (m && m[1].trim().length > 12) return '```\n' + m[1].trim().slice(0, 1200) + '\n```';
  return null;
}

/**
 * Try to pull the structured answer the page already contains, for this type.
 * Returns clean markdown, or null to fall back to summary/synthesis.
 */
export function extractStructured(md: string, type: AnswerType): string | null {
  switch (type) {
    case 'recipe': return extractRecipe(md);
    case 'howto': return extractHowto(md) ?? extractRecipe(md);
    case 'code': return extractCode(md);
    default: return null;
  }
}
