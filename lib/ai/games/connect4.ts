/**
 * Connect Four engine — alpha-beta minimax (default depth 6) with a line-potential
 * heuristic. Strong enough to punish mistakes, fast enough for the browser
 * (≤7^6 nodes, pruned). Pure + Node-testable.
 *
 * Board: 6 rows × 7 cols, row 0 = TOP. Cell = 'R' | 'Y' | ' '. Human 'R', AI 'Y'
 * by convention (caller decides). Moves are COLUMN indices 0..6 (disc drops).
 */
export type C4Cell = 'R' | 'Y' | ' ';
export type C4Board = C4Cell[][]; // [row][col], 6×7

export const COLS = 7;
export const ROWS = 6;
export const newBoard = (): C4Board => Array.from({ length: ROWS }, () => Array(COLS).fill(' '));

export const legalMoves = (b: C4Board): number[] =>
  Array.from({ length: COLS }, (_, c) => c).filter((c) => b[0][c] === ' ');

/** Drop a disc into column `c`; returns the landing row, or -1 if the column is full.
 *  Mutates the board. */
export function drop(b: C4Board, c: number, p: C4Cell): number {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (b[r][c] === ' ') { b[r][c] = p; return r; }
  }
  return -1;
}

const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

/** Winner 'R'|'Y', 'draw' if full, else null. */
export function winner(b: C4Board): C4Cell | 'draw' | null {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = b[r][c];
      if (p === ' ') continue;
      for (const [dr, dc] of DIRS) {
        let n = 1;
        while (n < 4) {
          const rr = r + dr * n, cc = c + dc * n;
          if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || b[rr][cc] !== p) break;
          n++;
        }
        if (n === 4) return p;
      }
    }
  }
  return legalMoves(b).length ? null : 'draw';
}

const other = (p: C4Cell): C4Cell => (p === 'R' ? 'Y' : 'R');

// Heuristic: score every 4-cell window for `ai` (own discs good, opponent bad,
// center column slightly favored). Standard Connect-Four evaluation.
function evaluate(b: C4Board, ai: C4Cell): number {
  const opp = other(ai);
  let s = 0;
  for (let r = 0; r < ROWS; r++) if (b[r][3] === ai) s += 3; // center bias
  const windows: C4Cell[][] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    for (const [dr, dc] of DIRS) {
      const er = r + dr * 3, ec = c + dc * 3;
      if (er < 0 || er >= ROWS || ec < 0 || ec >= COLS) continue;
      windows.push([0, 1, 2, 3].map((n) => b[r + dr * n][c + dc * n]));
    }
  }
  for (const w of windows) {
    const me = w.filter((x) => x === ai).length;
    const them = w.filter((x) => x === opp).length;
    const empty = w.filter((x) => x === ' ').length;
    if (me && them) continue; // mixed window — dead
    if (me === 3 && empty === 1) s += 50;
    else if (me === 2 && empty === 2) s += 8;
    else if (them === 3 && empty === 1) s -= 60; // block opponent threats hard
    else if (them === 2 && empty === 2) s -= 8;
  }
  return s;
}

function negamax(b: C4Board, depth: number, alpha: number, beta: number, toMove: C4Cell, ai: C4Cell): number {
  const w = winner(b);
  if (w === ai) return 100000 + depth;
  if (w === other(ai)) return -100000 - depth;
  if (w === 'draw') return 0;
  if (depth === 0) return evaluate(b, ai);
  const sign = toMove === ai ? 1 : -1;
  // search center-out for better pruning
  const order = [3, 2, 4, 1, 5, 0, 6].filter((c) => b[0][c] === ' ');
  let best = -Infinity;
  for (const c of order) {
    const r = drop(b, c, toMove);
    const val = sign * negamax(b, depth - 1, alpha, beta, other(toMove), ai);
    b[r][c] = ' ';
    if (val > best) best = val;
    alpha = Math.max(alpha, val);
    if (alpha >= beta) break;
  }
  return sign * best;
}

/** The AI's best column (default depth 6), or -1 if the board is finished. */
export function bestMove(b: C4Board, ai: C4Cell, depth = 6): number {
  if (winner(b)) return -1;
  let bestC = -1, bestV = -Infinity;
  for (const c of [3, 2, 4, 1, 5, 0, 6].filter((x) => b[0][x] === ' ')) {
    const r = drop(b, c, ai);
    const v = negamax(b, depth - 1, -Infinity, Infinity, other(ai), ai);
    b[r][c] = ' ';
    if (v > bestV) { bestV = v; bestC = c; }
  }
  return bestC;
}
