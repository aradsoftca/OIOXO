/**
 * oioxo Code — CHECKS-BEFORE-CODE (the weak-device magic, lever 3). A small model
 * in the loop is only as good as the oracle. For a type-checked module the
 * compiler is a dense oracle; for a web/UI build, "no runtime errors" is almost no
 * signal — a blank placeholder page "runs clean". recipes.ts authored behavioral
 * Checks, but only for 4 known kinds; ANY other goal got an EMPTY check list, so
 * the loop accepted the first thing that didn't crash.
 *
 * This derives behavioral acceptance checks from the GOAL ITSELF, for any task,
 * BEFORE coding — turning "it runs" into "it's actually the thing asked for".
 * Checks are far cheaper to produce than code and make the loop CONVERGE: each
 * failing check is exact, repairable signal the small model fixes against.
 *
 * Soundness over completeness: a check must NEVER fail a correct build (that would
 * make the loop loop forever), so every check is a tolerant PRESENCE/behaviour
 * probe, the list is capped, and authored recipe checks take precedence. Pure +
 * Node-testable; the `src` strings are evaluated inside the running preview by
 * preview-oracle.ts against the probe globals injected in webcontainer STATIC_SERVER
 * (`__oioxoFrames`, `__oioxoListeners`, `__oioxoCanvasPainted`).
 */
import { recipeFor, type Check } from './recipes';

/** A baseline every web build must meet: the page actually renders something. */
const CONTENT: Check = {
  name: 'the page shows content (not blank)',
  src: "(document.body && (document.body.textContent||'').trim().length > 0) || !!document.querySelector('canvas,svg,img,input,button,table')",
};

// Feature detectors: a keyword in the goal → the behavioural check(s) that prove
// the feature is really there. Tolerant presence probes (a correct build passes),
// referencing only DOM + the injected probe globals. Order = rough priority.
const DETECTORS: { test: RegExp; checks: Check[] }[] = [
  {
    test: /\b(canvas|game|draw|paint|sketch|particle|animat\w*|sprite|arcade)\b/i,
    checks: [
      { name: 'has a canvas', src: "!!document.querySelector('canvas')" },
      { name: 'an animation loop is running', src: '(window.__oioxoFrames||0) > 3' },
      { name: 'the canvas draws real content (not blank)', src: 'window.__oioxoCanvasPainted === true' },
    ],
  },
  {
    test: /\b(button|click|tap|press|submit|increment|increase|decrease|counter button)\b/i,
    checks: [
      { name: 'has a button', src: "!!document.querySelector('button,[type=submit],[type=button],[role=button]')" },
      { name: 'responds to clicks', src: "(window.__oioxoListeners||[]).some(function(t){return /click|pointer|mouse|touch/.test(t)}) || !!document.querySelector('[onclick]')" },
    ],
  },
  {
    test: /\b(form|sign ?up|sign ?in|log ?in|register|contact|survey|subscribe|checkout)\b/i,
    checks: [
      { name: 'has form fields', src: "document.querySelectorAll('input,select,textarea').length > 0" },
      { name: 'has a submit control', src: "!!document.querySelector('button,[type=submit]')" },
    ],
  },
  {
    test: /\b(input|field|text ?box|search box|prompt|enter (a|your|some)|type in)\b/i,
    checks: [{ name: 'has a text input', src: "!!document.querySelector('input,textarea')" }],
  },
  {
    test: /\b(list|todo|to-do|task list|items|checklist|feed|catalog|notes)\b/i,
    checks: [{ name: 'has a list', src: "!!document.querySelector('ul,ol,li,[role=list]')" }],
  },
  {
    test: /\b(table|grid|spreadsheet|rows|columns)\b/i,
    checks: [{ name: 'has a table', src: "!!document.querySelector('table')" }],
  },
  {
    test: /\b(image|images|photo|photos|picture|pictures|gallery|img|avatar|thumbnail)\b/i,
    checks: [{ name: 'has an image', src: "!!document.querySelector('img,svg,picture,[style*=background-image]')" }],
  },
  {
    test: /\b(keyboard|arrow keys?|wasd|keypress|keydown|move with)\b/i,
    checks: [{ name: 'responds to the keyboard', src: "(window.__oioxoListeners||[]).some(function(t){return /key/.test(t)})" }],
  },
  {
    test: /\b(video|audio|music player|movie|player|playback)\b/i,
    checks: [{ name: 'has a media player', src: "!!document.querySelector('video,audio')" }],
  },
  {
    test: /\b(nav|navbar|navigation|menu|links?|router|multi-?page)\b/i,
    checks: [{ name: 'has navigation', src: "!!document.querySelector('a[href],nav,[role=navigation]')" }],
  },
  {
    test: /\b(toggle|switch|dark ?mode|theme|on\/off)\b/i,
    checks: [{ name: 'has a toggle control', src: "!!document.querySelector('input[type=checkbox],[role=switch]') || document.querySelectorAll('button').length > 0" }],
  },
  {
    test: /\b(slider|range|volume|brightness)\b/i,
    checks: [{ name: 'has a slider', src: "!!document.querySelector('input[type=range]')" }],
  },
  {
    test: /\b(counter|count|score|timer|clock|stopwatch|tally|points|total)\b/i,
    checks: [{ name: 'shows a number', src: "/\\d/.test((document.body && document.body.textContent) || '')" }],
  },
  {
    test: /\b(chart|graph|plot|dashboard|analytics|stats|histogram|bar chart|pie chart)\b/i,
    checks: [{ name: 'has a chart surface', src: "!!document.querySelector('canvas,svg,table')" }],
  },
];

