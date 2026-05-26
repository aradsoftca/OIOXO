/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * gen-conductor-data — the AGENTIC CONDUCTOR data engine (BRAIN_PLAN.md §3.5).
 *
 * Distills a frontier teacher's MULTI-TURN agentic planning over OUR REAL capability
 * set into training trajectories for the small stateful conductor. The conductor's
 * job is NOT to re-implement the planners (planner.ts / plan-graph.ts / job.ts already
 * chain tools, extract params, infer prerequisites, flag the can't-do boundary) — it
 * is to be the TRAINED BRAIN that tracks a goal across turns and DRIVES those planners
 * robustly, on infinite phrasings.
 *
 * Each training row = ONE TURN of a dialogue, labeled with what the conductor must
 * output that turn:
 *   input : { message, hasFile, fileType, history[], goalStateIn }
 *   label : { turnRole, goalStateOut, chain[], boundary[], params, mediaNeed, ask? }
 *
 * The teacher generates DIVERSE dialogues (not the sample cases — the model-first
 * rule: learn the SKILL, never memorize pdf→jpg/email/diabetes). We GROUND it with
 * the real capability inventory below so every chain step is a real tool id and every
 * "can't" is a true boundary (e.g. we can DRAFT an email, we cannot SEND one).
 *
 * Run: N=... GEMINI_API_KEY=... npx tsx lib/ai/eval/gen-conductor-data.ts
 * Output (gitignored moat): lib/ai/eval/out/conductor-data.jsonl
 */
import * as fs from 'fs';
import * as path from 'path';
import { TOOLS } from '@/lib/registry';

const KEY = process.env.GEMINI_API_KEY;
// Teacher = gemini-2.5-pro for the real training set (teacher quality is the lever).
// Override to gemini-2.5-flash for quick smoke tests: GEN_MODEL=gemini-2.5-flash.
const MODEL = process.env.GEN_MODEL || 'gemini-2.5-pro';

// ── The running agent state, carried turn to turn (BRAIN_PLAN §3.5) ───────────
export type TurnRole =
  | 'new-goal'        // starts a fresh objective
  | 'parameter'       // adds a constraint/value to the current goal ("just page 3 and 5")
  | 'append-step'     // adds a step to the chain ("and then email it")
  | 'correction'      // changes/undoes something ("no, pages 2 and 4")
  | 'confirmation'    // yes/go-ahead/that's right
  | 'question'        // a question (may be about the task or general)
  | 'chitchat';       // social, no task

export interface ChainStep {
  capability: string;          // a real tool id, app id, or an action verb
  params?: Record<string, unknown>;
  can: boolean;                // do we actually have this capability?
  alternative?: string;        // if !can, the nearest thing we CAN do (e.g. draft-email)
}
export interface GoalState {
  goal: string;                // plain-language objective accumulated so far
  chain: ChainStep[];          // ordered capabilities to reach it
  pending?: string;            // the one missing thing blocking progress (a file, a value)
}
export interface TurnLabel {
  turnRole: TurnRole;
  goalStateOut: GoalState;     // the state AFTER applying this turn
  mediaNeed?: 'image-search' | 'ocr' | 'none';
  ask?: string;                // the single clarifying ask, when blocked
  reply: string;               // the natural, honest narration the user should hear
}

// ── The CAPABILITY INVENTORY — ground truth of what the AI CAN and CAN'T do ──
// The teacher MUST plan only within this, so trajectories are executable and the
// boundary labels are true. Tools come from the live registry; apps + the explicit
// CANNOT list encode the hard edges (the "I can draft but not send email" rule).
const CATEGORIES = Array.from(new Set(TOOLS.map((t) => t.category)));
const APPS = ['call', 'send-file (p2p)', 'group-chat', 'screen-share', 'clipboard', 'watch-together'];
// Things users routinely ask for that we genuinely CANNOT do — paired with the
// nearest thing we CAN, so the conductor learns honest-limit + offer, never a bare no.
const CANNOT: { ask: string; alternative: string }[] = [
  { ask: 'send an email', alternative: 'draft the email for you to send' },
  { ask: 'post to social media / publish online', alternative: 'write the post + caption for you to paste' },
  { ask: 'send a text/SMS or WhatsApp', alternative: 'write the message for you to send' },
  { ask: 'browse a logged-in account / make a purchase', alternative: 'find the info or draft what to enter' },
  { ask: 'set a reminder / calendar event on your device', alternative: 'write the event details for you to add' },
  { ask: 'print', alternative: 'produce the file (e.g. a PDF) ready for you to print' },
];

/** A compact, teacher-readable description of our powers (so it plans within them). */
function capabilityBrief(): string {
  return [
    `TOOL CATEGORIES (each has many specific tools, all run on-device): ${CATEGORIES.join(', ')}.`,
    `Examples of real chains: convert→edit→package; pdf page-ops; image resize/compress/convert; audio/video edit; text/dev/calc/color/time ops.`,
    `WRITE forms (we author text): article, essay, report, blog, story, poem, letter, email-DRAFT, cover-letter, speech, script, guide, review, list, outline, summary, explainer.`,
    `APPS we can launch: ${APPS.join(', ')}.`,
    `ANSWER/RESEARCH: gather many live sources, cross-check, answer with citations; read video transcripts; show images.`,
    `MULTIMODAL: OCR a sent image's text, search image similarity — then ANALYZE + decide at the moment (no pre-baked knowledge).`,
    `WE CANNOT (offer the paired alternative instead): ${CANNOT.map((c) => `${c.ask} → ${c.alternative}`).join('; ')}.`,
  ].join('\n');
}

// ── Trajectory SEEDS — situation TYPES to vary, NOT scripts. The teacher invents
//    diverse concrete dialogues per type so the conductor learns the general skill.
const SITUATION_TYPES = [
  'a multi-step file task where a later turn adds a PARAMETER mid-chain',
  'a file task where a later turn APPENDS a step we CAN do',
  'a task where a later turn appends a step we CANNOT do (offer the alternative)',
  'a request missing an input, so the assistant must ASK for exactly one thing',
  'a CORRECTION turn that changes a parameter or removes a step',
  'a sent image + "what is this?" (image-similarity → identify)',
  'a sent product/label image + a health/suitability question (OCR → search → analyze → decide)',
  'a compound single sentence that already names several steps',
  'a goal that needs a prerequisite conversion the user did not mention',
  'a mix: a task in progress, then an off-topic question, then back to the task',
  'a vague goal the assistant must shape into a concrete chain conversationally',
  'a research/answer turn that then leads into a WRITE step (e.g. "now write it up")',
];

const ROLES = ['new-goal', 'parameter', 'append-step', 'correction', 'confirmation', 'question', 'chitchat'];

const SYSTEM = `You are generating TRAINING DATA for a small on-device assistant's PLANNING brain.
Invent ONE realistic multi-turn dialogue of the requested situation type. Vary domain,
phrasing, length and user style widely (casual, typos, run-ons; occasionally another
language). For EVERY user turn, output the label the brain must produce: the turn's ROLE
relative to the running goal, the updated goal + ordered chain (each step marked can/can't
— a can:false step MUST include the nearest thing we CAN do as "alternative"), extracted
params, media need, one clarifying ask if blocked, and a warm, honest reply. Plan ONLY
within the stated capabilities. Never invent a tool we don't have.`;

function buildPrompt(situation: string): string {
  return `${SYSTEM}

OUR CAPABILITIES:
${capabilityBrief()}

SITUATION TYPE: ${situation}

Return STRICT JSON only:
{"turns":[{"user":"<what the user types>","hasFile":false,"fileType":null,"turnRole":"<one of: ${ROLES.join(', ')}>","goal":"<plain-language objective so far>","chain":[{"step":"<a capability/action>","can":true,"alternative":"<only when can:false>"}],"params":{},"mediaNeed":"none","ask":"<one thing to ask if blocked, else empty>","reply":"<the assistant's natural reply>"}]}
2-4 turns. fileType is one of image/pdf/audio/video/text or null. mediaNeed is none/image-search/ocr.`;
}

async function gemini(prompt: string): Promise<string> {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.95, maxOutputTokens: MODEL.includes('flash') ? 4000 : 8000, responseMimeType: 'application/json',
          ...(MODEL.includes('flash') ? { thinkingConfig: { thinkingBudget: 0 } } : {}) } }) },
  );
  if (!r.ok) return '';
  return ((await r.json())?.candidates?.[0]?.content?.parts?.map((x: any) => x.text).join('') ?? '').trim();
}

