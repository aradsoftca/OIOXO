/**
 * Rock-Paper-Scissors with a "mind-reader" AI — instead of playing randomly, it
 * learns your tendencies from your move history and counters your most likely
 * next move. Feels uncanny over a few rounds (humans are predictable). Pure.
 */
export type RPS = 'rock' | 'paper' | 'scissors';
const BEATS: Record<RPS, RPS> = { rock: 'scissors', paper: 'rock', scissors: 'paper' }; // key beats value
const COUNTER: Record<RPS, RPS> = { rock: 'paper', paper: 'scissors', scissors: 'rock' }; // value beats key... use to counter a predicted move

/** Predict the player's next move from history, then play the move that beats it.
 *  Blends overall frequency with the most recent move (recency bias). Early on,
 *  with little data, it stays effectively random so it doesn't feel rigged. */
export function aiMove(history: RPS[]): RPS {
  if (history.length < 2) {
    const all: RPS[] = ['rock', 'paper', 'scissors'];
    return all[Math.floor(Math.random() * 3)];
  }
  const score: Record<RPS, number> = { rock: 0, paper: 0, scissors: 0 };
  for (const m of history) score[m] += 1;                 // overall frequency
  score[history[history.length - 1]] += 1.5;              // recency weight
  // a little noise so it's not perfectly deterministic
  (['rock', 'paper', 'scissors'] as RPS[]).forEach((m) => { score[m] += Math.random() * 0.6; });
  const predicted = (Object.keys(score) as RPS[]).reduce((a, b) => (score[b] > score[a] ? b : a));
  return COUNTER[predicted]; // play what beats the predicted move
}

/** Round result from the PLAYER's perspective. */
export function outcome(player: RPS, ai: RPS): 'win' | 'lose' | 'draw' {
  if (player === ai) return 'draw';
  return BEATS[player] === ai ? 'win' : 'lose';
}
