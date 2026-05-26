'use client';

/**
 * In-chat game board — renders an interactive game right in the conversation.
 * Deterministic on-device engines play the opponent (lib/ai/games/*); the LLM is
 * never asked to play (it can't legally). The opponent's move runs in a short
 * timeout so the player's move paints first and a "thinking…" beat feels natural.
 */
import * as React from 'react';
import { Chess } from 'chess.js';
import * as ttt from '@/lib/ai/games/tictactoe';
import * as c4 from '@/lib/ai/games/connect4';
import { bestMove as chessBest } from '@/lib/ai/games/chess-ai';
import * as wordle from '@/lib/ai/games/wordle';
import * as rps from '@/lib/ai/games/rps';
import { gameByKind, type GameKind } from '@/lib/ai/games';

export default function GameBoard({ kind }: { kind: GameKind }) {
  const meta = gameByKind(kind);
  return (
    <div className="my-1 w-full max-w-[360px] rounded-2xl border border-zinc-800 bg-zinc-900 p-3 text-white">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <span>🎮</span><span>{meta.name}</span>
      </div>
      {kind === 'tictactoe' && <TicTacToe />}
      {kind === 'connect4' && <ConnectFour />}
      {kind === 'chess' && <ChessGame />}
      {kind === 'wordle' && <Wordle />}
      {kind === 'rps' && <RockPaperScissors />}
    </div>
  );
}

function Bar({ status, onReset }: { status: string; onReset: () => void }) {
  return (
    <div className="mt-2 flex items-center justify-between text-xs">
      <span className="text-white/70">{status}</span>
      <button onClick={onReset} className="rounded-lg bg-white/10 px-2.5 py-1 font-medium text-white/80 hover:bg-white/20">New game</button>
    </div>
  );
}

// ── Tic-Tac-Toe ────────────────────────────────────────────────────────────
function TicTacToe() {
  const [board, setBoard] = React.useState<ttt.TTTBoard>(ttt.newBoard);
  const [busy, setBusy] = React.useState(false);
  const w = ttt.winner(board);
  const status = w === 'X' ? 'You win! 🎉' : w === 'O' ? 'I win 😄' : w === 'draw' ? 'Draw — well played!' : busy ? 'Thinking…' : 'Your move (X)';

  const play = (i: number) => {
    if (board[i] !== ' ' || w || busy) return;
    const b = board.slice(); b[i] = 'X'; setBoard(b);
    if (ttt.winner(b)) return;
    setBusy(true);
    setTimeout(() => {
      const m = ttt.bestMove(b, 'O');
      if (m >= 0) { const nb = b.slice(); nb[m] = 'O'; setBoard(nb); }
      setBusy(false);
    }, 280);
  };
  return (
    <>
      <div className="grid grid-cols-3 gap-1.5">
        {board.map((c, i) => (
          <button key={i} onClick={() => play(i)} disabled={c !== ' ' || !!w || busy}
            className="flex aspect-square items-center justify-center rounded-xl bg-white/[0.04] text-2xl font-bold hover:bg-white/10 disabled:hover:bg-white/[0.04]">
            <span className={c === 'X' ? 'text-sky-400' : 'text-rose-400'}>{c !== ' ' ? c : ''}</span>
          </button>
        ))}
      </div>
      <Bar status={status} onReset={() => { setBoard(ttt.newBoard()); setBusy(false); }} />
    </>
  );
}

// ── Connect Four ───────────────────────────────────────────────────────────
function ConnectFour() {
  const [board, setBoard] = React.useState<c4.C4Board>(c4.newBoard);
  const [busy, setBusy] = React.useState(false);
  const w = c4.winner(board);
  const status = w === 'R' ? 'You win! 🎉' : w === 'Y' ? 'I win 😄' : w === 'draw' ? 'Draw!' : busy ? 'Thinking…' : 'Your move (red)';
  const clone = (b: c4.C4Board) => b.map((r) => r.slice());

  const play = (col: number) => {
    if (w || busy || board[0][col] !== ' ') return;
    const b = clone(board); c4.drop(b, col, 'R'); setBoard(b);
    if (c4.winner(b)) return;
    setBusy(true);
    setTimeout(() => {
      const m = c4.bestMove(b, 'Y', 6);
      if (m >= 0) { const nb = clone(b); c4.drop(nb, m, 'Y'); setBoard(nb); }
      setBusy(false);
    }, 120);
  };
  return (
    <>
      <div className="grid grid-cols-7 gap-1 rounded-xl bg-indigo-500/10 p-1.5">
        {Array.from({ length: c4.COLS }, (_, col) => (
          <button key={col} onClick={() => play(col)} disabled={!!w || busy || board[0][col] !== ' '}
            className="flex flex-col gap-1 disabled:cursor-not-allowed">
            {Array.from({ length: c4.ROWS }, (_, row) => {
              const cell = board[row][col];
              return <span key={row} className={`aspect-square rounded-full ${cell === 'R' ? 'bg-rose-500' : cell === 'Y' ? 'bg-amber-400' : 'bg-white/10 hover:bg-white/20'}`} />;
            })}
          </button>
        ))}
      </div>
      <Bar status={status} onReset={() => { setBoard(c4.newBoard()); setBusy(false); }} />
    </>
  );
}