/** Merge check lists, first occurrence wins, deduped by name AND by src (so an
 *  authored recipe check and a derived one for the same thing don't double up). */
export function mergeChecks(...lists: Check[][]): Check[] {
  const out: Check[] = [];
  const names = new Set<string>();
  const srcs = new Set<string>();
  for (const list of lists) {
    for (const c of list) {
      const n = c.name.toLowerCase();
      if (names.has(n) || srcs.has(c.src)) continue;
      names.add(n); srcs.add(c.src);
      out.push(c);
    }
  }
  return out;
}

/**
 * Behavioral acceptance checks for a goal — for ANY task, not just recipe kinds.
 * Authored recipe checks (highest quality) come first, then the baseline
 * content check, then the features the goal names. Capped so the oracle is dense
 * but still satisfiable by a weak model (too many checks = never converges).
 */
export function deriveChecks(goal: string, opts: number | { cap?: number; quality?: boolean } = 6): Check[] {
  const cap = typeof opts === 'number' ? opts : opts.cap ?? 6;
  const quality = typeof opts === 'number' ? false : !!opts.quality;
  const matched: Check[][] = [];
  for (const d of DETECTORS) if (d.test.test(goal)) matched.push(d.checks);
  const recipe = recipeFor(goal)?.checks ?? [];
  const feature = mergeChecks(recipe, [CONTENT], ...matched).slice(0, cap);
  // Quality gates are sound (vacuous when absent), so they extend BEYOND the cap
  // rather than crowding out feature checks.
  return quality ? mergeChecks(feature, QUALITY_CHECKS) : feature;
}

/* ── Quality gates (roadmap #5: judge "good", not just "runs") ─────────────────
 * Accessibility/quality checks that are SOUND BY CONSTRUCTION: each is vacuously
 * true when its element type is absent (`.every()` over an empty set), so it never
 * fails a correct minimal build — it only fires when the thing it guards exists and
 * is done wrong (an image with no alt, a button with no label). Opt-in via
 * `deriveChecks(goal, { quality: true })`. */
export const QUALITY_CHECKS: Check[] = [
  { name: 'images have alt text', src: "Array.prototype.every.call(document.querySelectorAll('img'), function(i){return i.getAttribute('alt')!==null})" },
  { name: 'buttons have a label', src: "Array.prototype.every.call(document.querySelectorAll('button'), function(b){return (b.textContent||'').trim().length>0 || b.getAttribute('aria-label')})" },
  { name: 'links have text', src: "Array.prototype.every.call(document.querySelectorAll('a'), function(a){return (a.textContent||'').trim().length>0 || a.getAttribute('aria-label')})" },
  { name: 'inputs are labelled', src: "Array.prototype.every.call(document.querySelectorAll('input,select,textarea'), function(el){return el.getAttribute('aria-label')||el.getAttribute('placeholder')||el.id&&document.querySelector('label[for=\"'+el.id+'\"]')||el.closest('label')})" },
  { name: 'no console errors at load', src: "(window.__oioxoConsoleErrors||0)===0" },
];

/** Accessibility/quality checks (the sound subset). Append to feature checks for a
 *  "quality mode" build that's verified to be well-formed, not just functional. */
export function qualityChecks(): Check[] {
  return [...QUALITY_CHECKS];
}

export type { Check };
