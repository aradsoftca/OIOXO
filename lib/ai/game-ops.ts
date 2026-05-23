/**
 * Xonvert AI — inline game-name generators.
 *
 * The game category is full of pure random-name generators (fantasy, sci-fi,
 * usernames, clans, weapons, spells…). They take no input, so the AI can just
 * produce one in the chat. Word lists come from engines/names. Pure / DOM-free;
 * output is random so the eval verifies shape, not an exact string.
 */

import {
  FANTASY_ADJ, FANTASY_NOUN, SCI_FI_ADJ, SCI_FI_NOUN, WEAPONS, WEAPON_ADJ, WEAPON_OF,
  SPELL_PREFIX, SPELL_VERB, QUEST_VERB, QUEST_NOUN, TEAM_ADJ, TEAM_NOUN,
  GUILD_ADJ, GUILD_NOUN, USERNAME_PRE, USERNAME_MID, CHARACTER_FIRST, CHARACTER_LAST,
  CLAN_TAGS, CLAN_FULL,
} from '@/engines/names';

const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

export interface GameOp { verb: string; run: () => string }

export const GAME_OPS: Record<string, GameOp> = {
  'game-fantasy': { verb: 'generate a fantasy name', run: () => `${pick(FANTASY_ADJ)}${pick(FANTASY_NOUN).toLowerCase()}` },
  'game-sci-fi': { verb: 'generate a sci-fi name', run: () => `${pick(SCI_FI_ADJ)} ${pick(SCI_FI_NOUN)}` },
  'game-weapon': { verb: 'generate a weapon name', run: () => `${pick(WEAPON_ADJ)}${pick(WEAPONS).toLowerCase()} of ${pick(WEAPON_OF)}` },
  'game-spell': { verb: 'generate a spell name', run: () => `${pick(SPELL_PREFIX)} ${pick(SPELL_VERB)}` },
  'game-quest': { verb: 'generate a quest name', run: () => `${pick(QUEST_VERB)} ${pick(QUEST_NOUN)}` },
  'game-team': { verb: 'generate a team name', run: () => `${pick(TEAM_ADJ)} ${pick(TEAM_NOUN)}` },
  'game-guild': { verb: 'generate a guild name', run: () => `The ${pick(GUILD_ADJ)} ${pick(GUILD_NOUN)}` },
  'game-clan': { verb: 'generate a clan name', run: () => `[${pick(CLAN_TAGS)}] ${pick(CLAN_FULL)}` },
  'game-username': { verb: 'generate a username', run: () => `${pick(USERNAME_PRE)}${pick(USERNAME_MID)}${Math.floor(Math.random() * 100)}` },
  'game-character': { verb: 'generate a character name', run: () => `${pick(CHARACTER_FIRST)} ${pick(CHARACTER_LAST)}` },
  'game-name': { verb: 'generate a name', run: () => `${pick(CHARACTER_FIRST)} ${pick(CHARACTER_LAST)}` },
};

export function gameOpFor(id: string): GameOp | undefined {
  return GAME_OPS[id];
}

// --- randomizers: dice / coin / picker (parse from the message) ------------
export const GAME_RANDOM_IDS = ['game-dice', 'game-coin', 'game-picker'];
export function isGameRandom(id: string): boolean { return GAME_RANDOM_IDS.includes(id); }

/** Roll dice, flip a coin, or pick from a list — pure random, parsed inline. */
export function tryGameRandom(text: string): { tool: string; result: string } | null {
  const lc = text.toLowerCase();
  if (/\b(flip|toss)\b.*\bcoin\b|\bcoin flip\b|\bheads or tails\b/.test(lc)) {
    return { tool: 'game-coin', result: pick(['Heads', 'Tails']) };
  }
  const dm = lc.match(/(\d{0,2})\s*d\s*(\d{1,3})/);
  if (dm || /\b(roll|throw)\b.*\b(dice|dies?|d\d+)\b/.test(lc)) {
    const count = dm && dm[1] ? Math.min(20, Math.max(1, +dm[1])) : 1;
    const sides = dm ? Math.min(1000, Math.max(2, +dm[2])) : 6;
    const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
    const sum = rolls.reduce((a, b) => a + b, 0);
    return { tool: 'game-dice', result: count > 1 ? `🎲 ${rolls.join(' + ')} = ${sum} (${count}d${sides})` : `🎲 ${sum} (d${sides})` };
  }
  if (/\b(pick|choose|select|random)\b/.test(lc)) {
    const src = (text.match(/\bbetween\b(.+)/i) ?? text.match(/\b(?:from|of|among)\b(.+)/i))?.[1] ?? '';
    const items = src.split(/\s*,\s*|\s+(?:and|or)\s+/i).map((s) => s.trim()).filter(Boolean);
    if (items.length >= 2) return { tool: 'game-picker', result: `I pick: ${pick(items)}` };
  }
  return null;
}

// Worth routing into the generators (so "generate a uuid"-style art-intent can't
// steal "generate a fantasy name"). Two parts: a game/name theme + a make verb.
const GAME_THEME = /\b(fantasy|sci-?fi|gamer ?tag|username|clan|guild|esports|team|rpg|villain|hero|warrior|weapon|spell|quest|character)\b/i;
const GAME_MAKE = /\b(name|generate|random|generator|tag|username|gamertag|clan|guild)\b/i;
export function looksLikeGameName(text: string): boolean {
  return GAME_THEME.test(text) && GAME_MAKE.test(text);
}
