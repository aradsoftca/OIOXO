/**
 * Routing harness — mirrors AiApp.routeAndAct's decision order using the REAL
 * matchers, so we can hard-test many user phrasings in Node (no browser) and
 * spot misroutes. Run: `npx tsx scripts/test-routing.ts`
 */
import { planConvert, resolveQuickSkill } from '@/lib/ai-actions';
import { detectIntent } from '@/lib/ai-magic';
import { matchRecipe } from '@/lib/ai/recipes';
import { matchApp } from '@/lib/ai/apps';
import { docIntent } from '@/lib/ai/docqa';
import { searchTools, confidence } from '@/lib/ai/retrieval';
import { isGeneralQuestion, CONTACT_INTENT, classifyContact, HELP_INTENT, DOC_REFERS_RE, CONVERT_PHRASE } from '@/lib/ai/route-intents';

type FileKind = 'image' | 'pdf' | 'audio' | 'video' | null;
interface Ctx { file?: FileKind; lastFile?: boolean; lastDoc?: boolean }

/* eslint-disable @typescript-eslint/no-explicit-any */
function predict(text: string, ctx: Ctx = {}): string {
  const fileCat: FileKind = ctx.file ?? null;
  // 1) Convert
  const plan: any = planConvert(text, fileCat as any);
  if (plan && plan.kind !== 'none') return `convert:${plan.kind}${plan.target ? `→${plan.target}` : ''}`;
  // 1.5) Format conversion the planner didn't run → converter
  if (CONVERT_PHRASE.test(text)) return 'convert-hub';
  // 2) Quick skill
  if (resolveQuickSkill(text)) return 'skill';
  // 2.5) Help / capabilities
  if (!ctx.file && HELP_INTENT.test(text)) return 'help';
  // 3) Generative
  const gi: any = detectIntent(text);
  if (['calc', 'qr', 'palette', 'poster', 'art', 'svg'].includes(gi.kind)) return `gen:${gi.kind}`;
  // 3.35) Reach a friend
  if (CONTACT_INTENT.test(text)) return `contact:${classifyContact(text, !!(ctx.file || ctx.lastFile)).kind}`;
  // 3.4) Doc Q&A
  const fresh = ctx.file === 'pdf' || ctx.file === 'image';
  const docInCtx = fresh || !!ctx.lastDoc;
  if (docInCtx) {
    const di = docIntent(text);
    if (di && !(di === 'question' && !fresh && !DOC_REFERS_RE.test(text))) return `docqa:${di}`;
  }
  // 3.45) General question → chat model
  if (!ctx.file && !ctx.lastFile && !ctx.lastDoc && isGeneralQuestion(text)) return 'chat(question)';
  // 3.5) Recipe
  const cat = fileCat === 'image' || fileCat === 'audio' ? fileCat : null;
  if (matchRecipe(text, cat as any)) return 'recipe';
  // 3.6) App
  const app = matchApp(text);
  if (app) return `app:${app.id}`;
  // 4) Tool routing (lexical only — embeddings not loaded in Node)
  const results = searchTools(text, { fileCategory: fileCat as any });
  const conf = confidence(results);
  if (results[0] && conf !== 'weak') return `tool:${results[0].doc.id}(${conf})`;
  return 'chat';
}

