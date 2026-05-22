'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as React from 'react';
import Link from 'next/link';
import { Bot, Send, Loader2, ShieldCheck, Square, AlertTriangle, User, ArrowRight, Download, RefreshCw, Paperclip, X, FileDown, Mic } from 'lucide-react';
import { TOOLS } from '@/lib/registry';
import { CATALOG } from '@/lib/catalog';
import { detectIntent, safeCalc, paletteFor, renderArt, renderEmojiArt, emojiFor, svgSystemPrompt, extractSvg, funReply } from '@/lib/ai-magic';
import { planConvert, runConvert, fileCategory, resolveQuickSkill, type ActionResult } from '@/lib/ai-actions';
import { routeToTool, type FileCategory } from '@/lib/ai/router';
import { warmEmbeddings } from '@/lib/ai/embed';
import { inlineCap } from '@/lib/ai/capabilities';
import { matchRecipe } from '@/lib/ai/recipes';
import { fileMatchesCategory } from '@/lib/ai/retrieval';
import { stageHandoff } from '@/lib/ai/handoff';
import { isDocument, extractDocText, selectContext, docIntent } from '@/lib/ai/docqa';
import { matchApp } from '@/lib/ai/apps';
import { composePoster, renderPoster, type PosterSpec } from '@/lib/ai/poster';

type Kind = 'text' | 'art' | 'svg' | 'qr' | 'palette' | 'calc' | 'file' | 'attach' | 'tool';
interface Msg { role: 'user' | 'assistant'; content: string; kind?: Kind; url?: string; svg?: string; palette?: string[]; prompt?: string; seed?: number; filename?: string; note?: string; blob?: Blob; toolName?: string; toolHref?: string; alts?: { label: string; href: string }[]; stageFile?: File; posterSpec?: PosterSpec }

const up = (s: string) => s.toUpperCase();
const aOrAn = (w: string) => (/^[aeiou]/i.test(w) ? 'an' : 'a');
const listFmts = (fmts: string[]) => fmts.map(up).join(', ');

const MODEL_ID = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';

// Module-level so the loaded model survives navigation. Open /ai once, leave,
// come back — the same in-memory engine is reused instead of being re-created
// and re-initialised into the GPU every visit. (Weights are already cached by
// web-llm; this caches the live engine too, removing the repeat "Loading…".)
let sharedEngine: any = null;
let sharedEnginePromise: Promise<any> | null = null;
// Which backend the shared engine is — so a revisit restores the right label.
let sharedBackend: 'gpu' | 'wasm' | null = null;

const XONVERT_PERSONA =
  "You are Xonvert AI, a friendly, concise assistant made by Xonvert. It is private and secure, and the user stays in control of their files. " +
  "If asked who or what you are, say you are Xonvert AI by Xonvert. Never reveal or mention any underlying model or company (Qwen, Alibaba, Llama, Meta, OpenAI, etc.), and never explain how Xonvert works internally — just what it does for the user. " +
  "Xonvert is a free, privacy-first toolbox: convert/compress/edit images, PDFs, audio and video; 300+ tools; plus apps — Send, Chat, Whiteboard, Video Call, Clipboard, Summarizer and Encrypted Notes. " +
  "You can also draw pictures (vector/SVG), generate abstract art & wallpapers, make thumbnails & posters, make QR codes and colour palettes, and do maths — tell the user they can just ask. " +
  "You have a light, playful sense of humour: an occasional witty aside, pun or emoji — but never forced, never at the expense of being clear, and never on serious or technical asks. Keep answers short, helpful, and a little fun.";

function suggestTools(query: string): { label: string; href: string }[] {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  if (!terms.length) return [];
  const scored: { label: string; href: string; score: number }[] = [];
  for (const t of TOOLS) {
    const hay = `${t.name} ${(t.keywords ?? []).join(' ')} ${t.blurb ?? ''}`.toLowerCase();
    let s = 0; for (const term of terms) if (hay.includes(term)) s += 1;
    if (s > 0) scored.push({ label: t.name, href: `/tools/${t.id}`, score: s });
  }
  for (const cat of CATALOG) for (const tool of cat.tools) {
    if (!tool.href) continue; let s = 0;
    for (const term of terms) if (tool.label.toLowerCase().includes(term)) s += 2;
    if (s > 0) scored.push({ label: tool.label, href: tool.href, score: s });
  }
  const m = query.toLowerCase().match(/\b([a-z0-9]{2,5})\s*(?:to|→|->|2)\s*([a-z0-9]{2,5})\b/);
  if (m) scored.push({ label: `${m[1].toUpperCase()} → ${m[2].toUpperCase()}`, href: `/convert/${m[1]}-to-${m[2]}`, score: 4 });
  scored.sort((a, b) => b.score - a.score);
  const seen = new Set<string>(); const out: { label: string; href: string }[] = [];
  for (const s of scored) { if (seen.has(s.href)) continue; seen.add(s.href); out.push({ label: s.label, href: s.href }); if (out.length >= 4) break; }
  return out;
}

