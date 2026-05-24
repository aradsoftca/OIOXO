/**
 * Build a fine-tuning dataset by DISTILLING the deterministic brain.
 *
 * For many varied requests we compute the IDEAL decision (tool/chain/answer/
 * chat/offer) using the same rules the live decider trusts — guardrail, intent,
 * capability-graph feasibility, retrieval confidence — and emit it paired with
 * the exact grammar prompt the model sees at runtime. The model then learns to
 * output these decisions reliably (less prompt-sensitivity), and the "smartness"
 * moves into weights only we can reproduce (the moat).
 *
 * Output: JSONL of {messages:[system,user,assistant]} → /tmp/brain-train.jsonl
 * Run:  npx tsx lib/ai/eval/gen-dataset.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { candidatesFor, decisionPrompt, guardrailTool, retrievalConfidence, type Decision } from '../decide';
import { inferGoal } from '../goal';
import { classifyIntent } from '../intent';
import { wordFamily, planCapability, type Family } from '../capability-graph';

type FileFam = 'image' | 'audio' | 'video' | 'pdf' | 'text' | null;

/** The IDEAL decision for a request — mirrors decideBrain + guardrail + feasibility. */
function labelDecision(message: string, fileFam: FileFam): Decision {
  const hasFile = fileFam != null;
  const goal = inferGoal(message, { hasFile, fileFamily: fileFam });
  const inputFam = (fileFam ?? goal.from) as string | null;

  // CONVERSION INTENT FIRST. When the user clearly wants to reach a DIFFERENT
  // family/format, the capability graph is the ground truth for feasibility —
  // it (not a lexical keyword guardrail) decides tool / chain / offer. This is
  // why "mp3 → stl" must be 'offer' even though confident audio tools exist.
  if (goal.to) {
    const toFam = wordFamily(goal.to);
    if (toFam && inputFam && toFam !== (inputFam as Family)) {
      const path = planCapability(inputFam as Family, goal.to, { maxHops: 2 });
      // A real bridge keeps the SAME content in a new medium and is short
      // (≤2 family hops: audio→waveform→image, video→audio→mp3). A route that
      // needs 3+ family hops only "works" by generating new content through an
      // unrelated intermediary (image→text→audio = OCR then speak) — absurd for
      // a conversion, so we decline and OFFER instead. One principled bound, not
      // a per-pair rule.
      const famHops = path ? path.families.length - 1 : Infinity;
      if (path && famHops <= 2) {
        const ids = path.edges.map((e) => e.toolId);
        return ids.length > 1 ? { action: 'chain', tools: ids } : { action: 'tool', tools: ids };
      }
      return { action: 'offer', tools: [] }; // no short, content-preserving route = not doable
    }
  }

  const fam = classifyIntent(message, { hasFile });
  if (fam === 'chitchat') return { action: 'chat', tools: [] };
  if (fam === 'question' || fam === 'followup') return { action: 'answer', tools: [], query: goal.subject || message };

  // No cross-family goal → an in-place op or same-family convert: the guardrail /
  // candidate ranker is the right judge here.
  const cands = candidatesFor(message, fileFam);
  const guard = guardrailTool(message, cands, inputFam, retrievalConfidence(message, fileFam));
  if (guard) return { action: 'tool', tools: [guard.id] };
  if (cands.length && retrievalConfidence(message, fileFam) !== 'weak') return { action: 'tool', tools: [cands[0].id] };
  return { action: 'answer', tools: [], query: goal.subject || message };
}

// --- varied corpus (templated across categories) ----------------------------
const IMG_OPS = ['compress', 'resize', 'crop', 'rotate', 'blur', 'sharpen', 'remove the background of', 'add a watermark to', 'make grayscale', 'upscale', 'add a border to', 'flip'];
const AUD_OPS = ['trim', 'normalize', 'boost the bass of', 'remove silence from', 'speed up', 'reverse', 'remove the vocals from'];
const FMT = { image: ['png', 'jpg', 'webp', 'gif', 'bmp'], audio: ['mp3', 'wav', 'flac'], video: ['mp4', 'webm'], pdf: ['pdf'] };
const SUBJECTS = ['this', 'this photo', 'my image', 'it', 'this file'];
const QUESTIONS = ['what is {x}', 'who is {x}', 'how does {x} work', 'why is {x} important', 'when was {x} invented', 'what causes {x}'];
const QTOPICS = ['photosynthesis', 'the eiffel tower', 'taylor swift', 'a black hole', 'inflation', 'the great wall', 'caffeine', 'the moon', 'rust programming', 'bitcoin'];
const CHATS = ['hi', 'hey there', 'hello', 'thanks', 'thank you so much', 'good morning', 'who are you', 'how are you', 'cool', 'nice work'];
const IMPOSSIBLE = ['turn my mp3 into a stl', 'convert this song to cad', 'make a 3d model from this audio', 'turn this pdf into a podcast', 'summarize a youtube video', 'turn my cat into a dog', 'make this song twice as long', 'email this to my mom'];
const CHAINS = ['remove the background then convert to jpg', 'compress this then add a watermark', 'transcribe this and translate it to french', 'resize this and add a border', 'extract the audio from this video and transcribe it'];