interface Scenario { t: string; ctx?: Ctx; want?: RegExp; note?: string }
const S: Scenario[] = [
  // — Casual / general questions (should answer, not route to tools) —
  { t: 'what is ipv4', want: /^chat\(question\)/ },
  { t: 'what is ipv4 generaly', want: /^chat\(question\)/ },
  { t: 'why is the sky blue', want: /^chat\(question\)/ },
  { t: 'how does https work', want: /^chat\(question\)/ },
  { t: 'who are you', want: /chat/ },
  { t: 'tell me a joke', want: /chat/ },
  { t: 'explain quantum computing', want: /^chat\(question\)/ },
  // — Help / capabilities —
  { t: 'what can you do', want: /^help$/ },
  { t: 'what can you do?', want: /^help$/ },
  { t: 'what tools do you have', want: /^help$/ },
  { t: 'how can you help me', want: /^help$/ },
  // — Conversions / jobs —
  { t: 'convert this to png', ctx: { file: 'image' }, want: /^convert/ },
  { t: 'convert mp4 to mp3', want: /^convert|tool/ },
  { t: 'png to jpg', want: /^convert|tool/ },
  { t: 'turn this pdf into word', ctx: { file: 'pdf' }, want: /convert-hub/ },
  { t: 'convert document to pdf', want: /convert/ },
  { t: 'export this to png', ctx: { file: 'image' }, want: /convert/ },
  { t: 'change to dark mode', want: /chat|tool/, note: 'not a format' },
  { t: 'compress these photos', want: /tool|recipe|convert/ },
  { t: 'remove the background', ctx: { file: 'image' }, want: /tool|recipe/ },
  { t: 'make this grayscale', ctx: { file: 'image' }, want: /tool|recipe/ },
  // — Find a tool (question shaped but action word present) —
  { t: 'what tool can merge pdfs', want: /tool|help/ },
  { t: 'how do i remove a background', want: /tool|recipe|chat/ },
  // — Reach a friend —
  { t: 'send this file to my friend', ctx: { file: 'image' }, want: /contact:send-file/ },
  { t: 'i want to send this to my friend', ctx: { file: 'pdf' }, want: /contact:send-file/ },
  { t: 'can i video call my friend?', want: /contact:app/ },
  { t: 'can i call video to my friend', want: /contact:app/ },
  { t: 'voice call my friend', want: /contact:app/ },
  { t: 'start a chat with my team', want: /contact:app|app:chat/ },
  { t: 'share my-link.com with a friend', want: /contact:qr/ },
  { t: 'send a file to someone', want: /contact/ },
  { t: 'i want to talk to my friend', want: /contact:app/ },
  // — Generative —
  { t: 'qr for my-link.com', want: /gen:qr/ },
  { t: 'make a qr code for example.com', want: /gen:qr|contact:qr/ },
  { t: 'what is 12*34', want: /gen:calc/ },
  { t: 'draw a fox logo', want: /gen:(art|svg)/ },
  { t: 'a color palette for autumn', want: /gen:palette|tool/ },
  // — Document tasks —
  { t: 'summarise this', ctx: { file: 'pdf' }, want: /docqa:summarize/ },
  { t: 'what does this say', ctx: { file: 'image' }, want: /docqa/ },
  { t: 'extract the text', ctx: { file: 'pdf' }, want: /docqa:extract/ },
  { t: 'what is the total in this invoice', ctx: { lastDoc: true }, want: /docqa/ },
  { t: 'what is ipv4', ctx: { lastDoc: true }, want: /chat|tool/, note: 'stale doc must NOT hijack' },
  // — Apps directly —
  { t: 'start a video call', want: /app:call|contact/ },
  { t: 'open the whiteboard', want: /app:board|tool|chat/ },
  { t: 'sync my clipboard', want: /app:clipboard|tool|chat/ },
  { t: 'watch a video together', want: /app:watch|contact/ },
  // — Edge / tricky —
  { t: 'send', want: /chat|tool|app|contact/, note: 'bare verb' },
  { t: 'call', want: /chat|tool|contact/, note: 'bare verb' },
  { t: 'hello', want: /chat/ },
  { t: 'thanks!', want: /chat/ },
  { t: 'recall my last file', want: /chat|tool|docqa/, note: 'recall != call' },
  // — Edit-verb vs art-noun collisions (the bug class) —
  { t: 'remove the background', ctx: { file: 'image' }, want: /tool|recipe/ },
  { t: 'remove the background', want: /tool|chat/, note: 'no file' },
  { t: 'blur the background', ctx: { file: 'image' }, want: /tool|recipe/ },
  { t: 'crop the sunset photo', ctx: { file: 'image' }, want: /tool|recipe/ },
  { t: 'upscale this', ctx: { file: 'image' }, want: /tool|recipe/ },
  { t: 'replace the background with the ocean', ctx: { file: 'image' }, want: /tool|recipe|chat/ },
  // — Genuine art (should still work) —
  { t: 'make a wallpaper of a galaxy', want: /gen:art/ },
  { t: 'abstract sunset wallpaper', want: /gen:art/ },
  { t: 'youtube thumbnail about pyramids', want: /gen:poster/ },
  { t: 'make me a poster for my event', want: /gen:poster/ },
  // — Network skills (need a target) —
  { t: 'dns records for example.com', want: /^skill/ },
  { t: 'what is dns', want: /chat\(question\)/ },
  { t: "what's my ip address", want: /^skill/ },
  { t: 'ssl check for example.com', want: /tool|chat/ },
  // — PDF / media jobs —
  { t: 'merge these pdfs', ctx: { file: 'pdf' }, want: /tool|recipe/ },
  { t: 'split this pdf', ctx: { file: 'pdf' }, want: /tool|recipe/ },
  { t: 'extract audio from video', ctx: { file: 'video' }, want: /tool/ },
  { t: 'record my screen', want: /tool|chat/ },
  { t: 'scan this document', ctx: { file: 'image' }, want: /tool|docqa|recipe/ },
  // — Greetings / chit-chat —
  { t: 'good morning', want: /chat/ },
  { t: "i'm bored", want: /chat/ },
];

let pass = 0, fail = 0;
const rows: string[] = [];
for (const s of S) {
  const got = predict(s.t, s.ctx);
  const ok = s.want ? s.want.test(got) : true;
  if (s.want) (ok ? pass++ : fail++);
  const flag = s.want ? (ok ? 'ok ' : 'XXX') : '  ?';
  const ctxStr = s.ctx ? ` [${JSON.stringify(s.ctx)}]` : '';
  rows.push(`${flag}  ${got.padEnd(26)} ⇐ "${s.t}"${ctxStr}${s.want && !ok ? `  (want ${s.want})` : ''}${s.note ? `  // ${s.note}` : ''}`);
}
console.log(rows.join('\n'));
console.log(`\n${pass} pass, ${fail} fail (of ${S.filter((x) => x.want).length} asserted)`);
