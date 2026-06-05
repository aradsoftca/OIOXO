/**
 * LIVE proof that semantic retrieval finds the right verified brick for a PARAPHRASE
 * that token-overlap misses — the keystone that makes "the network already built it"
 * findable on a weak device. Loads the real tiny CPU embedder (MiniLM). Run:
 *   npm run oioxo:embed
 */
import { SEED_BRICKS, matchBricks, semanticMatchBricks } from '../lib/oioxo/bricks.ts';
import { loadEmbedder } from '../lib/oioxo/embed.ts';

const DIM = (s) => `\x1b[2m${s}\x1b[0m`; const B = (s) => `\x1b[1m${s}\x1b[0m`;
const t0 = Date.now();
console.log(DIM('Loading Xenova/all-MiniLM-L6-v2 (tiny CPU embedder)…'));
const embed = await loadEmbedder();
console.log(DIM(`embedder ready in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`));

// Paraphrased asks with NO/low word overlap with the brick's name — the case
// token-overlap fails and semantics must win.
const probes = [
  ['run a function only after the user stops typing for a moment', 'debounce'],
  ['keep a value from going past a minimum or maximum', 'clamp'],
  ['a last-in first-out collection I can push onto and pop', 'Stack'],
  ['bucket a list of records by some field', 'groupBy'],
  ['grab data from a web address and read it as an object', 'fetchJson'],
  ['did two rectangles bump into each other', 'AABB'],
  ['keep redrawing the screen every frame', 'startLoop'],
];

const cache = new Map();
let lexHits = 0, semHits = 0;
console.log(B('paraphrase'.padEnd(54)) + B('  lexical → ') + B('semantic'));
for (const [q, want] of probes) {
  const lex = matchBricks(q, SEED_BRICKS, 1)[0];
  const sem = (await semanticMatchBricks(q, embed, SEED_BRICKS, 1, cache))[0];
  const lexName = lex ? lex.title.split(' —')[0] : '(none)';
  const semName = sem ? sem.title.split(' —')[0] : '(none)';
  const lexOk = new RegExp(want, 'i').test(lexName); if (lexOk) lexHits++;
  const semOk = new RegExp(want, 'i').test(semName); if (semOk) semHits++;
  console.log(q.slice(0, 52).padEnd(54) + `  ${lexOk ? '✓' : '✗'} ${lexName.padEnd(12)} → ${semOk ? '✓' : '✗'} ${semName}`);
}
console.log(B(`\nLexical (token-overlap): ${lexHits}/${probes.length}   Semantic (MiniLM): ${semHits}/${probes.length}`));
console.log(DIM(`(semantic should clearly beat lexical on paraphrases — that's what makes a vague ask findable)\n`));
