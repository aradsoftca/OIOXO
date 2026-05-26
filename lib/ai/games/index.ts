/**
 * Game intent matcher — the AI's only job in the games feature: recognize "let's
 * play X" and hand off to the deterministic board widget. Pure / Node-testable.
 */
import { GAMES, type GameKind } from './types';

export * from './types';

// STRONG play intent — overrides the question guard so "can we play chess?" still
// launches, but bare "play" (which appears in "how TO PLAY chess") does not.
const STRONG_PLAY = /\b(let'?s play|lets play|wanna play|want to play|can we play|can i play|i'?ll play|play a game|play a round|game of|challenge you|beat you at|fancy a (game|round)|up for a (game|round))\b/i;
const GENERIC = /\b(play a game|let'?s play|wanna play|i'?m bored|play something|board game|a game with you|up for a game)\b/i;
// A question/explanation ABOUT a game ("how to play chess", "rules of chess",
// "who invented chess") is NOT a launch — answer it instead.
const QUESTION = /^(what|who|when|where|why|how|is|are|does|did|can you (explain|tell)|tell me|explain|rules of|history of)\b/;

export type GameMatch = { kind: GameKind } | { menu: true } | null;

/**
 * Detect a game LAUNCH request. Returns the specific game, a `menu` (they want to
 * play but didn't name one), or null. A how-to/explain question about a game falls
 * through to the answer engine ("how to play chess" ≠ "play chess").
 */
export function matchGame(text: string): GameMatch {
  const t = text.toLowerCase().trim();
  if (QUESTION.test(t) && !STRONG_PLAY.test(t)) return null; // "how to play chess" → answer, don't launch
  const named = GAMES.find((g) => g.aliases.some((a) => t.includes(a)));
  if (named && (STRONG_PLAY.test(t) || /\bplay\b/.test(t) || t.split(/\s+/).length <= 3)) return { kind: named.kind };
  if (GENERIC.test(t)) return { menu: true };
  return null;
}

/** Friendly launch line for a specific game. */
export function gameIntro(kind: GameKind): string {
  const g = GAMES.find((x) => x.kind === kind)!;
  return `You're on — **${g.name}**! ${g.blurb} You go first. 🎮`;
}

/** Menu text when the user wants to play but didn't pick a game. */
export function gameMenu(): string {
  return `I'd love to! Pick one and we'll play right here:\n${GAMES.map((g) => `• **${g.name}** — ${g.blurb}`).join('\n')}\n\nJust say the name (e.g. "play chess").`;
}
