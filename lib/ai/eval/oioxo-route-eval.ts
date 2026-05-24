/**
 * oioxo "prompt trainer" — route eval. Runs many diverse, messy prompts through
 * the PURE decideRoute() and checks the chosen class against what it should be.
 * Failures are bucketed by [expected -> got] so we fix ERROR CLASSES, not single
 * prompts. Grow the corpus over time; a few hundred spread prompts surface the
 * classes that millions would.
 *
 *   npx tsx lib/ai/eval/oioxo-route-eval.ts
 */
import { decideRoute, type RouteKind } from '../oioxo-engine';

type FileCat = 'image' | 'audio' | 'video' | 'pdf' | 'text' | null;
const LONG =
  'The mitochondria is the powerhouse of the cell. It produces ATP through cellular respiration, ' +
  'converting nutrients into usable energy for the organism across many tissues and organs.';

// [prompt, fileCat, expected route kind] — deliberately varied phrasing.
const SET: [string, FileCat, RouteKind][] = [
  // IMAGE
  ['show me a picture of the eiffel tower', null, 'image'],
  ['images of cats', null, 'image'],
  ['what does a quokka look like', null, 'image'],
  ['find me photos of sunsets', null, 'image'],
  ['david villa pictures', null, 'image'],
  ['show me an image of david villa', null, 'image'],
  ['can you show me some pics of golden retrievers', null, 'image'],
  ['wallpaper of deep space', null, 'image'],
  ['get me a photo of the sydney opera house', null, 'image'],
  // ANSWER (questions / facts / how-to)
  ['what is the capital of japan', null, 'answer'],
  ['how do volcanoes form', null, 'answer'],
  ['what is the recipe of california sushi', null, 'answer'],
  ['who won the 2014 world cup', null, 'answer'],
  ['why is the sky blue', null, 'answer'],
  ['tell me about the roman empire', null, 'answer'],
  ['whats the boiling point of water', null, 'answer'],
  ['explain how rainbows happen', null, 'answer'],
  // TOOL (do something to a file)
  ['compress this image', 'image', 'tool'],
  ['convert this to pdf', 'pdf', 'tool'],
  ['resize my photo to 800px', 'image', 'tool'],
  ['remove the background', 'image', 'tool'],
  ['rotate this picture', 'image', 'tool'],
  // APP (flagship)
  ['start a video call', null, 'app'],
  ['send this file to my friend', null, 'app'],
  ['share my screen', null, 'app'],
  ['make an encrypted note', null, 'app'],
  ['open a group chat', null, 'app'],
  // CHAT
  ['hi', null, 'chat'],
  ['thanks so much', null, 'chat'],
  ['good morning', null, 'chat'],
  // SUMMARY (explicit + enough text)
  [`summarize: ${LONG}`, null, 'summary'],
  [`tl;dr ${LONG}`, null, 'summary'],
  // CODE (handoff to the Coding workspace)
  ['review my code and refactor it', null, 'code'],
  ['can you fix this bug in my function', null, 'code'],
  ['```js\nfunction add(a, b) { return a + b; }\nconst x = add(1, 2);\n```', null, 'code'],

  // --- harder / adversarial: tricky boundaries that often misroute ---
  ['show me how to tie a tie', null, 'answer'], // "show me HOW TO" = how-to, NOT image
  ['show me how to make pancakes', null, 'answer'],
  ['how do i train a puppy', null, 'answer'],
  ['lemme see some cat pics', null, 'image'],
  ['got any wallpapers of mountains', null, 'image'],
  ['pics of the golden gate bridge please', null, 'image'],
  ['who is taylor swift', null, 'answer'],
  ['is the great wall visible from space', null, 'answer'],
  ['yo wassup', null, 'chat'],
  ['lol nice', null, 'chat'],
  ['make this picture smaller', 'image', 'tool'], // action verb → tool, not image
  ['can you sharpen this photo', 'image', 'tool'],
  ['video call my friend', null, 'app'],
  ['i want to share files with someone', null, 'app'],
  ['debug this stack trace for me', null, 'code'],
  ['summarise the following article: ' + LONG, null, 'summary'],
];

const fails: Record<string, { n: number; ex: string[] }> = {};
let ok = 0;
for (const [prompt, file, expected] of SET) {
  const got = decideRoute(prompt, file).kind;
  if (got === expected) ok++;
  else {
    const key = `${expected} -> ${got}`;
    (fails[key] ??= { n: 0, ex: [] }).n++;
    if (fails[key].ex.length < 3) fails[key].ex.push(prompt);
  }
}

console.log(`\n=== oioxo route eval: ${ok}/${SET.length} = ${Math.round((ok / SET.length) * 100)}% ===`);
const classes = Object.entries(fails).sort((a, b) => b[1].n - a[1].n);
if (!classes.length) console.log('No misroutes 🎉');
for (const [cls, info] of classes) {
  console.log(`\n[${info.n}]  ${cls}`);
  for (const ex of info.ex) console.log(`     · ${ex.slice(0, 60)}`);
}
