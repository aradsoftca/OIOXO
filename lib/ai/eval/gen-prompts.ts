/**
 * Emits the REAL decision prompts (real retrieval candidates + the real grammar
 * schema) as JSON, so a llama.cpp harness can run them through the ACTUAL
 * Qwen3-0.6B GGUF with grammar — a faithful CLI proxy for the WebGPU runtime.
 *
 * Run:  npx tsx lib/ai/eval/gen-prompts.ts > /tmp/prompts.json
 */
import { candidatesFor, decisionPrompt, offerPrompt, retrievalConfidence, guardrailTool } from '../decide';
import { inferGoal } from '../goal';

type Cat = 'tool' | 'chain' | 'answer' | 'chat' | 'offer';
type C = { q: string; file?: 'image' | 'audio' | 'video' | 'pdf' | 'text'; want?: Cat };
const CASES: C[] = [
  // clear single tools
  { q: 'compress this image', file: 'image', want: 'tool' },
  { q: 'remove the background', file: 'image', want: 'tool' },
  { q: 'rotate it 90 degrees', file: 'image', want: 'tool' },
  { q: 'make my photo look vintage', file: 'image', want: 'tool' },
  { q: 'crop this to a square', file: 'image', want: 'tool' },
  { q: 'extract the audio from this video', file: 'video', want: 'tool' },
  { q: 'merge these pdfs into one', file: 'pdf', want: 'tool' },
  { q: 'add page numbers to my pdf', file: 'pdf', want: 'tool' },
  { q: 'make a qr code for my website' },
  { q: 'trim the first 10 seconds', file: 'audio', want: 'tool' },
  // chains (the weak spot — many phrasings to test consistency)
  { q: 'remove the background then convert to jpg', file: 'image', want: 'chain' },
  { q: 'transcribe this and translate it to french', file: 'audio', want: 'chain' },
  { q: 'compress this then add a watermark', file: 'image', want: 'chain' },
  { q: 'resize this image and add a border', file: 'image', want: 'chain' },
  { q: 'transcribe this audio and summarize it', file: 'audio', want: 'chain' },
  { q: 'extract the audio from this video and transcribe it', file: 'video', want: 'chain' },
  // questions
  { q: "what's the capital of mongolia", want: 'answer' },
  { q: 'who is taylor swift', want: 'answer' },
  { q: 'how tall is mount everest', want: 'answer' },
  // chat
  { q: 'hey how are you', want: 'chat' },
  { q: 'thanks that was helpful', want: 'chat' },
  // impossible / resourceful offer
  { q: 'convert song to stl', want: 'offer' },
  { q: 'm4a to cad', want: 'offer' },
  { q: 'can you summarize a youtube video for me', want: 'offer' },
  { q: 'turn this pdf into a podcast', file: 'pdf', want: 'offer' },
  { q: 'make a 3d model from my photo', file: 'image', want: 'offer' },
  { q: 'remove the vocals from this song', file: 'audio', want: 'tool' }, // audio-vocal-remover exists
  { q: 'translate this whole video into spanish', file: 'video', want: 'offer' },
  { q: 'turn my essay into a video', want: 'offer' },
  { q: 'build me a website for my bakery', want: 'offer' },
  { q: 'write a song and record it as audio', want: 'offer' },
  // ambiguous / weird
  { q: 'make it pop', file: 'image' },
  { q: 'do something cool with this', file: 'image' },
  { q: 'i need this to look professional', file: 'pdf' },
  { q: 'help me make a meme', file: 'image' },
  { q: 'clean up this audio', file: 'audio' },
  // === creative / any-age / any-user sweep ===
  // typos & casual/slang
  { q: 'compres this imag', file: 'image', want: 'tool' },
  { q: 'trnscribe this audoi', file: 'audio', want: 'tool' },
  { q: 'yo make this pic smaller', file: 'image', want: 'tool' },
  // non-technical / elderly phrasing
  { q: 'my photo is too big to email how do i shrink it', file: 'image', want: 'tool' },
  { q: 'my grandson sent a video, i just want one picture from it', file: 'video', want: 'tool' },
  // multi-intent
  { q: 'remove the background, make it black and white, and save as png', file: 'image', want: 'chain' },
  // kid questions
  { q: 'why is the sky blue', want: 'answer' },
  { q: 'how do airplanes stay in the air', want: 'answer' },
  // impossible / playful
  { q: 'turn my cat into a dog', file: 'image', want: 'offer' },
  { q: 'make this song twice as long', file: 'audio', want: 'offer' },
  { q: 'email this file to my mom', file: 'pdf', want: 'offer' },
  { q: 'print this for me', file: 'pdf', want: 'offer' },
  // vague/emotional
  { q: 'this photo is too dark, help', file: 'image', want: 'tool' },
  { q: 'make my resume look more professional', file: 'pdf' },
];

const out = CASES.map((c) => {
  const cands = candidatesFor(c.q, c.file ?? null);
  const ctx = { hasFile: !!c.file, fileFamily: c.file ?? null, lastTopic: null };
  const { messages, schema } = decisionPrompt(c.q, cands, ctx);
  const off = offerPrompt(c.q, ctx);
  const conf = retrievalConfidence(c.q, c.file ?? null);
  const inputFam = c.file ?? inferGoal(c.q, {}).from ?? null;
  const guard = guardrailTool(c.q, cands, inputFam, conf);
  return { q: c.q, file: c.file ?? null, want: c.want ?? null, conf, guardId: guard?.id ?? null, candidates: cands.map((x) => x.id), cands: cands.map((x) => ({ id: x.id, accepts: x.accepts, produces: x.produces })), system: messages[0].content, user: messages[1].content, schema, offerSystem: off.messages[0].content, offerUser: off.messages[1].content };
});
process.stdout.write(JSON.stringify(out, null, 2));