function artToUrl(prompt: string, seed: number): string {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 640;
  const emoji = emojiFor(prompt);
  if (emoji) renderEmojiArt(c, emoji, prompt, seed); else renderArt(c, prompt, seed);
  return c.toDataURL('image/png');
}
function download(url: string, name: string) {
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}
function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  download(url, name);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function prettyBytes(n: number): string {
  if (n <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB']; let v = n, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}

/**
 * Terminal typewriter: reveals `text` character-by-character with a blinking
 * block caret. When `active` is false (older messages) it shows everything at
 * once. Reads the latest text via a ref so a single rAF loop keeps "typing"
 * tokens as they stream in, without restarting on every update.
 */
function TypeOut({ text, active }: { text: string; active: boolean }) {
  const [n, setN] = React.useState(active ? 0 : text.length);
  const textRef = React.useRef(text);
  textRef.current = text;
  React.useEffect(() => {
    if (!active) { setN(text.length); return; }
    let raf = 0, last = 0, acc = 0;
    const CPS = 140; // chars/sec — fast enough to keep up with streaming
    const step = (t: number) => {
      if (last) acc += ((t - last) * CPS) / 1000;
      last = t;
      const whole = Math.floor(acc);
      if (whole > 0) { acc -= whole; setN((c) => Math.min(textRef.current.length, c + whole)); }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  const shown = active ? Math.min(n, text.length) : text.length;
  return (<>{text.slice(0, shown)}{active && <span className="terminal-caret" aria-hidden />}</>);
}

// Rotating example prompts — a wide, honest spread of what Xonvert actually
// does well: 300+ tools, thousands of file conversions, real document & media
// editing, on-device understanding, and live peer-to-peer apps (no uploads).
// Deliberately light on "generate art" — that's not our strength. Shown one at
// a time with an old-PC typewriter effect (type → hold → erase → next, random).
const HINT_PROMPTS = [
  // Conversions — the core
  'convert almost any file — just drop it in',
  'turn a PDF into an editable Word doc',
  'convert a Word doc to a clean PDF',
  'convert MP4 to MP3',
  'convert HEIC photos to JPG',
  'convert a spreadsheet to Excel or CSV',
  'turn an EPUB ebook into a PDF',
  'extract a ZIP or RAR archive',
  // PDF toolkit
  'merge several PDFs into one',
  'compress a PDF so it fits in an email',
  'split, reorder or delete PDF pages',
  'password-protect or unlock a PDF',
  // Real image work (no AI art needed)
  'remove the background from a photo',
  'upscale a low-resolution image',
  'compress photos for the web without losing quality',
  'scan a document with your camera',
  'strip location & EXIF data from a photo',
  'pull the text out of a screenshot',
  'resize a whole batch of images at once',
  // Audio / video
  'record your screen, right in the browser',
  'trim and compress a long video',
  'turn a video into a looping GIF',
  'reframe a wide video vertical for Reels & Shorts',
  'clean background noise out of a recording',
  'transcribe an audio file to text',
  // Understand documents
  'summarise a long PDF in seconds',
  'ask questions about a document',
  // Dev / network / utility
  'format or validate messy JSON',
  'check a website’s SSL and speed',
  'generate a QR code for any link',
  // Live peer-to-peer apps — nothing uploaded to a server
  'send a large file with a private link — no upload',
  'start a private, encrypted video call',
  'open an end-to-end encrypted group chat',
  'watch a video together, perfectly in sync',
  'sync your clipboard across your devices',
  'sketch together on a shared whiteboard',
  'or just ask — 300+ tools, all in one place',
];

/**
 * Old-PC rotating hint: types a phrase out, holds, erases, then types the next
 * (random) one — with a blinking caret. Decorative; pure CSS caret blink.
 */
function RotatingHint({ phrases }: { phrases: string[] }) {
  const [idx, setIdx] = React.useState(() => Math.floor(Math.random() * phrases.length));
  const [shown, setShown] = React.useState('');
  const [phase, setPhase] = React.useState<'typing' | 'holding' | 'deleting'>('typing');
  React.useEffect(() => {
    const full = phrases[idx] ?? '';
    let timer: ReturnType<typeof setTimeout>;
    if (phase === 'typing') {
      if (shown.length < full.length) timer = setTimeout(() => setShown(full.slice(0, shown.length + 1)), 34 + Math.random() * 46);
      else timer = setTimeout(() => setPhase('holding'), 1700);
    } else if (phase === 'holding') {
      timer = setTimeout(() => setPhase('deleting'), 900);
    } else {
      if (shown.length > 0) timer = setTimeout(() => setShown(full.slice(0, shown.length - 1)), 16);
      else timer = setTimeout(() => { setIdx((i) => { let n = Math.floor(Math.random() * phrases.length); if (n === i) n = (n + 1) % phrases.length; return n; }); setPhase('typing'); }, 260);
    }
    return () => clearTimeout(timer);
  }, [shown, phase, idx, phrases]);
  return (
    <span className="text-[var(--term-fg)] terminal-glow">“{shown}”<span className="terminal-caret" aria-hidden /></span>
  );
}

export default function AiApp({ embedded = false }: { embedded?: boolean } = {}) {
  const [supported, setSupported] = React.useState<boolean | null>(null);
  const [backend, setBackend] = React.useState<'gpu' | 'wasm' | null>(sharedBackend);
  const [loadState, setLoadState] = React.useState<'idle' | 'loading' | 'ready'>(sharedEngine ? 'ready' : 'idle');
  const [loadPct, setLoadPct] = React.useState(0);
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [suggest, setSuggest] = React.useState<{ label: string; href: string }[]>([]);
  const [input, setInput] = React.useState('');
  const [generating, setGenerating] = React.useState(false);
  const [copied, setCopied] = React.useState('');
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);
  const [pendingFiles, setPendingFiles] = React.useState<File[]>([]);
  const [recording, setRecording] = React.useState(false);
  const [transcribing, setTranscribing] = React.useState(false);
  // Mobile "focus mode": the panel expands to fullscreen while in use so the
  // chat scroll isn't fighting the page scroll. Desktop is always inline.
  const [expanded, setExpanded] = React.useState(false);

  const engineRef = React.useRef<any>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const voiceActiveRef = React.useRef(false);
  const stopRef = React.useRef(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const startedRef = React.useRef(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  // The text of a pending convert request, waiting for the user to pick a file.
  const armedRef = React.useRef<string | null>(null);
  // The last file the user worked with, so "convert it to X" reuses it.
  const lastFileRef = React.useRef<File | null>(null);

  const loadModel = React.useCallback(async () => {
    // Already loaded earlier this session (e.g. revisiting /ai) — reuse it.
    if (sharedEngine) { engineRef.current = sharedEngine; setBackend(sharedBackend); setLoadState('ready'); void warmEmbeddings(); return; }
    if (startedRef.current) return; startedRef.current = true;
    const hasGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
    setBackend(hasGPU ? 'gpu' : 'wasm'); // label early so loading copy is correct
    setLoadState('loading'); setLoadPct(0);
    try {
      if (hasGPU) {
        // Fast path: on-device GPU via web-llm. Reuse an in-flight load if the
        // user navigated away and back mid-download.
        const webllm = await import('@mlc-ai/web-llm');
        sharedEnginePromise ??= webllm.CreateMLCEngine(MODEL_ID, { initProgressCallback: (r: any) => { if (typeof r.progress === 'number') setLoadPct(r.progress); } });
        engineRef.current = sharedEngine = await sharedEnginePromise;
        sharedBackend = 'gpu';
      } else {
        // Compatibility path: CPU/WASM via transformers.js, so chat works on
        // devices without WebGPU (some phones, older browsers).
        const { loadWasmEngine } = await import('@/lib/ai/wasm-llm');
        engineRef.current = sharedEngine = await loadWasmEngine((p) => setLoadPct(p));
        sharedBackend = 'wasm';
      }
      setBackend(sharedBackend);
      setLoadState('ready');
      // Warm the semantic tool index in the background — lexical routing works
      // until it's ready, then ranking gets sharper. Cached after first load.
      void warmEmbeddings();
    } catch (e) { console.error(e); setLoadState('idle'); startedRef.current = false; sharedEnginePromise = null; }
  }, []);

  React.useEffect(() => {
    // The panel works on any browser with WebAssembly: WebGPU gives the fast
    // path, otherwise we fall back to a CPU/WASM model. Only truly ancient
    // browsers without WASM are unsupported.
    const ok = typeof WebAssembly !== 'undefined';
    setSupported(ok);
    // On the dedicated page, load right away. When embedded (e.g. the homepage
    // hero) defer until the user actually engages, so casual visitors and SEO
    // crawlers don't pay the load — see the input's onFocus.
    if (ok && !embedded) void loadModel();
  }, [loadModel, embedded]);

  // Embedded: start loading the moment the user shows intent (focus/tap).
  const ensureLoaded = React.useCallback(() => {
    if (supported && !startedRef.current) void loadModel();
  }, [supported, loadModel]);

  // On phones, expand the panel to fullscreen the moment it's engaged.
  const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 768;
  const maybeExpand = React.useCallback(() => { if (isMobile()) setExpanded(true); }, []);

  // Tapping anywhere in the panel (other than a real control) focuses the input.
  const focusInput = React.useCallback((e?: React.MouseEvent) => {
    if (e) {
      const t = e.target as HTMLElement;
      if (t.closest('button, a, input, textarea, [role="button"]')) return;
    }
    ensureLoaded();
    // Focus synchronously inside the gesture so mobile keyboards open (iOS).
    textareaRef.current?.focus();
  }, [ensureLoaded]);

  // While expanded (mobile fullscreen), lock the page behind so only the chat
  // scrolls — the whole point is to stop the nested-scroll fight.
  React.useEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [expanded]);

  // If the viewport grows past mobile (rotation/resize), drop fullscreen mode.
  React.useEffect(() => {
    if (!expanded) return;
    const onResize = () => { if (!isMobile()) setExpanded(false); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [expanded]);

  React.useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages, generating]);

  const push = (m: Msg) => setMessages((p) => [...p, m]);

  // Replace the trailing placeholder message with a finished action result, and
  // keep the produced file as the working file so the user can chain edits
  // ("make it grayscale" → "now sharpen it" → "now compress it").
  const applyResult = (res: ActionResult) => {
    setMessages((m) => {
      const c = [...m];
      if (res.kind === 'file') c[c.length - 1] = { role: 'assistant', content: 'Done — your file is ready.', kind: 'file', blob: res.blob, filename: res.filename, note: res.note };
      else if (res.kind === 'image') c[c.length - 1] = { role: 'assistant', content: '', kind: 'art', url: res.url, filename: res.filename, note: res.note };
      else if (res.kind === 'text') c[c.length - 1] = { role: 'assistant', content: res.text };
      else c[c.length - 1] = { role: 'assistant', content: `⚠ ${res.text}` };
      return c;
    });
    if (res.kind === 'file') lastFileRef.current = new File([res.blob], res.filename, { type: res.blob.type });
    else if (res.kind === 'image' && res.blob) lastFileRef.current = new File([res.blob], res.filename ?? 'image.png', { type: res.blob.type });
    // Spoken reply when the request came in by voice.
    if (voiceActiveRef.current) {
      if (res.kind === 'text') speak(res.text);
      else if (res.kind === 'file' || res.kind === 'image') speak('Done — your file is ready.');
      else if (res.kind === 'error') speak(res.text);
    }
    // Proactive next step: a large image is worth offering to shrink/send.
    const big = (res.kind === 'image' || res.kind === 'file') && res.blob && res.blob.size > 900_000;
    if (big) push({ role: 'assistant', content: 'That’s still fairly large — say “compress it” to shrink it, or “send it” to share.' });
  };

  const runConvertAndShow = async (file: File, category: 'image' | 'audio', target: string) => {
    setGenerating(true);
    push({ role: 'assistant', content: `Converting to ${up(target)}…` });
    try { applyResult(await runConvert(file, category, target)); }
    catch (e) {
      console.error(e);
      setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: 'assistant', content: '⚠ That conversion failed — the file may be corrupt or in an unsupported format.' }; return c; });
    } finally { setGenerating(false); }
  };

  /**
   * Resolve a possible conversion request. Returns true if it was handled
   * (ran, asked for a file/format, or honestly refused), false if it isn't a
   * conversion at all and the caller should fall through to chat.
   */
  const handleConvert = async (rawText: string, file: File | null): Promise<boolean> => {
    const effFile = file ?? lastFileRef.current;            // "it" reuses the last file
    if (effFile) lastFileRef.current = effFile;
    const fileCat = effFile ? fileCategory(effFile) : null;
    // An attached file with no words is an implicit "convert this".
    const text = rawText.trim() || (effFile ? 'convert' : '');
    const plan = planConvert(text, fileCat);

    switch (plan.kind) {
      case 'none':
        return false;
      case 'run':
        await runConvertAndShow(effFile!, plan.category, plan.target);
        return true;
      case 'ask-file':
        armedRef.current = rawText;
        push({ role: 'assistant', content: plan.target
          ? `Sure — pick a file and I’ll convert it to ${up(plan.target)}, privately.`
          : 'Sure — pick a file and tell me which format you want.', kind: 'attach' });
        return true;
      case 'ask-format':
        push({ role: 'assistant', content: `Which format? I can turn ${aOrAn(plan.category)} ${plan.category} file into ${listFmts(plan.supported)}.` });
        return true;
      case 'unsupported':
        push({ role: 'assistant', content: `I can convert ${plan.category === 'image' ? 'images' : 'audio'} to ${listFmts(plan.supported)} — ${up(plan.target)} output isn’t supported yet.` });
        return true;
      case 'unsupported-input':
        push({ role: 'assistant', content: `I can’t process ${plan.fileCat} files yet — only images and audio for now.` });
        return true;
      case 'mismatch': {
        const offer = plan.fileCat === 'audio' ? 'WAV or MP3' : 'PNG, JPG, WebP or AVIF';
        push({ role: 'assistant', content: `That’s ${aOrAn(plan.fileCat)} ${plan.fileCat} file, so I can’t turn it into ${up(plan.target)} (${plan.targetCat === 'image' ? 'an image' : 'audio'} format). I can convert it to ${offer} instead.` });
        return true;
      }
    }
  };

  // Single entry point for a file arriving (picker or drag-drop). If a convert
  // request is waiting, run it now; otherwise just stage the file.
  const receiveFile = (f: File) => {
    lastFileRef.current = f;
    const armed = armedRef.current;
    if (armed !== null) {
      armedRef.current = null;
      push({ role: 'user', content: `📎 ${f.name}` });
      void process(armed, f);
      return;
    }
    setPendingFile(f);
  };

  /** Replace the trailing placeholder message's text content. */
  const setLast = (content: string) => setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: 'assistant', content }; return c; });

  /**
   * Document understanding: extract text / summarise / answer questions about a
   * dropped PDF or image (OCR), on-device. Returns true if handled.
   */
  const tryDocQA = async (text: string, file: File | null): Promise<boolean> => {
    const f = file ?? lastFileRef.current;
    if (!f || !isDocument(f)) return false;
    const intent = docIntent(text);
    if (!intent) return false;
    lastFileRef.current = f;
    setGenerating(true);
    push({ role: 'assistant', content: 'Reading the document…' });
    let docText = '';
    try { docText = await extractDocText(f); }
    catch { setLast('⚠ Could not read that document.'); setGenerating(false); return true; }
    if (!docText) { setLast('I couldn’t find any text in that document.'); setGenerating(false); return true; }

    if (intent === 'extract') {
      setLast(docText.length > 6000 ? `${docText.slice(0, 6000)}\n…` : docText);
      setGenerating(false);
      return true;
    }
    const context = intent === 'question' ? selectContext(docText, text, 1600) : docText.slice(0, 2200);
    const sys = intent === 'summarize'
      ? 'Summarise the document text the user provides in 3–5 short bullet points. Use only the given text.'
      : 'Answer the user’s question using ONLY the document text provided. If the answer isn’t in the text, say you couldn’t find it. Be concise.';
    const userMsg = intent === 'summarize' ? `Document:\n"""${context}"""` : `Document:\n"""${context}"""\n\nQuestion: ${text}`;
    stopRef.current = false;
    try {
      const stream = await engineRef.current.chat.completions.create({ messages: [{ role: 'system', content: sys }, { role: 'user', content: userMsg }], stream: true, temperature: 0.2 });
      let acc = '';
      for await (const ch of stream) { if (stopRef.current) break; acc += ch.choices[0]?.delta?.content ?? ''; setLast(acc); }
      if (!acc.trim()) setLast('I couldn’t find that in the document.');
      else if (voiceActiveRef.current) speak(acc);
    } catch { setLast('⚠ Could not analyse the document.'); }
    finally { setGenerating(false); }
    return true;
  };

  /**
   * Run the deterministic pipeline (convert → skill → generative → tool routing
   * + inline execution) for one phrasing of the request. Returns true if it
   * produced a result; false if nothing matched (caller may translate + retry).
   * Only pushes output on success, so it's safe to call twice.
   */
  const routeAndAct = async (text: string, file: File | null): Promise<boolean> => {
    // 1) Conversions — deterministic planner (validates target + file category).
    if (await handleConvert(text, file)) return true;

    // 2) Quick skills answered from our own server (e.g. "what is my IP").
    const skill = resolveQuickSkill(text);
    if (skill) {
      setGenerating(true);
      push({ role: 'assistant', content: '…' });
      try { applyResult(await skill.run(text)); }
      catch { setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: 'assistant', content: '⚠ That lookup failed.' }; return c; }); }
      finally { setGenerating(false); }
      return true;
    }

    // 3) Generative intents (calc / QR / palette / art / SVG).
    const intent = detectIntent(text);
    if (intent.kind === 'calc') {
      const r = safeCalc(intent.expr);
      push({ role: 'assistant', content: r ? `${intent.expr} = ${r}` : 'I couldn’t compute that.', kind: 'calc' });
      return true;
    }
    if (intent.kind === 'qr') {
      try { const QR = (await import('qrcode')).default; const url = await QR.toDataURL(intent.text, { width: 320, margin: 1 }); push({ role: 'assistant', content: intent.text, kind: 'qr', url }); }
      catch { push({ role: 'assistant', content: '⚠ Couldn’t make that QR.' }); }
      return true;
    }
    if (intent.kind === 'palette') { push({ role: 'assistant', content: '', kind: 'palette', palette: paletteFor(intent.prompt, Date.now()) }); return true; }
    if (intent.kind === 'poster') {
      setGenerating(true);
      push({ role: 'assistant', content: 'Designing your graphic…' });
      try {
        const seed = Math.floor(Math.random() * 1e9);
        const { url, spec } = await composePoster(intent.prompt, engineRef.current, seed);
        setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: 'assistant', content: spec.title || intent.prompt, kind: 'art', url, prompt: intent.prompt, seed, posterSpec: spec, filename: 'xonvert-thumbnail.png' }; return c; });
      } catch {
        setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: 'assistant', content: '⚠ Couldn’t design that graphic.' }; return c; });
      } finally { setGenerating(false); }
      return true;
    }
    if (intent.kind === 'art') { const seed = Math.floor(Math.random() * 1e9); push({ role: 'assistant', content: intent.prompt, kind: 'art', url: artToUrl(intent.prompt, seed), prompt: intent.prompt, seed }); return true; }
    if (intent.kind === 'svg') {
      const seed = Math.floor(Math.random() * 1e9);
      if (emojiFor(intent.prompt)) { push({ role: 'assistant', content: intent.prompt, kind: 'art', url: artToUrl(intent.prompt, seed), prompt: intent.prompt, seed }); return true; }
      setGenerating(true);
      try {
        const out = await engineRef.current.chat.completions.create({ messages: [{ role: 'system', content: svgSystemPrompt() }, { role: 'user', content: intent.prompt }], temperature: 0.5 });
        const svg = extractSvg(out.choices?.[0]?.message?.content ?? '');
        if (svg) push({ role: 'assistant', content: '', kind: 'svg', svg });
        else push({ role: 'assistant', content: intent.prompt, kind: 'art', url: artToUrl(intent.prompt, seed), prompt: intent.prompt, seed });
      } catch { push({ role: 'assistant', content: intent.prompt, kind: 'art', url: artToUrl(intent.prompt, seed), prompt: intent.prompt, seed }); }
      finally { setGenerating(false); }
      return true;
    }

    // 3.4) Document understanding — questions / summary / OCR on a PDF or image.
    if (await tryDocQA(text, file)) return true;

    // 3.5) Multi-step recipes (compound jobs) — deterministic ordered chains.
    //      High-precision triggers, so they never steal a single-tool request.
    const knownCat = file ? fileCategory(file) : (lastFileRef.current ? fileCategory(lastFileRef.current) : null);
    const recCat = knownCat === 'image' || knownCat === 'audio' ? knownCat : null;
    const recipe = matchRecipe(text, recCat);
    if (recipe) {
      const effFile = file ?? lastFileRef.current;
      if (effFile && fileCategory(effFile) === recipe.input) {
        lastFileRef.current = effFile;
        setGenerating(true);
        push({ role: 'assistant', content: `Working on it — I’ll ${recipe.verb}…` });
        try { applyResult(await recipe.run(effFile)); }
        catch (e) { console.error(e); setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: 'assistant', content: '⚠ That didn’t work — the file may be unsupported.' }; return c; }); }
        finally { setGenerating(false); }
        return true;
      }
      armedRef.current = text;
      push({ role: 'assistant', content: `Sure — pick ${aOrAn(recipe.input)} ${recipe.input} file and I’ll ${recipe.verb}.`, kind: 'attach' });
      return true;
    }

    // 3.6) Apps (Send / Call / Chat / Whiteboard / Clipboard / Watch / Notes).
    const app = matchApp(text);
    if (app) {
      const effFile = file ?? lastFileRef.current;
      const stageF = app.takesFile && effFile ? effFile : undefined;
      push({
        role: 'assistant',
        content: stageF ? `I’ll open ${app.name} with your file — the transfer starts automatically.` : `Opening ${app.name} — ${app.blurb}`,
        kind: 'tool', toolName: app.name, toolHref: app.href, stageFile: stageF,
      });
      return true;
    }

    // 4) Tool routing across all 323 (retrieval — no model). Inline-run when the
    //    match is a capability and we have the right file; otherwise open the tool.
    const fcRaw = file ? fileCategory(file) : null;
    const fc: FileCategory | null = fcRaw === 'image' || fcRaw === 'audio' || fcRaw === 'video' ? fcRaw : null;
    const routing = await routeToTool(text, fc);
    if (routing.top && routing.confidence !== 'weak') {
      // Ambiguous → grammar-constrained model tie-break among the candidates.
      let top = routing.top.doc;
      if (routing.confidence === 'ambiguous' && routing.candidates.length > 1) {
        const id = await pickToolId(text, routing.candidates.map((c) => ({ id: c.doc.id, name: c.doc.name, blurb: c.doc.blurb })));
        const m = id ? routing.candidates.find((c) => c.doc.id === id) : null;
        if (m) top = m.doc;
      }
      const cap = inlineCap(top.id);
      const effFile = file ?? lastFileRef.current;
      if (cap) {
        if (effFile && fileCategory(effFile) === cap.input) {
          lastFileRef.current = effFile;
          setGenerating(true);
          push({ role: 'assistant', content: `Working on it — I’ll ${cap.verb}…` });
          try { applyResult(await cap.run(effFile, text)); }
          catch (e) { console.error(e); setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: 'assistant', content: '⚠ That didn’t work — the file may be unsupported.' }; return c; }); }
          finally { setGenerating(false); }
          return true;
        }
        armedRef.current = text;
        push({ role: 'assistant', content: `Sure — pick ${aOrAn(cap.input)} ${cap.input} file and I’ll ${cap.verb}.`, kind: 'attach' });
        return true;
      }
      const alts = routing.candidates.filter((c) => c.doc.id !== top.id).slice(0, 3).map((c) => ({ label: c.doc.name, href: c.doc.href }));
      // If we have a file the tool accepts, hand it off so the tool opens preloaded.
      const efc = effFile ? fileCategory(effFile) : null;
      const stageF = effFile && (efc === 'image' || efc === 'audio' || efc === 'video') && fileMatchesCategory(top, efc) ? effFile : undefined;
      push({
        role: 'assistant',
        content: stageF ? `I’ll open ${top.name} with your file ready.` : routing.confidence === 'confident' ? `Here’s the tool for that — ${top.blurb}` : 'I think you’re after one of these:',
        kind: 'tool', toolName: top.name, toolHref: top.href, alts, stageFile: stageF,
      });
      return true;
    }

    return false;
  };

  /**
   * Translate a non-English request to English using the already-loaded model,
   * so the (English) router can understand it. Rough translation is fine —
   * retrieval is robust to paraphrase. Returns null on failure.
   */
  const translateToEnglish = async (text: string): Promise<string | null> => {
    if (!engineRef.current) return null;
    try {
      const out = await engineRef.current.chat.completions.create({
        messages: [
          { role: 'system', content: 'Translate the user message into English. Output ONLY the English translation — no quotes, no notes, no extra words. If it is already English, repeat it unchanged.' },
          { role: 'user', content: text },
        ],
        temperature: 0,
        max_tokens: 64,
      });
      const raw = (out.choices?.[0]?.message?.content ?? '').trim();
      // Take the first line, strip surrounding quotes/labels.
      const t = raw.split('\n')[0].replace(/^["'`]+|["'`]+$/g, '').replace(/^(translation|english)\s*[:\-]\s*/i, '').trim();
      return t || null;
    } catch { return null; }
  };

  /**
   * Grammar-constrained tie-break: when retrieval can't separate the top few
   * candidates, the model picks one. `response_format` with an enum schema means
   * it can ONLY emit one of the candidate IDs — no hallucinated tool, no bad JSON.
   */
  const pickToolId = async (query: string, cands: { id: string; name: string; blurb: string }[]): Promise<string | null> => {
    if (!engineRef.current || cands.length < 2) return null;
    const ids = cands.map((c) => c.id);
    const menu = cands.map((c) => `- ${c.id}: ${c.name} — ${c.blurb}`).join('\n');
    try {
      const out = await engineRef.current.chat.completions.create({
        messages: [
          { role: 'system', content: 'Pick the single tool that best fits the user request. Reply ONLY with JSON: {"tool":"<id>"}.' },
          { role: 'user', content: `Request: "${query}"\nTools:\n${menu}` },
        ],
        temperature: 0, max_tokens: 32,
        response_format: { type: 'json_object', schema: JSON.stringify({ type: 'object', properties: { tool: { type: 'string', enum: ids } }, required: ['tool'] }) },
      });
      const o = JSON.parse(out.choices?.[0]?.message?.content ?? '{}');
      return typeof o.tool === 'string' && ids.includes(o.tool) ? o.tool : null;
    } catch { return null; }
  };

  /** The full request pipeline. Shared by typed sends and armed file-drops. */
  const process = async (text: string, file: File | null) => {
    setSuggest([]);

    // Tool→app chain: "<do something> and send it" — run the action first, then
    // hand the produced file to Send.
    const chain = text.match(/^(.*?)[,\s]+(?:and|then)\s+(?:send|share)(?:\s+(?:it|this|them|the file))?\.?\s*$/i);
    if (chain && chain[1].trim() && !/^(send|share)\b/i.test(chain[1].trim())) {
      const ran = await routeAndAct(chain[1].trim(), file);
      if (ran) {
        const out = lastFileRef.current;
        if (out) push({ role: 'assistant', content: `Now I’ll open Send with the result — the transfer starts automatically.`, kind: 'tool', toolName: 'Send', toolHref: '/send', stageFile: out });
        return;
      }
    }

    // First pass in the original language (English requests resolve here for free).
    if (await routeAndAct(text, file)) return;

    // Nothing matched — the request may be non-English. Translate once and retry.
    const en = await translateToEnglish(text);
    if (en && en.toLowerCase() !== text.toLowerCase()) {
      if (await routeAndAct(en, file)) return;
    }

    // Reliable easter eggs (greetings, jokes, "who are you") — land before the
    // model so the fun is consistent, not the tiny model's hit-or-miss attempt.
    const fun = funReply(text);
    if (fun) { push({ role: 'assistant', content: fun }); if (voiceActiveRef.current) speak(fun); return; }

    // Fallback — tool suggestions + the on-device model (reply in the user's language).
    setSuggest(suggestTools(en && en !== text ? en : text));
    setGenerating(true); stopRef.current = false;
    const history = [...messages, { role: 'user' as const, content: text }];
    push({ role: 'assistant', content: '' });
    try {
      const stream = await engineRef.current.chat.completions.create({
        messages: [{ role: 'system', content: XONVERT_PERSONA }, ...history.map((m) => ({ role: m.role, content: m.content }))], stream: true, temperature: 0.6,
      });
      let acc = '';
      for await (const chunk of stream) { if (stopRef.current) break; acc += chunk.choices[0]?.delta?.content ?? ''; setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: 'assistant', content: acc }; return c; }); }
      if (voiceActiveRef.current) speak(acc);
    } catch { setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: 'assistant', content: '⚠ Generation failed.' }; return c; }); }
    finally { setGenerating(false); }
  };

  // Resolve one operation for batch: convert / recipe / inline filter → a runner.
  const resolveBatchOp = async (text: string, cat: 'image' | 'audio' | null): Promise<{ label: string; run: (f: File) => Promise<{ blob: Blob; name: string }> } | null> => {
    const extract = async (r: ActionResult): Promise<{ blob: Blob; name: string }> => {
      if (r.kind === 'file') return { blob: r.blob, name: r.filename };
      if (r.kind === 'image' && r.blob) return { blob: r.blob, name: r.filename ?? 'image.png' };
      throw new Error('no output');
    };
    const plan = planConvert(text, cat);
    if (plan.kind === 'run') return { label: `convert to ${plan.target.toUpperCase()}`, run: async (f) => extract(await runConvert(f, plan.category, plan.target)) };
    const recipe = matchRecipe(text, cat);
    if (recipe && (!cat || recipe.input === cat)) return { label: recipe.verb, run: async (f) => extract(await recipe.run(f)) };
    const routing = await routeToTool(text, cat);
    const cap = routing.top && routing.confidence !== 'weak' ? inlineCap(routing.top.doc.id) : undefined;
    if (cap) return { label: cap.verb, run: async (f) => extract(await cap.run(f, text)) };
    return null;
  };

  // Apply one operation to many files and return them as a single .zip.
  const processBatch = async (text: string, files: File[]) => {
    const fc = fileCategory(files[0]);
    const cat = fc === 'image' || fc === 'audio' ? fc : null;
    const op = await resolveBatchOp(text || 'convert', cat);
    if (!op) {
      push({ role: 'assistant', content: 'For batches I can convert, compress, or apply a filter. Try “convert all to webp”, “make them all grayscale”, or “compress all”.' });
      return;
    }
    setGenerating(true);
    push({ role: 'assistant', content: `Processing ${files.length} files — ${op.label}…` });
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const seen = new Map<string, number>();
      let ok = 0;
      for (const f of files) {
        try {
          const { blob, name } = await op.run(f);
          const n = seen.get(name) ?? 0; seen.set(name, n + 1);
          zip.file(n ? name.replace(/(\.[^.]+)?$/, `-${n}$1`) : name, blob);
          ok++;
          setLast(`Processing ${ok}/${files.length} — ${op.label}…`);
        } catch { /* skip a file that fails */ }
      }
      if (!ok) { setLast('⚠ None of those files could be processed.'); return; }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: 'assistant', content: `Done — ${ok} files.`, kind: 'file', blob: zipBlob, filename: `xonvert-batch-${ok}.zip`, note: `${ok} files` }; return c; });
    } catch (e) { console.error(e); setLast('⚠ Batch processing failed.'); }
    finally { setGenerating(false); }
  };

  const send = async () => {
    const text = input.trim();
    // Batch path: multiple files staged.
    if (pendingFiles.length > 1 && !generating && loadState === 'ready') {
      const fs = pendingFiles;
      push({ role: 'user', content: `${text || 'Process these'}  ·  📎 ${fs.length} files` });
      setInput(''); setPendingFiles([]);
      await processBatch(text, fs);
      return;
    }
    const file = pendingFile;
    if ((!text && !file) || generating || loadState !== 'ready') return;
    push({ role: 'user', content: file ? `${text || 'Convert this'}  ·  📎 ${file.name}` : text });
    setInput(''); setPendingFile(null);
    if (file) lastFileRef.current = file;
    await process(text, file);
  };

  // --- voice: speak in any language (Whisper translate→English), spoken reply ---
  const speak = (text: string) => {
    try {
      if (typeof speechSynthesis === 'undefined' || !text) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.slice(0, 300));
      u.rate = 1.05;
      speechSynthesis.speak(u);
    } catch { /* no TTS */ }
  };

  const handleVoice = async (blob: Blob) => {
    setTranscribing(true);
    push({ role: 'user', content: '🎙️ …' });
    let text = '';
    try {
      const { transcribe } = await import('@/engines/transcribe');
      const res = await transcribe(blob, { size: 'tiny', translate: true });
      text = (res.text ?? '').trim();
    } catch { /* transcription failed */ }
    setTranscribing(false);
    if (!text || /^\W*$/.test(text)) { setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: 'user', content: '🎙️ (couldn’t catch that)' }; return c; }); return; }
    setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: 'user', content: `🎙️ ${text}` }; return c; });
    const file = pendingFile; setPendingFile(null); if (file) lastFileRef.current = file;
    // The spoken request may need the assistant model (e.g. chat, translation).
    // On the homepage the model loads lazily, so make sure it's ready first.
    if (!engineRef.current) await loadModel();
    voiceActiveRef.current = true;
    try { await process(text, file); } finally { voiceActiveRef.current = false; }
  };

  const toggleVoice = async () => {
    if (recording) { recorderRef.current?.stop(); return; }
    if (generating || transcribing) return;
    // Kick model loading now (no-op if already loading/ready) so the spoken
    // request can be handled as soon as transcription finishes. Recording itself
    // doesn't need the model, so we no longer block on loadState here.
    ensureLoaded();
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      push({ role: 'assistant', content: '⚠ Voice input isn’t available in this browser.' });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        void handleVoice(new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' }));
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      push({ role: 'assistant', content: '⚠ I couldn’t access the microphone. Please allow mic permission in your browser and try again.' });
    }
  };

  const regenArt = (i: number) => setMessages((m) => m.map((msg, j) => {
    if (j !== i || msg.kind !== 'art' || msg.prompt == null) return msg;
    const seed = Math.floor(Math.random() * 1e9);
    // Posters re-render through the canvas composer (new layout variation, no
    // model call); plain art re-renders procedurally.
    const url = msg.posterSpec ? renderPoster(msg.posterSpec, seed) : artToUrl(msg.prompt, seed);
    return { ...msg, seed, url };
  }));

  const copyHex = async (hex: string) => { await navigator.clipboard?.writeText(hex); setCopied(hex); setTimeout(() => setCopied(''), 1200); };

  return (
    <Shell embedded={embedded}>
      {supported === false ? (
        <div className="border border-amber-500/30 bg-amber-50/40 p-6">
          <div className="flex items-center gap-2 text-[14px] font-bold"><AlertTriangle className="h-4 w-4 text-amber-600" /> Browser not supported</div>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-fg-muted)]">Xonvert AI needs a modern browser. Please update your browser, or try a recent <strong>Chrome</strong>, <strong>Edge</strong>, <strong>Safari</strong> or <strong>Firefox</strong>.</p>
        </div>
      ) : (
        <div className={`terminal terminal-scan relative flex overflow-hidden flex-col border border-[#1c2b22] shadow-[0_18px_60px_-20px_rgba(0,0,0,0.5)] ${expanded ? 'fixed inset-0 z-[60] h-[100dvh] min-h-0 max-h-none border-0' : embedded ? 'h-[calc(100dvh-210px)] min-h-[380px] max-h-[680px] sm:h-[calc(100dvh-280px)]' : 'h-[calc(100dvh-200px)] min-h-[420px] max-h-[820px] sm:h-[calc(100dvh-230px)]'}`}
          onClick={focusInput}
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); ensureLoaded(); const fs = Array.from(e.dataTransfer.files ?? []); if (fs.length > 1) setPendingFiles(fs); else if (fs[0]) receiveFile(fs[0]); }}>
          {/* Terminal title bar */}
          <div className="relative z-10 flex shrink-0 items-center gap-1.5 border-b border-[#16241c] px-3 py-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
            <span className="ml-2 truncate text-[11px] tracking-tight text-[var(--term-dim)]">xonvert@ai: ~/assistant</span>
            <span className="ml-auto text-[10px] uppercase tracking-[0.18em] text-[var(--term-dim)]">{loadState === 'ready' ? (backend === 'wasm' ? 'compat' : 'online') : loadState === 'loading' ? 'booting' : 'idle'}</span>
            {expanded && (
              <button type="button" onClick={(e) => { e.stopPropagation(); setExpanded(false); textareaRef.current?.blur(); }} aria-label="Close" className="ml-2 grid h-7 w-7 shrink-0 place-items-center rounded text-[var(--term-dim)] transition hover:bg-white/5 hover:text-[var(--term-fg)]">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {loadState === 'loading' && (
            <div className="relative z-10 h-1 w-full overflow-hidden bg-[#0e1813]"><div className="h-full bg-[var(--term-fg)] transition-[width]" style={{ width: `${Math.max(6, Math.round(loadPct * 100))}%` }} /></div>
          )}
          <div ref={scrollRef} className="relative z-[1] flex-1 space-y-4 overflow-y-auto p-3 text-[var(--term-fg)] sm:p-4">
            {messages.length === 0 && (
              <div className="grid h-full place-items-center px-4 text-center text-[13px] text-[var(--term-dim)]">
                <div className="max-w-md">
                  <Bot className="mx-auto h-8 w-8 text-[var(--term-fg)] terminal-glow" />
                  <p className="mt-3 text-[var(--term-fg)] terminal-glow">{loadState === 'loading' ? (backend === 'wasm' ? '> setting up compatibility mode — first boot takes a moment' : '> booting assistant…') : loadState === 'ready' ? '> xonvert ai ready — private & secure' : '> ask me anything — I’ll boot the moment you start'}<span className="terminal-caret" aria-hidden /></p>
                  {backend === 'wasm' && loadState === 'ready' && (
                    <p className="mt-1 text-[11px] text-[var(--term-dim)]">compatibility mode on this device — replies may be a little slower.</p>
                  )}
                  <p className="mt-3 min-h-[1.4em] text-[12px] text-[var(--term-dim)]">try: <RotatingHint phrases={HINT_PROMPTS} /></p>
                  <p className="mt-1 text-[12px] text-[var(--term-dim)]">or attach a file (📎) and say <em>“convert to wav”</em> or <em>“make this a png”</em> — I’ll run the right tool.</p>
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`grid h-8 w-8 shrink-0 place-items-center border ${m.role === 'user' ? 'border-[var(--term-user)]/30 bg-[var(--term-user)]/10 text-[var(--term-user)]' : 'border-[var(--term-fg)]/30 bg-[var(--term-fg)]/10 text-[var(--term-fg)]'}`}>{m.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}</div>
                <div className="max-w-[88%] space-y-2 sm:max-w-[82%]">
                  {(!m.kind || m.kind === 'text' || m.kind === 'calc' || m.kind === 'attach' || m.kind === 'tool') && m.content && (
                    <div className={`whitespace-pre-wrap px-3 py-2 text-[14px] leading-relaxed ${m.role === 'user' ? 'border border-[var(--term-user)]/20 bg-[var(--term-user)]/10 text-[#cdeeff]' : 'text-[var(--term-fg)] terminal-glow'} ${m.kind === 'calc' ? 'text-[15px]' : ''}`}>
                      {m.role === 'assistant'
                        ? <TypeOut text={m.content} active={i === messages.length - 1} />
                        : m.content}
                    </div>
                  )}
                  {!m.content && !m.kind && generating && i === messages.length - 1 && <div className="px-3 py-2 text-[var(--term-fg)] terminal-glow"><span className="terminal-caret" aria-hidden /></div>}
                  {(m.kind === 'art' || m.kind === 'qr') && m.url && (
                    <div className="space-y-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.url} alt={m.content || 'image'} className={`border border-black/[0.08] ${m.kind === 'qr' ? 'h-44 w-44 bg-white p-2' : 'w-full max-w-md rounded'}`} />
                      {m.note && <div className="text-[11px] text-[var(--color-fg-subtle)]">{m.filename ? `${m.filename} · ` : ''}{m.note}</div>}
                      <div className="flex gap-3 text-[11px] text-[var(--color-fg-muted)]">
                        <button type="button" onClick={() => download(m.url!, m.filename ?? (m.kind === 'qr' ? 'qr.png' : 'xonvert-art.png'))} className="inline-flex items-center gap-1 hover:text-[var(--color-fg)]"><Download className="h-3 w-3" /> Download</button>
                        {m.kind === 'art' && m.prompt != null && <button type="button" onClick={() => regenArt(i)} className="inline-flex items-center gap-1 hover:text-[var(--color-fg)]"><RefreshCw className="h-3 w-3" /> Regenerate</button>}
                      </div>
                    </div>
                  )}
                  {m.kind === 'svg' && m.svg && (
                    <div className="space-y-1.5">
                      <div className="w-full max-w-xs border border-black/[0.08] bg-white p-3 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: m.svg }} />
                      <button type="button" onClick={() => download('data:image/svg+xml;utf8,' + encodeURIComponent(m.svg!), 'xonvert.svg')} className="inline-flex items-center gap-1 text-[11px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"><Download className="h-3 w-3" /> Download SVG</button>
                    </div>
                  )}
                  {m.kind === 'tool' && m.toolHref && (
                    <div className="space-y-2">
                      <Link href={m.toolHref} onClick={() => { if (m.stageFile) stageHandoff(m.stageFile); }} className="inline-flex items-center gap-2 bg-[var(--color-cat-dev)] px-3 py-2 text-[13px] font-semibold text-white transition hover:brightness-110">
                        Open {m.toolName} <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                      {m.alts && m.alts.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] text-[var(--color-fg-subtle)]">or:</span>
                          {m.alts.map((a) => (
                            <Link key={a.href} href={a.href} className="inline-flex items-center gap-1 border border-[var(--color-cat-dev)]/30 bg-[var(--color-cat-dev)]/[0.06] px-2.5 py-1 text-[12px] text-[var(--color-fg)] transition hover:bg-[var(--color-cat-dev)]/[0.12]">{a.label}</Link>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {m.kind === 'attach' && (
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 border border-[var(--color-cat-dev)]/40 bg-[var(--color-cat-dev)]/[0.06] px-3 py-2 text-[13px] font-semibold text-[var(--color-fg)] transition hover:bg-[var(--color-cat-dev)]/[0.12]">
                      <Paperclip className="h-4 w-4 text-[var(--color-cat-dev)]" /> Choose a file
                    </button>
                  )}
                  {m.kind === 'file' && m.blob && (
                    <button type="button" onClick={() => downloadBlob(m.blob!, m.filename ?? 'xonvert-file')} className="group flex w-full max-w-sm items-center gap-3 border border-[var(--color-cat-dev)]/40 bg-[var(--color-cat-dev)]/[0.06] px-3 py-2.5 text-left transition hover:bg-[var(--color-cat-dev)]/[0.12]">
                      <div className="grid h-9 w-9 shrink-0 place-items-center bg-[var(--color-cat-dev)] text-white"><FileDown className="h-4 w-4" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold text-[var(--color-fg)]">{m.filename}</div>
                        <div className="text-[11px] text-[var(--color-fg-muted)]">{prettyBytes(m.blob.size)}{m.note ? ` · ${m.note}` : ''}</div>
                      </div>
                      <Download className="h-4 w-4 shrink-0 text-[var(--color-cat-dev)]" />
                    </button>
                  )}
                  {m.kind === 'palette' && m.palette && (
                    <div className="flex overflow-hidden rounded border border-black/[0.08]">
                      {m.palette.map((hex) => (
                        <button key={hex} type="button" onClick={() => copyHex(hex)} title={hex} className="group relative h-16 flex-1" style={{ background: hex }}>
                          <span className="absolute inset-x-0 bottom-0 bg-black/30 py-0.5 text-center font-mono text-[9px] text-white opacity-0 transition group-hover:opacity-100">{copied === hex ? 'copied' : hex}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {suggest.length > 0 && !generating && (
              <div className="flex flex-wrap gap-2 pl-11">
                {suggest.map((s) => (
                  <Link key={s.href} href={s.href} className="inline-flex items-center gap-1.5 border border-[var(--term-fg)]/30 bg-[var(--term-fg)]/[0.08] px-3 py-1.5 text-[12px] font-medium text-[var(--term-fg)] transition hover:bg-[var(--term-fg)]/[0.16]">{s.label} <ArrowRight className="h-3 w-3" /></Link>
                ))}
              </div>
            )}
          </div>
          <div className="relative z-10 border-t border-[#16241c] p-3">
            {pendingFile && (
              <div className="mb-2 flex items-center gap-2">
                <span className="inline-flex max-w-full items-center gap-1.5 border border-[var(--term-fg)]/30 bg-[var(--term-fg)]/[0.08] px-2.5 py-1 text-[12px] text-[var(--term-fg)]">
                  <Paperclip className="h-3 w-3" />
                  <span className="truncate">{pendingFile.name}</span>
                  <span className="shrink-0 text-[var(--term-dim)]">{prettyBytes(pendingFile.size)}</span>
                  <button type="button" onClick={() => setPendingFile(null)} className="shrink-0 hover:text-red-400"><X className="h-3 w-3" /></button>
                </span>
              </div>
            )}
            {pendingFiles.length > 1 && (
              <div className="mb-2 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 border border-[var(--term-fg)]/30 bg-[var(--term-fg)]/[0.08] px-2.5 py-1 text-[12px] text-[var(--term-fg)]">
                  <Paperclip className="h-3 w-3" />
                  <span>{pendingFiles.length} files — say what to do (e.g. “convert all to webp”)</span>
                  <button type="button" onClick={() => setPendingFiles([])} className="shrink-0 hover:text-red-400"><X className="h-3 w-3" /></button>
                </span>
              </div>
            )}
            {/* On phones the textarea takes its own full-width white line (flex-wrap
                forces it down); the controls reflow to a row beneath it. On sm+ it
                stays inline as before: [attach][mic][textarea][send]. */}
            <div className="flex flex-wrap items-end gap-2">
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length > 1) setPendingFiles(fs); else if (fs[0]) receiveFile(fs[0]); e.target.value = ''; }} />
              <button type="button" onClick={() => fileInputRef.current?.click()} title="Attach a file" className="order-2 grid h-10 w-10 shrink-0 place-items-center text-[var(--term-dim)] transition hover:text-[var(--term-fg)] sm:order-1"><Paperclip className="h-4 w-4" /></button>
              <button type="button" onClick={toggleVoice} title={recording ? 'Stop & send' : 'Speak (any language)'} disabled={transcribing}
                className={`order-3 grid h-10 w-10 shrink-0 place-items-center transition sm:order-2 ${recording ? 'animate-pulse bg-red-600 text-white' : 'text-[var(--term-dim)] hover:text-[var(--term-fg)]'} disabled:opacity-40`}>
                {transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> : recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
              <div className="order-1 flex w-full items-start gap-2 sm:order-3 sm:w-auto sm:flex-1">
                <span className="select-none pt-2 text-[15px] leading-none text-[var(--term-fg)] terminal-glow sm:text-[14px]" aria-hidden>&gt;</span>
                <textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)} rows={3} onFocus={() => { ensureLoaded(); maybeExpand(); }}
                  placeholder={recording ? 'listening… tap ◼ to send' : loadState === 'loading' ? 'booting…' : 'type a command…'}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
                  onPaste={(e) => { const it = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/')); const f = it?.getAsFile(); if (f) { e.preventDefault(); receiveFile(new File([f], `pasted-${Date.now()}.${(f.type.split('/')[1] || 'png')}`, { type: f.type })); } }}
                  className="max-h-44 min-h-[4.5rem] flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-relaxed text-[var(--term-fg)] caret-[var(--term-fg)] placeholder:text-[var(--term-dim)] focus:outline-none sm:min-h-[3.75rem] sm:text-[14px]" />
              </div>
              {/* Spacer pushes Send to the right on the mobile button row only. */}
              <div className="order-4 flex-1 sm:hidden" />
              {generating ? (
                <button type="button" onClick={() => { stopRef.current = true; }} className="order-5 grid h-10 w-10 shrink-0 place-items-center bg-red-600 text-white sm:order-4"><Square className="h-4 w-4" /></button>
              ) : (
                <button type="button" onClick={send} disabled={loadState !== 'ready' || (!input.trim() && !pendingFile && pendingFiles.length < 2)} title={loadState !== 'ready' ? 'Booting…' : 'Send'} className="order-5 grid h-10 w-10 shrink-0 place-items-center bg-[var(--term-fg)] text-[#06140d] transition hover:brightness-110 disabled:bg-[#14201a] disabled:text-[var(--term-dim)] sm:order-4"><Send className="h-4 w-4" /></button>
              )}
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children, embedded }: { children: React.ReactNode; embedded?: boolean }) {
  // Embedded (e.g. homepage hero): just the chat panel, no page chrome.
  if (embedded) return <>{children}</>;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center bg-[var(--color-cat-dev)] text-white"><Bot className="h-5 w-5" /></div>
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight">Xonvert AI</h1>
          <p className="text-[13px] text-[var(--color-fg-muted)]">A private AI assistant — chats, draws, makes thumbnails, art &amp; QR codes, and finds the right tool.</p>
        </div>
      </header>
      {children}
      <div className="flex items-start gap-2 border border-black/[0.06] bg-black/[0.015] p-3 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
        <span>Private and secure — your messages and creations stay yours.</span>
      </div>
    </div>
  );
}
