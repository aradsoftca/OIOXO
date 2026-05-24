/**
 * HELD-OUT adversarial eval set — NOT used for training. Natural, messy, varied
 * phrasings ("any age, any user": slang, typos, ambiguity) each paired with the
 * action a smart assistant SHOULD take. Built through the SAME decisionPrompt
 * machinery the model sees at runtime, so eval == reality. We score the trained
 * model's action (and tool sanity) against `expected`.
 *
 * Run:  npx tsx lib/ai/eval/gen-eval.ts   →  lib/ai/eval/out/brain-eval.jsonl
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { candidatesFor, decisionPrompt } from '../decide';

type FileFam = 'image' | 'audio' | 'video' | 'pdf' | 'text' | null;
type Action = 'tool' | 'chain' | 'answer' | 'chat' | 'offer';

// [prompt, fileFamily, expectedAction] — hand-judged, deliberately unlike the
// training templates (slang, typos, indirect asks, mixed intent).
const SET: [string, FileFam, Action][] = [
  // casual ops on a file → tool
  ['yo can u shrink this pic', 'image', 'tool'],
  ['make this lil photo black and white', 'image', 'tool'],
  ['this image is HUGE pls make it smaller', 'image', 'tool'],
  ['turn the volume up on this', 'audio', 'tool'],
  ['chop the first 10 seconds off', 'audio', 'tool'],
  ['mute my video', 'video', 'tool'],
  ['rotate this sideways pic', 'image', 'tool'],
  ['squish this into a smaller file', 'image', 'tool'],
  // same-family convert → tool
  ['convertt this too a jpeg', 'image', 'tool'],
  ['save this as a webp pls', 'image', 'tool'],
  ['i want this as a wav not mp3', 'audio', 'tool'],
  // cross-family clever bridge → chain
  ['get the audio out of this clip', 'video', 'tool'],
  ['rip the sound from this video as mp3', 'video', 'chain'],
  ['make a picture of this songs waveform', 'audio', 'tool'],
  ['read this text out loud as audio', 'text', 'tool'],
  ['turn these pdf pages into images', 'pdf', 'tool'],
  // genuinely not doable → offer
  ['turn this photo into a song', 'image', 'offer'],
  ['make my pdf into a 3d printable model', 'pdf', 'offer'],
  ['convert this selfie to a spreadsheet', 'image', 'offer'],
  ['make this mp3 into a powerpoint', 'audio', 'offer'],
  // questions → answer
  ['is the earth actually round', null, 'answer'],
  ['how do volcanoes work', null, 'answer'],
  ['whats the capital of australia', null, 'answer'],
  ['why is the sky blue tho', null, 'answer'],
  ['who invented the lightbulb', null, 'answer'],
  ['tell me about the roman empire', null, 'answer'],
  // chitchat → chat
  ['yo', null, 'chat'],
  ['sup', null, 'chat'],
  ['haha nice one', null, 'chat'],
  ['ur pretty cool', null, 'chat'],
  ['good evening', null, 'chat'],
  ['thanks a ton', null, 'chat'],
  // generators / creates → tool
  ['i need a qr code for my menu', null, 'tool'],
  ['gimme a really strong password', null, 'tool'],
  ['make me a random color palette', null, 'tool'],
];

const out: string[] = [];
for (const [q, file, expected] of SET) {
  const cands = candidatesFor(q, file);
  const { messages } = decisionPrompt(q, cands, { hasFile: file != null, fileFamily: file });
  out.push(JSON.stringify({ prompt: q, file, expected, messages: [messages[0], messages[1]] }));
}

const dir = join(process.cwd(), 'lib', 'ai', 'eval', 'out');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'brain-eval.jsonl'), out.join('\n') + '\n');
console.log(`Wrote ${out.length} held-out eval cases → ${join(dir, 'brain-eval.jsonl')}`);
