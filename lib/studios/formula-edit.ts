/**
 * Formula-authoring affordances shared by the cell editor and the formula bar:
 *  - F4 cycles the cell reference under the cursor through the four $-anchor
 *    forms (A1 → $A$1 → A$1 → $A1 → A1), like Excel/Sheets.
 *  - autocomplete suggests function names as you type after '='.
 *
 * Pure string helpers so they're trivial to test and reuse.
 */

import { FORMULA_NAMES } from './formulas';

const REF_RE = /(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})/g;

/** Cycle a single A1-style ref string through the 4 anchor forms. */
function cycleRef(col$: string, col: string, row$: string, row: string): string {
  // state machine: relative → both → row-abs → col-abs → relative
  const both = col$ === '$' && row$ === '$';
  const rowAbs = col$ === '' && row$ === '$';
  const colAbs = col$ === '$' && row$ === '';
  if (!both && !rowAbs && !colAbs) return `$${col}$${row}`;     // A1   → $A$1
  if (both) return `${col}$${row}`;                              // $A$1 → A$1
  if (rowAbs) return `$${col}${row}`;                            // A$1  → $A1
  return `${col}${row}`;                                         // $A1  → A1
}

/**
 * Given the current formula text + caret position, find the reference the caret
 * sits in/just after and cycle its anchor. Returns the new value + new caret, or
 * null if the caret isn't on a reference (caller leaves the F4 a no-op).
 */
export function cycleAnchorAtCaret(value: string, caret: number): { value: string; caret: number } | null {
  if (!value.startsWith('=')) return null;
  REF_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = REF_RE.exec(value)) !== null) {
    const start = m.index, end = start + m[0].length;
    // Caret inside the ref, or immediately after it (Excel accepts both).
    if (caret >= start && caret <= end) {
      const cycled = cycleRef(m[1], m[2], m[3], m[4]);
      const next = value.slice(0, start) + cycled + value.slice(end);
      return { value: next, caret: start + cycled.length };
    }
  }
  return null;
}

/**
 * Function-name autocomplete. Returns matches for the partial name the caret is
 * currently typing (the run of A-Z letters ending at the caret, right after '='
 * or an operator/paren/comma), plus the range to replace on accept. null when
 * there's nothing to suggest.
 */
export function functionSuggestions(value: string, caret: number, limit = 8): {
  matches: string[]; replaceStart: number; replaceEnd: number;
} | null {
  if (!value.startsWith('=')) return null;
  // The partial token = trailing letters up to the caret.
  let s = caret;
  while (s > 0 && /[A-Za-z]/.test(value[s - 1])) s--;
  const token = value.slice(s, caret);
  if (token.length < 1) return null;
  // Only suggest when the token starts a function position: at '=' or right
  // after an operator / '(' / ',' / space (not in the middle of a cell ref like A12).
  const before = value.slice(0, s).trimEnd();
  const prev = before[before.length - 1];
  const atFnPos = before === '=' || (prev !== undefined && '=+-*/^(,&<>%'.includes(prev));
  if (!atFnPos) return null;
  const up = token.toUpperCase();
  const matches = FORMULA_NAMES.filter(n => n.startsWith(up)).slice(0, limit);
  if (!matches.length || (matches.length === 1 && matches[0] === up)) return null;
  return { matches, replaceStart: s, replaceEnd: caret };
}

/** Accept a suggestion: splice the function name + '(' into the value. */
export function acceptSuggestion(value: string, replaceStart: number, replaceEnd: number, name: string): { value: string; caret: number } {
  const inserted = `${name}(`;
  const next = value.slice(0, replaceStart) + inserted + value.slice(replaceEnd);
  return { value: next, caret: replaceStart + inserted.length };
}
