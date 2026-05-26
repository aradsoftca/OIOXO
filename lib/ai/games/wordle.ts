/**
 * Wordle engine — pick a secret 5-letter word; score each guess green/yellow/gray
 * with the correct two-pass letter-count rule. Pure + Node-testable. The "engine"
 * is just the secret + scorer (no opponent). Guesses accept any 5 letters (lenient,
 * less frustrating than a strict dictionary — and no 12k-word list to ship).
 */
export type Mark = 'correct' | 'present' | 'absent';

// Curated common, fair 5-letter answers (no obscure words).
export const WORDS = [
  'apple', 'beach', 'bread', 'brain', 'brave', 'bring', 'brush', 'chair', 'chalk', 'charm',
  'chase', 'cheap', 'check', 'chess', 'chest', 'child', 'clean', 'clear', 'climb', 'clock',
  'cloud', 'coast', 'crane', 'crazy', 'cream', 'crisp', 'crown', 'dance', 'dream', 'drink',
  'drive', 'eagle', 'earth', 'enjoy', 'fairy', 'faith', 'fence', 'field', 'flame', 'flash',
  'float', 'flour', 'focus', 'force', 'frame', 'fresh', 'fruit', 'ghost', 'giant', 'glass',
  'globe', 'grace', 'grape', 'grass', 'great', 'green', 'happy', 'heart', 'honey', 'horse',
  'house', 'human', 'jelly', 'juice', 'knife', 'koala', 'lemon', 'light', 'lucky', 'lunch',
  'magic', 'maple', 'march', 'metal', 'money', 'month', 'mouse', 'music', 'night', 'noble',
  'ocean', 'olive', 'paint', 'panda', 'paper', 'party', 'peace', 'pearl', 'phone', 'piano',
  'pizza', 'plant', 'plate', 'point', 'pound', 'power', 'pride', 'prize', 'proud', 'queen',
  'quick', 'quiet', 'radio', 'raise', 'reach', 'ready', 'river', 'robot', 'round', 'royal',
  'scale', 'scene', 'scout', 'sharp', 'shine', 'shore', 'short', 'silly', 'sleep', 'smart',
  'smile', 'smoke', 'snake', 'solar', 'sound', 'space', 'spark', 'spice', 'spicy', 'spire',
  'sport', 'stage', 'stair', 'stamp', 'stand', 'stark', 'steam', 'stone', 'storm', 'story',
  'sugar', 'sunny', 'sweet', 'table', 'taste', 'teach', 'thank', 'theme', 'tiger', 'toast',
  'tooth', 'torch', 'tower', 'trace', 'track', 'train', 'treat', 'trend', 'tribe', 'trick',
  'trust', 'truth', 'tulip', 'twist', 'uncle', 'unity', 'value', 'video', 'vivid', 'voice',
  'water', 'wheat', 'wheel', 'where', 'while', 'white', 'whole', 'witch', 'world', 'worth',
  'youth', 'zebra', 'shark', 'shell', 'sheep', 'spoon', 'sword', 'flute', 'crown', 'cabin',
];

export const pickWord = (): string => WORDS[Math.floor(Math.random() * WORDS.length)];

/** Two-pass scoring: lock greens first, then mark yellows only for letters still
 *  unaccounted for in the answer (so duplicate letters score correctly). */
export function scoreGuess(guess: string, answer: string): Mark[] {
  const g = guess.toLowerCase().split('');
  const a = answer.toLowerCase().split('');
  const marks: Mark[] = Array(5).fill('absent');
  const counts: Record<string, number> = {};
  for (const ch of a) counts[ch] = (counts[ch] ?? 0) + 1;
  for (let i = 0; i < 5; i++) if (g[i] === a[i]) { marks[i] = 'correct'; counts[g[i]]--; }
  for (let i = 0; i < 5; i++) {
    if (marks[i] === 'correct') continue;
    if (counts[g[i]] > 0) { marks[i] = 'present'; counts[g[i]]--; }
  }
  return marks;
}

export const isWin = (marks: Mark[]): boolean => marks.every((m) => m === 'correct');
