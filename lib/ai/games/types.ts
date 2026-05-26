/**
 * oioxo in-chat games — shared types + registry.
 *
 * Games are DETERMINISTIC engines (not the LLM — an LLM plays chess illegally).
 * The AI's only job is to DETECT "let's play X" and launch the board widget; these
 * pure engines play the opponent and enforce the rules. All on-device, no install.
 */
export type GameKind = 'tictactoe' | 'connect4' | 'chess' | 'wordle' | 'rps';

export interface GameMeta {
  kind: GameKind;
  name: string;
  /** One-line description shown in the launch card / menu. */
  blurb: string;
  /** Trigger words (lowercased) the intent matcher looks for. */
  aliases: string[];
}

export const GAMES: GameMeta[] = [
  { kind: 'tictactoe', name: 'Tic-Tac-Toe', blurb: 'Classic 3×3 — I play a perfect game, so the best you can do is a draw!', aliases: ['tic tac toe', 'tic-tac-toe', 'tictactoe', 'noughts and crosses', 'xo game', 'x and o', 'x or o'] },
  { kind: 'connect4', name: 'Connect Four', blurb: 'Drop discs to line up four in a row before I do.', aliases: ['connect four', 'connect 4', 'connect-4', 'connect4', 'four in a row'] },
  { kind: 'chess', name: 'Chess', blurb: 'A full game of chess — drag or tap to move, I’ll respond.', aliases: ['chess'] },
  { kind: 'wordle', name: 'Wordle', blurb: 'Guess the secret 5-letter word in 6 tries — green=right spot, yellow=wrong spot.', aliases: ['wordle', 'word game', 'guess the word', 'word guess'] },
  { kind: 'rps', name: 'Rock Paper Scissors', blurb: 'Best of luck — I’ll try to read your mind. 🪨📄✂️', aliases: ['rock paper scissors', 'rock-paper-scissors', 'rps', 'roshambo'] },
];

export const gameByKind = (k: GameKind): GameMeta => GAMES.find((g) => g.kind === k)!;
