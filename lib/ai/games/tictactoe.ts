/**
 * Tic-Tac-Toe engine — PERFECT play via full minimax (the tree is tiny: ≤9!).
 * The AI never loses; the best a human gets is a draw. Pure + Node-testable.
 *
 * Board is a 9-char string of 'X' | 'O' | ' ' (index 0..8, row-major).
 */
export type TTTCell = 'X' | 'O' | ' ';
export type TTTBoard = TTTCell[];

export const newBoard = (): TTTBoard => Array(9).fill(' ');

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6],            // diagonals
];

/** 'X' | 'O' if someone won, 'draw' if full, else null (game continues). */
export function winner(b: TTTBoard): 'X' | 'O' | 'draw' | null {
  for (const [a, c, d] of LINES) {
    if (b[a] !== ' ' && b[a] === b[c] && b[c] === b[d]) return b[a] as 'X' | 'O';
  }
  return b.includes(' ') ? null : 'draw';
}

export const legalMoves = (b: TTTBoard): number[] =>
  b.map((c, i) => (c === ' ' ? i : -1)).filter((i) => i >= 0);

const other = (p: 'X' | 'O'): 'X' | 'O' => (p === 'X' ? 'O' : 'X');

/** Minimax score for `ai` to move on board `b`. +10/-10 weighted by depth so the
 *  engine prefers faster wins and slower losses (more human-like + decisive). */
function score(b: TTTBoard, ai: 'X' | 'O', toMove: 'X' | 'O', depth: number): number {
  const w = winner(b);
  if (w === ai) return 10 - depth;
  if (w === other(ai)) return depth - 10;
  if (w === 'draw') return 0;
  const moves = legalMoves(b);
  if (toMove === ai) {
    let best = -Infinity;
    for (const m of moves) { b[m] = toMove; best = Math.max(best, score(b, ai, other(toMove), depth + 1)); b[m] = ' '; }
    return best;
  }
  let best = Infinity;
  for (const m of moves) { b[m] = toMove; best = Math.min(best, score(b, ai, other(toMove), depth + 1)); b[m] = ' '; }
  return best;
}

/** The AI's optimal move index, or -1 if the board is finished. */
export function bestMove(b: TTTBoard, ai: 'X' | 'O'): number {
  if (winner(b)) return -1;
  let bestM = -1, bestS = -Infinity;
  for (const m of legalMoves(b)) {
    b[m] = ai;
    const s = score(b, ai, other(ai), 1);
    b[m] = ' ';
    if (s > bestS) { bestS = s; bestM = m; }
  }
  return bestM;
}