// ── Chess ──────────────────────────────────────────────────────────────────
const GLYPH: Record<string, string> = {
  wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙',
  bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟',
};
function ChessGame() {
  const game = React.useRef(new Chess());
  const [fen, setFen] = React.useState(game.current.fen());
  const [sel, setSel] = React.useState<string | null>(null);
  const [targets, setTargets] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);

  const sq = (r: number, c: number) => 'abcdefgh'[c] + (8 - r);
  const g = game.current;
  const over = g.isGameOver();
  const status = over
    ? (g.isCheckmate() ? (g.turn() === 'w' ? 'Checkmate — I win 😄' : 'Checkmate — you win! 🎉') : 'Draw.')
    : busy ? 'Thinking…' : g.inCheck() ? 'Check! Your move (white)' : 'Your move (white)';

  const reset = () => { game.current = new Chess(); setFen(game.current.fen()); setSel(null); setTargets([]); setBusy(false); };

  const aiReply = () => {
    setBusy(true);
    setTimeout(() => {
      const m = chessBest(game.current.fen(), 3);
      if (m) game.current.move({ from: m.from, to: m.to, promotion: m.promotion });
      setFen(game.current.fen()); setBusy(false);
    }, 220);
  };
  const onSquare = (s: string) => {
    if (over || busy) return;
    if (sel && targets.includes(s)) {
      const mv = g.moves({ verbose: true }).find((m) => m.from === sel && m.to === s);
      game.current.move(mv?.promotion ? { from: sel, to: s, promotion: 'q' } : { from: sel, to: s });
      setSel(null); setTargets([]); setFen(game.current.fen());
      if (!game.current.isGameOver()) aiReply();
      return;
    }
    const piece = g.get(s as any);
    if (piece && piece.color === 'w') {
      setSel(s);
      setTargets(g.moves({ square: s as any, verbose: true }).map((m) => m.to));
    } else { setSel(null); setTargets([]); }
  };

  const board = g.board();
  return (
    <>
      <div className="grid grid-cols-8 overflow-hidden rounded-lg" style={{ aspectRatio: '1' }}>
        {board.map((row, r) => row.map((cell, c) => {
          const s = sq(r, c);
          const light = (r + c) % 2 === 0;
          const isSel = sel === s;
          const isTarget = targets.includes(s);
          return (
            <button key={s} onClick={() => onSquare(s)} disabled={busy || over}
              className={`relative flex items-center justify-center text-[clamp(14px,4.2vw,26px)] leading-none ${light ? 'bg-amber-100/85' : 'bg-amber-700/70'} ${isSel ? 'ring-2 ring-inset ring-sky-400' : ''}`}
              style={{ aspectRatio: '1' }}>
              {cell && <span className={cell.color === 'w' ? 'text-zinc-900 drop-shadow' : 'text-zinc-950'} style={{ textShadow: cell.color === 'w' ? '0 0 1px #fff' : 'none' }}>{GLYPH[cell.color + cell.type]}</span>}
              {isTarget && <span className={`absolute h-1/3 w-1/3 rounded-full ${cell ? 'ring-2 ring-sky-500/70' : 'bg-sky-500/50'}`} />}
            </button>
          );
        }))}
      </div>
      <Bar status={status} onReset={reset} />
    </>
  );
}