/** A turn is usable only if it is well-formed AND honest: a step we can't do must name
 *  a real alternative (the can't-do→offer behavior we want the conductor to learn). */
function validTurn(t: any): boolean {
  if (!t || typeof t.user !== 'string' || !t.user.trim()) return false;
  if (!ROLES.includes(t.turnRole)) return false;
  if (typeof t.reply !== 'string' || !t.reply.trim()) return false;
  if (!Array.isArray(t.chain)) return false;
  for (const c of t.chain) {
    if (!c || typeof c.step !== 'string' || typeof c.can !== 'boolean') return false;
    if (c.can === false && (typeof c.alternative !== 'string' || !c.alternative.trim())) return false;
  }
  return true;
}

async function main() {
  if (!KEY) { console.error('set GEMINI_API_KEY'); process.exit(2); }
  const N = process.env.N ? Number(process.env.N) : 30;
  const outDir = path.join(process.cwd(), 'lib/ai/eval/out');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'conductor-data.jsonl');
  const ws = fs.createWriteStream(outFile, { flags: 'w' });
  console.log(`conductor data · model ${MODEL} · N=${N} dialogues`);
  let dialogs = 0, rows = 0, rejected = 0;
  for (let i = 0; i < N; i++) {
    const situation = SITUATION_TYPES[i % SITUATION_TYPES.length];
    const raw = await gemini(buildPrompt(situation)).catch(() => '');
    let parsed: any;
    try { parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? raw); } catch { rejected++; console.log(`[${i + 1}/${N}] reject(parse)`); continue; }
    const turns = parsed?.turns;
    if (!Array.isArray(turns) || !turns.length || !turns.every(validTurn)) { rejected++; console.log(`[${i + 1}/${N}] reject(shape) · ${situation.slice(0, 32)}`); continue; }
    dialogs++;
    const history: { role: string; text: string }[] = [];
    for (const t of turns) {
      ws.write(JSON.stringify({
        input: { message: t.user, hasFile: !!t.hasFile, fileType: t.fileType ?? null, history: [...history] },
        label: { turnRole: t.turnRole, goal: t.goal ?? '', chain: t.chain, params: t.params ?? {}, mediaNeed: t.mediaNeed ?? 'none', ask: t.ask ?? '', reply: t.reply },
      }) + '\n');
      rows++;
      history.push({ role: 'user', text: t.user }, { role: 'assistant', text: t.reply });
    }
    console.log(`[${i + 1}/${N}] ${turns.length} turns · ${situation.slice(0, 36)}`);
  }
  ws.end();
  console.log(`\ndialogs ${dialogs}/${N} (rejected ${rejected}) → ${rows} per-turn rows → ${outFile}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