// Cross-family conversion targets spanning every family — the graph decides
// whether each is a single tool, a multi-hop chain, or impossible (offer). We
// don't pre-judge; planCapability (via labelDecision) is the oracle. The NOUN
// per file family just makes the phrasing natural.
const FILE_FAMS: FileFam[] = ['image', 'audio', 'video', 'pdf', 'text'];
const NOUN: Record<string, string> = { image: 'photo', audio: 'audio', video: 'video', pdf: 'pdf', text: 'text' };
const CONV_TARGETS = ['png', 'jpg', 'webp', 'gif', 'bmp', 'svg', 'mp3', 'wav', 'flac', 'm4a', 'mp4', 'webm', 'mov', 'pdf', 'txt', 'md', 'docx', 'xlsx', 'csv', 'pptx', 'epub', 'zip', 'glb', 'stl', 'obj'];
const CONV_PHRASE = (noun: string, t: string) => [`convert this ${noun} to ${t}`, `turn this ${noun} into a ${t}`];

function* corpus(): Generator<{ q: string; file: FileFam }> {
  for (const op of IMG_OPS) for (const s of SUBJECTS.slice(0, 3)) yield { q: `${op} ${s}`, file: 'image' };
  for (const op of AUD_OPS) yield { q: `${op} this`, file: 'audio' };
  for (const [fam, fmts] of Object.entries(FMT)) for (const f of fmts) yield { q: `convert this to ${f}`, file: fam as FileFam };
  // Graph-grounded conversions across families: yields genuine tool/chain/offer.
  for (const fam of FILE_FAMS) for (const t of CONV_TARGETS) {
    if (t === fam) continue;
    for (const q of CONV_PHRASE(NOUN[fam as string], t)) yield { q, file: fam };
  }
  for (const tmpl of QUESTIONS) for (const t of QTOPICS) yield { q: tmpl.replace('{x}', t), file: null };
  for (const c of CHATS) yield { q: c, file: null };
  for (const i of IMPOSSIBLE) yield { q: i, file: null };
  for (const c of CHAINS) yield { q: c, file: c.includes('audio') || c.includes('transcribe') ? 'audio' : c.includes('video') ? 'video' : 'image' };
  // generic creates / qr / generators
  for (const q of ['make a qr code for my website', 'generate a strong password', 'create a color palette', 'make a poster that says hello']) yield { q, file: null };
}

// Build every example, then BALANCE: brute-forcing nonsense conversion pairs
// over-produces 'offer'. The live bug we're fixing was OVER-declining, so we
// cap 'offer' to ~the 'chain' count (deterministic stride subsample) to keep
// the model action-biased while still teaching it to decline nonsense.
type Ex = { action: string; line: string };
const built: Ex[] = [];
for (const { q, file } of corpus()) {
  const label = labelDecision(q, file);
  const cands = candidatesFor(q, file);
  const { messages } = decisionPrompt(q, cands, { hasFile: file != null, fileFamily: file });
  const assistant = JSON.stringify({ action: label.action, ...(label.tools.length ? { tools: label.tools } : {}), ...(label.query ? { query: label.query } : {}), ...(label.reply ? { reply: label.reply } : {}) });
  built.push({ action: label.action, line: JSON.stringify({ messages: [{ role: 'system', content: messages[0].content }, { role: 'user', content: messages[1].content }, { role: 'assistant', content: assistant }] }) });
}
const chainCount = built.filter((e) => e.action === 'chain').length;
const offers = built.filter((e) => e.action === 'offer');
const offerCap = Math.max(chainCount, 40);
const stride = offers.length > offerCap ? offers.length / offerCap : 1;
const keepOffer = new Set<number>();
for (let i = 0; i < offerCap && Math.floor(i * stride) < offers.length; i++) keepOffer.add(Math.floor(i * stride));
let oi = -1;
const kept = built.filter((e) => (e.action !== 'offer' ? true : keepOffer.has(++oi)));

const lines = kept.map((e) => e.line);
const byAction: Record<string, number> = {};
for (const e of kept) byAction[e.action] = (byAction[e.action] ?? 0) + 1;

const outDir = join(process.cwd(), 'lib', 'ai', 'eval', 'out');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'brain-train.jsonl');
writeFileSync(outPath, lines.join('\n') + '\n');
console.log(`Wrote ${lines.length} training examples → ${outPath}`);
console.log('Action distribution:', byAction);
console.log('Sample:', lines[0].slice(0, 200));