// ── Wordle ───────────────────────────────────────────────────────────────────
function Wordle() {
  const [answer, setAnswer] = React.useState(wordle.pickWord);
  const [guesses, setGuesses] = React.useState<string[]>([]);
  const [input, setInput] = React.useState('');
  const won = guesses.some((g) => g === answer);
  const done = won || guesses.length >= 6;
  const status = won ? `Got it in ${guesses.length}! 🎉` : guesses.length >= 6 ? `Out of tries — it was ${answer.toUpperCase()}` : `Guess the 5-letter word (${6 - guesses.length} left)`;

  const submit = () => {
    const g = input.toLowerCase();
    if (done || !/^[a-z]{5}$/.test(g)) return;
    setGuesses((p) => [...p, g]); setInput('');
  };
  const reset = () => { setAnswer(wordle.pickWord()); setGuesses([]); setInput(''); };
  const color = (m: wordle.Mark) => (m === 'correct' ? 'bg-emerald-500 border-emerald-500' : m === 'present' ? 'bg-amber-400 border-amber-400 text-zinc-900' : 'bg-zinc-700 border-zinc-700');

  const rows = Array.from({ length: 6 }, (_, r) => {
    const g = guesses[r];
    const marks = g ? wordle.scoreGuess(g, answer) : null;
    return Array.from({ length: 5 }, (_, c) => ({ ch: g ? g[c].toUpperCase() : '', m: marks ? marks[c] : null }));
  });
  return (
    <>
      <div className="flex flex-col items-center gap-1">
        {rows.map((row, r) => (
          <div key={r} className="flex gap-1">
            {row.map((cell, c) => (
              <span key={c} className={`flex h-9 w-9 items-center justify-center rounded border-2 text-lg font-bold ${cell.m ? color(cell.m) : 'border-zinc-600'}`}>{cell.ch}</span>
            ))}
          </div>
        ))}
      </div>
      {!done && (
        <div className="mt-2 flex gap-1.5">
          <input value={input} onChange={(e) => setInput(e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 5))}
            onKeyDown={(e) => e.key === 'Enter' && submit()} maxLength={5} autoFocus
            placeholder="type 5 letters" className="min-w-0 flex-1 rounded-lg bg-white/[0.06] px-3 py-1.5 text-sm uppercase tracking-widest outline-none placeholder:text-white/30 placeholder:normal-case placeholder:tracking-normal" />
          <button onClick={submit} disabled={!/^[a-zA-Z]{5}$/.test(input)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold disabled:opacity-40">Enter</button>
        </div>
      )}
      <Bar status={status} onReset={reset} />
    </>
  );
}

// ── Rock-Paper-Scissors (mind-reader AI) ─────────────────────────────────────
const RPS_EMOJI: Record<rps.RPS, string> = { rock: '🪨', paper: '📄', scissors: '✂️' };
function RockPaperScissors() {
  const [hist, setHist] = React.useState<rps.RPS[]>([]);
  const [last, setLast] = React.useState<{ you: rps.RPS; ai: rps.RPS; res: 'win' | 'lose' | 'draw' } | null>(null);
  const [score, setScore] = React.useState({ you: 0, ai: 0 });

  const play = (you: rps.RPS) => {
    const ai = rps.aiMove(hist);
    const res = rps.outcome(you, ai);
    setHist((h) => [...h, you]);
    setLast({ you, ai, res });
    if (res === 'win') setScore((s) => ({ ...s, you: s.you + 1 }));
    else if (res === 'lose') setScore((s) => ({ ...s, ai: s.ai + 1 }));
  };
  const reset = () => { setHist([]); setLast(null); setScore({ you: 0, ai: 0 }); };
  const status = last
    ? (last.res === 'win' ? 'You win that round! 🎉' : last.res === 'lose' ? 'I got you 😏' : "It's a tie!")
    : 'Make your move…';
  return (
    <>
      <div className="flex items-center justify-center gap-4 py-1 text-center">
        <div><div className="text-3xl">{last ? RPS_EMOJI[last.you] : '❔'}</div><div className="mt-0.5 text-[11px] text-white/50">you</div></div>
        <div className="text-sm font-bold text-white/40">{score.you} – {score.ai}</div>
        <div><div className="text-3xl">{last ? RPS_EMOJI[last.ai] : '❔'}</div><div className="mt-0.5 text-[11px] text-white/50">me</div></div>
      </div>
      <div className="mt-1 flex justify-center gap-2">
        {(['rock', 'paper', 'scissors'] as rps.RPS[]).map((m) => (
          <button key={m} onClick={() => play(m)} className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.06] text-2xl hover:bg-white/15">{RPS_EMOJI[m]}</button>
        ))}
      </div>
      <Bar status={status} onReset={reset} />
    </>
  );
}
