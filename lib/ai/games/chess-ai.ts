/**
 * Chess opponent — chess.js enforces LEGAL moves (no hallucinated/illegal moves,
 * the thing an LLM gets wrong); a small alpha-beta minimax with material +
 * piece-square evaluation picks the reply. Default depth 3 plays a respectable
 * casual game and stays fast in the browser. (stockfish.js WASM is the drop-in
 * strength upgrade later — same interface: FEN → best move.)
 *
 * Stateless: the React widget holds the FEN; this returns the engine's move as
 * { from, to, promotion } for the current side to move.
 */
import { Chess, type Move } from 'chess.js';

const VAL: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// Small piece-square table (pawns/knights) to give the engine a little positional
// sense — center control + knight centralization. Mirrored for black.
const PAWN_PST = [
  0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10,
  5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5,
  5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
];
const KNIGHT_PST = [
  -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30,
  -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50,
];

/** Static eval from WHITE's perspective (+ = white better), in centipawns. */
function evaluate(game: Chess): number {
  if (game.isCheckmate()) return game.turn() === 'w' ? -1_000_000 : 1_000_000;
  if (game.isDraw() || game.isStalemate()) return 0;
  let s = 0;
  const board = game.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (!sq) continue;
      const base = VAL[sq.type];
      const idx = r * 8 + c;
      let pst = 0;
      if (sq.type === 'p') pst = sq.color === 'w' ? PAWN_PST[idx] : PAWN_PST[63 - idx];
      else if (sq.type === 'n') pst = sq.color === 'w' ? KNIGHT_PST[idx] : KNIGHT_PST[63 - idx];
      s += (sq.color === 'w' ? 1 : -1) * (base + pst);
    }
  }
  return s;
}

function negamax(game: Chess, depth: number, alpha: number, beta: number, color: number): number {
  if (depth === 0 || game.isGameOver()) return color * evaluate(game);
  let best = -Infinity;
  // capture-first ordering improves pruning
  const moves = game.moves({ verbose: true }).sort((a, b) => (b.captured ? 1 : 0) - (a.captured ? 1 : 0));
  for (const m of moves) {
    game.move(m);
    const val = -negamax(game, depth - 1, -beta, -alpha, -color);
    game.undo();
    if (val > best) best = val;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

export interface EngineMove { from: string; to: string; promotion?: string; san: string; }

/** Best move for the side to move in `fen`, or null if the game is over.
 *  `depth` 2 = quick/easy, 3 = default casual, 4 = stronger (slower). */
export function bestMove(fen: string, depth = 3): EngineMove | null {
  const game = new Chess(fen);
  if (game.isGameOver()) return null;
  const color = game.turn() === 'w' ? 1 : -1;
  let best: Move | null = null, bestV = -Infinity;
  const moves = game.moves({ verbose: true }).sort((a, b) => (b.captured ? 1 : 0) - (a.captured ? 1 : 0));
  let alpha = -Infinity;
  for (const m of moves) {
    game.move(m);
    const v = -negamax(game, depth - 1, -Infinity, Infinity, -color);
    game.undo();
    if (v > bestV) { bestV = v; best = m; }
    if (v > alpha) alpha = v;
  }
  return best ? { from: best.from, to: best.to, promotion: best.promotion, san: best.san } : null;
}
