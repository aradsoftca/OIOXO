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
import { isGeneralQuestion, CONTACT_INTENT, classifyContact, HELP_INTENT, HELP_OVERVIEW, DOC_REFERS_RE, CONVERT_PHRASE, looksNonLatin } from '@/lib/ai/route-intents';
import { classifyIntent } from '@/lib/ai/intent';
import { declineMediaSubject, declineNoAnswer } from '@/lib/ai/decline';
import { planGraph, runProducer, extractSlot, type GraphPlan } from '@/lib/ai/plan-graph';
import { isSaveAsPdf } from '@/lib/ai/suggest-next';
import { candidatesFor, triagePrompt, parseDecision, fallbackDecision, type Decision } from '@/lib/ai/agent';
import { docById } from '@/lib/ai/tool-index';
import { detectTranslate } from '@/lib/ai/translate-op';
import { composePoster, renderPoster, type PosterSpec } from '@/lib/ai/poster';
import { planRequest, segment, type Medium } from '@/lib/ai/planner';
import { runChain, hasRunner } from '@/lib/ai/executor';
import { narratePlan, recapPlan, capabilityContext } from '@/lib/ai/narrate';
import type { SearchSource } from '@/lib/ai/search';
import { actionsForMedium, nextStepsFor, type SuggestMedium, type SuggestionGroup } from '@/lib/ai/suggest';
import { textOpFor, extractOperand, type TextOp } from '@/lib/ai/text-ops';
import { devOpFor, type DevOp } from '@/lib/ai/dev-ops';
import { colorOpFor } from '@/lib/ai/color-ops';
import { combineFor, combineToolFor, isCombineIntent } from '@/lib/ai/combine';
import { tryCalc } from '@/lib/ai/calc-ops';
import { gameOpFor, looksLikeGameName, tryGameRandom } from '@/lib/ai/game-ops';
import { tryTime } from '@/lib/ai/time-ops';
import { tryFinance } from '@/lib/ai/finance-ops';
import { subtitleOpFor } from '@/lib/ai/subtitle-ops';
import { cssOpFor, CSS_TRIGGER } from '@/lib/ai/css-ops';
import { seoOpFor, SEO_TRIGGER } from '@/lib/ai/seo-ops';
import { warmIndex, type IndexDoc } from '@/lib/ai/tool-index';

// A bare factual lookup that isn't a tool request — "eiffel tower height",
// "population of France" — worth answering from the web as a late fallback.
const FACT_CHITCHAT = /\b(hi|hello|hey|yo|sup|thanks?|thank you|thx|ok|okay|cool|nice|lol|joke|poem|story|rhyme|sing|chat|how are you|your name|who are you|opinion|do you (like|think|feel))\b/i;
const FACT_ACTIONY = /\b(make|create|build|generate|draw|paint|write|compose|design|play|convert|download|open)\b/i;
const FACT_SIGNAL = /\b(of|in|invented|discovered|founded|capital|population|height|weight|distance|length|meaning|definition|born|died|located|tallest|largest|biggest|oldest|longest|fastest|author|director|ceo|president|founder|weather|temperature)\b/i;
function looksFactual(text: string): boolean {
  const t = text.trim();
  const n = t.split(/\s+/).length;
  if (n < 2 || n > 12) return false;
  if (FACT_CHITCHAT.test(t) || FACT_ACTIONY.test(t)) return false;
  const properNoun = /\S\s+[A-Z][a-z]{2,}/.test(t); // a capitalized word that isn't the first token
  return properNoun || FACT_SIGNAL.test(t);
}

type Kind = 'text' | 'art' | 'svg' | 'qr' | 'palette' | 'calc' | 'file' | 'attach' | 'tool' | 'menu' | 'search';
interface Msg { role: 'user' | 'assistant'; content: string; kind?: Kind; url?: string; svg?: string; palette?: string[]; prompt?: string; seed?: number; filename?: string; note?: string; blob?: Blob; toolName?: string; toolHref?: string; alts?: { label: string; href: string }[]; stageFile?: File; posterSpec?: PosterSpec; groups?: SuggestionGroup[]; clarify?: { label: string; value: string }[]; sources?: SearchSource[]; related?: string[] }

const up = (s: string) => s.toUpperCase();
const aOrAn = (w: string) => (/^[aeiou]/i.test(w) ? 'an' : 'a');
const listFmts = (fmts: string[]) => fmts.map(up).join(', ');

const MODEL_ID = 'Qwen3-0.6B-q4f16_1-MLC';

// Qwen3 can emit a <think>…</think> reasoning preamble. We run it in non-thinking
// mode (/no_think on the prompts), but strip any think block defensively so it
// never reaches the UI or breaks JSON parsing — also handles an unclosed block
// still streaming in.
const stripThink = (s: string): string =>
  s.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/i, '').replace(/^\s*<\/think>/i, '').trim();

// Tools where one parameter is essential and has no safe default. When the
// request lacks it (`has` doesn't match), the AI asks with tappable answers
// instead of guessing. Each answer is a full re-runnable phrase.
const CLARIFY_RULES: Record<string, { has: RegExp; question: string; options: { label: string; value: string }[] }> = {
  'image-resize': { has: /(\d|half|double|thumb|small|big|larg|tiny|huge)/i, question: 'What size would you like?', options: [
    { label: '800px wide', value: 'resize to 800 wide' },
    { label: '1280×720', value: 'resize to 1280x720' },
    { label: 'Half size', value: 'resize to 50%' },
    { label: 'Thumbnail', value: 'resize to 320 wide' },
  ] },
  'image-rotate': { has: /(\d|left|right|clockwise|counter|anti|upside|180|90|270)/i, question: 'Which way should I rotate it?', options: [
    { label: '90° right', value: 'rotate 90 degrees' },
    { label: '90° left', value: 'rotate left 90 degrees' },
    { label: 'Upside down', value: 'rotate 180 degrees' },
  ] },
  'audio-trim': { has: /(\d|first|last|half|beginning|\bend\b|start)/i, question: 'How much should I keep?', options: [
    { label: 'First 10s', value: 'keep the first 10 seconds' },
    { label: 'First 30s', value: 'keep the first 30 seconds' },
    { label: 'Last 10s', value: 'keep the last 10 seconds' },
  ] },
  'pdf-delete-pages': { has: /(\d|last|first)/i, question: 'Which pages should I remove?', options: [
    { label: 'Page 1', value: 'delete page 1' },
    { label: 'Last page', value: 'delete the last page' },
    { label: 'Pages 1–2', value: 'delete pages 1-2' },
  ] },
  'pdf-extract-pages': { has: /(\d|last|first)/i, question: 'Which pages should I keep?', options: [
    { label: 'Page 1', value: 'extract page 1' },
    { label: 'Pages 1–3', value: 'extract pages 1-3' },
    { label: 'Last page', value: 'extract the last page' },
  ] },
};

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
  "You have a light, playful sense of humour: an occasional witty aside, pun or emoji — but never forced, never at the expense of being clear, and never on serious or technical asks. Keep answers short, helpful, and a little fun. " +
  "If asked to do something physical or beyond your reach (make food or drink, fetch an object, phone a person, anything off-screen), don't just refuse — say so with a light, friendly joke and immediately offer the closest help you CAN give: find a recipe, a how-to, or a good video, or a relevant tool. Always leave the user with a useful next step. /no_think";

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
  const [followups, setFollowups] = React.useState<string[]>([]);
  const [input, setInput] = React.useState('');
  const [generating, setGenerating] = React.useState(false);
  const [copied, setCopied] = React.useState('');
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);
  const [pendingFiles, setPendingFiles] = React.useState<File[]>([]);
  const [recording, setRecording] = React.useState(false);
  const [transcribing, setTranscribing] = React.useState(false);
  // Recent on-device searches — the live history surfaced on the empty panel.
  const [recent, setRecent] = React.useState<{ query: string; ts: number }[]>([]);
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
  // Conversation memory: previous working files (for "undo") and the last real
  // job's wording (for "do that again" / "do the same to this one").
  const fileHistoryRef = React.useRef<File[]>([]);
  const lastJobRef = React.useRef<string | null>(null);
  // The file a pending clarification applies to (so tapping an answer keeps it).
  const clarifyFileRef = React.useRef<File | null>(null);
  // A pending free-text question: the next message is taken as the answer and
  // turned into a full re-runnable request via `build`.
  const awaitingTextRef = React.useRef<{ build: (answer: string) => string; file: File | null } | null>(null);
  // The detected language of the current turn (BCP-47), so replies/answers can
  // be translated back into it. Null = English. Reset each turn.
  const sessionLangRef = React.useRef<string | null>(null);
  // The topic + primary source of the last web answer, so a follow-up ("tell me
  // more", "why?") continues it — reading the source in full for more detail —
  // instead of searching the literal words.
  const lastTopicRef = React.useRef<string | null>(null);
  const lastSourceRef = React.useRef<{ url: string; title: string; site: string } | null>(null);
  // The text of the last answer, so "save this as a PDF" can render it.
  const lastAnswerRef = React.useRef<string | null>(null);
  // A composition plan paused for a missing parameter: which slot we're asking
  // for, so the next message fills it and we resume the chain.
  const pendingGraphRef = React.useRef<{ plan: GraphPlan; idx: number } | null>(null);

  // Load recent on-device searches whenever the panel is empty (fresh / cleared).
  const isEmpty = messages.length === 0;
  React.useEffect(() => {
    if (!isEmpty) return;
    import('@/lib/ai/search-cache').then(({ recentSearches }) => recentSearches(6).then(setRecent)).catch(() => {});
  }, [isEmpty]);

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
        const init = { initProgressCallback: (r: any) => { if (typeof r.progress === 'number') setLoadPct(r.progress); } };
        // Cap the context window to what we actually use (synthesis ≈800 tok,
        // doc-QA ≈700, decisions tiny — all well under 2048). The KV cache is
        // sized to this window, so a smaller window roughly HALVES the model's
        // working memory vs the 4k+ default — the main cause of "whole device
        // froze" (web-llm device-loss is mostly OOM). No quality/speed cost: we
        // never approach the limit. Resilient: if the override is ever rejected,
        // fall back to a default load so the assistant always starts.
        sharedEnginePromise ??= webllm
          .CreateMLCEngine(MODEL_ID, init, { context_window_size: 2048 })
          .catch(() => webllm.CreateMLCEngine(MODEL_ID, init));
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
    // Warm the lexical tool index during idle time so the first request routes
    // instantly — even on a slow device, before the model has finished loading.
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 300));
    ric(() => { try { warmIndex(); } catch { /* non-critical */ } });
    // On the dedicated page, load right away. When embedded (e.g. the homepage
    // hero) defer until the user actually engages, so casual visitors and SEO
    // crawlers don't pay the load — see the input's onFocus.
    if (ok && !embedded) void loadModel();
  }, [loadModel, embedded]);

  // Embedded: start loading the moment the user shows intent (focus/tap).
  const ensureLoaded = React.useCallback(() => {
    if (supported && !startedRef.current) void loadModel();
  }, [supported, loadModel]);

  /**
   * Await the language model only when a request actually needs it (chat,
   * translation, SVG, document summary). Deterministic work — routing, tool
   * execution, text ops, multi-step chains — never calls this, so it runs the
   * instant the page loads, even before the model has downloaded. Kicks the load
   * if it hasn't started, then waits (bounded) for it to be ready.
   */
  const ensureModel = React.useCallback(async (): Promise<boolean> => {
    if (engineRef.current) return true;
    if (!startedRef.current) void loadModel();
    const start = Date.now();
    while (!engineRef.current && Date.now() - start < 120_000) {
      await new Promise((r) => setTimeout(r, 150));
    }
    return !!engineRef.current;
  }, [loadModel]);

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
    // Snapshot the file we're replacing so "undo" can bring it back (cap depth).
    const produced = res.kind === 'file' ? new File([res.blob], res.filename, { type: res.blob.type })
      : res.kind === 'image' && res.blob ? new File([res.blob], res.filename ?? 'image.png', { type: res.blob.type }) : null;
    if (produced) {
      if (lastFileRef.current) { fileHistoryRef.current.push(lastFileRef.current); if (fileHistoryRef.current.length > 8) fileHistoryRef.current.shift(); }
      lastFileRef.current = produced;
    }
    // Spoken reply when the request came in by voice.
    if (voiceActiveRef.current) {
      if (res.kind === 'text') speak(res.text);
      else if (res.kind === 'file' || res.kind === 'image') speak('Done — your file is ready.');
      else if (res.kind === 'error') speak(res.text);
    }
    // Proactive next steps: offer the obvious follow-ups for the produced file
    // as one-tap chips ("compress it", "convert to JPG", "send it").
    if (res.kind === 'image' || (res.kind === 'file' && res.filename)) {
      const outMedium = res.kind === 'image' ? 'image' : mediumForFile(new File([], res.filename));
      setFollowups(nextStepsFor(outMedium));
    }
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
        askClarify(`Which format would you like this ${plan.category} file in?`,
          plan.supported.map((f) => ({ label: f.toUpperCase(), value: `convert to ${f}` })), effFile);
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
    // Magic: the moment a file lands, show what we can do with it — no need to
    // ask. The user can still type a specific request instead.
    showFileActions(f);
  };

  /** Replace the trailing placeholder message's text content. */
  const setLast = (content: string) => setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: 'assistant', content }; return c; });

  /** Medium of the working file, for the planner's prerequisite inference. */
  const planMedium = (file: File | null): Medium => {
    const f = file ?? lastFileRef.current;
    if (!f) return null;
    const c = fileCategory(f);
    if (c === 'image' || c === 'audio' || c === 'video') return c;
    const ext = (f.name.split('.').pop() ?? '').toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (/^(docx?|odt|rtf)$/.test(ext)) return 'doc';
    return null;
  };

  /** Medium bucket for the proactive "what I can do with this" menu. */
  const mediumForFile = (file: File | null): SuggestMedium | null => {
    const f = file ?? lastFileRef.current;
    if (!f) return null;
    const c = fileCategory(f);
    if (c === 'image' || c === 'audio' || c === 'video') return c;
    const ext = (f.name.split('.').pop() ?? '').toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (/^(docx?|odt|rtf|pptx?|xlsx?|ods|odp)$/.test(ext)) return 'doc';
    if (/^(txt|md|csv|json|html?|xml|log)$/.test(ext)) return 'text';
    return null;
  };

  /** Proactively surface what we can do with a freshly attached file. */
  const showFileActions = (file: File): boolean => {
    const m = mediumForFile(file);
    if (!m) return false;
    const groups = actionsForMedium(m);
    if (!groups.length) return false;
    const noun = m === 'doc' ? 'document' : m === 'pdf' ? 'PDF' : m === 'text' ? 'text file' : m;
    push({ role: 'assistant', content: `Got your ${noun}. Here’s what I can do with it — or just tell me in your own words:`, kind: 'menu', groups, stageFile: file });
    return true;
  };

  /** Run a tapped follow-up suggestion against the file we just produced. */
  const runFollowup = (text: string) => {
    setFollowups([]);
    push({ role: 'user', content: text });
    void process(text, null);
  };

  /** Ask one crisp question with tappable answers, keeping the file in context. */
  const askClarify = (question: string, options: { label: string; value: string }[], file: File | null) => {
    clarifyFileRef.current = file ?? lastFileRef.current;
    push({ role: 'assistant', content: question, clarify: options });
  };
  /** A tapped clarification answer — re-run with the remembered file. */
  const runClarify = (value: string) => {
    const f = clarifyFileRef.current;
    clarifyFileRef.current = null;
    push({ role: 'user', content: value });
    void process(value, f);
  };

  /**
   * Answer a factual question from the live web — on-device, extractive, cited.
   * Returns true if a grounded answer was shown; false (placeholder removed) so
   * the caller falls through to the chat model when nothing solid is found.
   */
  const trySearch = async (text: string): Promise<boolean> => {
    setGenerating(true);
    push({ role: 'assistant', content: 'Searching the web…' });
    try {
      // STRATEGY A — the answer already exists structured on a page (recipe,
      // how-to, code). Find the best page and extract it. Frontier-quality
      // because an expert wrote it; the model authors nothing.
      const { detectAnswerType } = await import('@/lib/ai/extract');
      const atype = detectAnswerType(text);
      if (atype === 'recipe' || atype === 'howto' || atype === 'code') {
        setLast('Finding the best source…');
        const { richAnswer } = await import('@/lib/ai/web-read');
        const rich = await richAnswer(text, atype);
        if (rich && rich.answer) {
          lastTopicRef.current = rich.query || text; lastSourceRef.current = rich.sources[0] ?? null; lastAnswerRef.current = rich.answer;
          const { answer: rAns, sources: rSrc, related: rRel } = rich;
          setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: 'assistant', content: rAns, kind: 'search', sources: rSrc, related: rRel }; return c; });
          return true;
        }
      }

      // STRATEGY B — a rich question (compare / how-why / list): PLAN the
      // searches, GATHER clean passages from several pages, then SYNTHESIZE one
      // organized, grounded answer (verified). Not a copy-pasted snippet.
      const reason = await import('@/lib/ai/reason');
      const analysis = reason.analyzeQuestion(text);
      if (reason.wantsSynthesis(analysis)) {
        const research = await import('@/lib/ai/research');
        void ensureModel(); // EAGER WARM: start the model load now, in parallel with the gather
        setLast('Reading the sources…');
        // Deterministic facet decomposition (no model wait) → gather in parallel.
        const queries = research.fallbackQueries(text, analysis.topics);
        const evidence = await research.gatherForQueries(queries);
        if (evidence.length) {
          const sources = research.researchSources(evidence);
          lastTopicRef.current = text;
          lastSourceRef.current = sources[0] ?? null;
          const translateBack = async (s: string) => {
            const lang = sessionLangRef.current;
            if (lang && s) { try { const tr = await import('@/lib/ai/translate'); const t = await tr.fromEnglish(s, lang); if (t) return t; } catch { /* keep English */ } }
            return s;
          };
          // INSTANT ANSWER: show the best source's extract immediately — the user
          // never waits for the (possibly cold) model to get a real answer.
          let answer = await translateBack(reason.extractiveFallback(evidence));
          setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: 'assistant', content: answer, kind: 'search', sources }; return c; });
          lastAnswerRef.current = answer;
          // REFINE: when the model is ready, synthesize a connected answer and
          // SWAP it in only once VERIFIED grounded — so an ungrounded draft never
          // flashes on screen. If the first attempt drifts, SELF-CORRECT with a
          // stricter prompt before keeping the instant extract.
          if (!stopRef.current && (await ensureModel())) {
            const synth = async (msgs: { role: string; content: string }[]) => {
              const out = await engineRef.current.chat.completions.create({ messages: msgs, temperature: 0.2, max_tokens: 220 });
              return stripThink(out.choices?.[0]?.message?.content ?? '');
            };
            try {
              const a = research.buildResearchSynthesis(text, evidence);
              let clean = await synth([{ role: 'system', content: a.system }, { role: 'user', content: a.user }]);
              let ok = clean && research.isGrounded(clean, evidence, text);
              if (!ok && !stopRef.current) {
                // Self-correct: one stricter, literal pass.
                const s = research.buildStrictSynthesis(text, evidence);
                const retry = await synth([{ role: 'system', content: s.system }, { role: 'user', content: s.user }]);
                if (retry && research.isGrounded(retry, evidence, text)) { clean = retry; ok = true; }
              }
              if (ok && !stopRef.current) {
                answer = await translateBack(clean);
                lastAnswerRef.current = answer;
                setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: 'assistant', content: answer, kind: 'search', sources }; return c; });
              }
            } catch { /* keep the instant extract */ }
          }
          return true;
        }
        // Nothing gathered → fall through to the extractive engine below.
      }

      const { answerQuestion } = await import('@/lib/ai/search');
      const res = await answerQuestion(text);
      if (!res) { setMessages((m) => m.slice(0, -1)); return false; }
      // Remember the topic + primary source so "tell me more" can expand it.
      lastTopicRef.current = res.query || text;
      lastSourceRef.current = res.sources?.[0] ?? null;
      const tBack = async (s: string) => {
        const lang = sessionLangRef.current;
        if (lang && s) { try { const tr = await import('@/lib/ai/translate'); const t = await tr.fromEnglish(s, lang); if (t) return t; } catch { /* keep English */ } }
        return s;
      };
      // INSTANT: show the sourced answer right away.
      let answer = await tBack(res.answer);
      setMessages((m) => {
        const c = [...m];
        c[c.length - 1] = answer
          ? { role: 'assistant', content: answer, kind: 'search', sources: res.sources, related: res.related }
          : { role: 'assistant', content: `“${res.query}” could mean a few things — which did you have in mind?`, kind: 'search', sources: res.sources, related: res.related };
        return c;
      });
      if (answer) lastAnswerRef.current = answer;

      // REPHRASE: rewrite the sourced text in the assistant's OWN words (same
      // facts, nothing invented) — so it isn't a verbatim Wikipedia paste. Only
      // swaps in if it stays grounded in the original.
      if (res.answer && !stopRef.current && (await ensureModel())) {
        try {
          const reason = await import('@/lib/ai/reason');
          const ev = [{ topic: res.query || text, text: res.answer, source: res.sources?.[0] ?? { title: '', url: '', site: '' } }];
          const out = await engineRef.current.chat.completions.create({ messages: [{ role: 'system', content: 'Rephrase the text below in your OWN words — keep every fact, invent nothing, 2–3 sentences, no preamble. /no_think' }, { role: 'user', content: res.answer }], temperature: 0.3, max_tokens: 200 });
          const reworded = stripThink(out.choices?.[0]?.message?.content ?? '');
          if (reworded && reason.isGrounded(reworded, ev, text) && !stopRef.current) {
            answer = await tBack(reworded);
            lastAnswerRef.current = answer;
            setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: 'assistant', content: answer, kind: 'search', sources: res.sources, related: res.related }; return c; });
          }
        } catch { /* keep the sourced answer */ }
      }

      // ENTITY IMAGE: for a Wikipedia-sourced answer about someone/something,
      // show their lead image below the text (as a blob, so it renders inline).
      if (answer && !stopRef.current && res.sources?.some((s) => /wikipedia|wikimedia/i.test(`${s.site} ${s.url}`))) {
        try {
          const { findImage } = await import('@/lib/ai/image-search');
          const img = await findImage(res.query || text);
          if (img && !stopRef.current) {
            const r = await fetch(img.url, { mode: 'cors', referrerPolicy: 'no-referrer' });
            if (r.ok) { const b = await r.blob(); push({ role: 'assistant', content: '', kind: 'art', url: URL.createObjectURL(b), filename: `${(res.query || 'image').replace(/\s+/g, '-').slice(0, 40)}.jpg` }); }
          }
        } catch { /* no image, no problem */ }
      }
      return true;
    } catch {
      setMessages((m) => m.slice(0, -1));
      return false;
    } finally {
      setGenerating(false);
    }
  };

  /**
   * Expand the previous answer for a follow-up ("tell me more"): read the last
   * source page in full and show a longer extract. Returns false (placeholder
   * removed) if it can't, so the caller falls back to re-searching the topic.
   */
  const tryExpand = async (source: { url: string; title: string; site: string }): Promise<boolean> => {
    setGenerating(true);
    push({ role: 'assistant', content: 'Reading more on that…' });
    try {
      const { expandFromUrl } = await import('@/lib/ai/web-read');
      let more = await expandFromUrl(source.url);
      if (!more) { setMessages((m) => m.slice(0, -1)); return false; }
      const lang = sessionLangRef.current;
      if (lang) { try { const tr = await import('@/lib/ai/translate'); const t = await tr.fromEnglish(more, lang); if (t) more = t; } catch { /* keep English */ } }
      setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: 'assistant', content: more!, kind: 'search', sources: [source] }; return c; });
      return true;
    } catch { setMessages((m) => m.slice(0, -1)); return false; }
    finally { setGenerating(false); }
  };

  // --- Task Brain: composition with slot-filling ---------------------------

  /** Ask for the next missing parameter of a paused composition. */
  const askGraphSlot = (plan: GraphPlan, idx: number) => {
    pendingGraphRef.current = { plan, idx };
    const slot = plan.missing[idx].slot;
    push({ role: 'assistant', content: slot.question ?? `What ${slot.name}?`, clarify: slot.options });
  };

  /** Fill the current slot from the user's answer, then ask the next or run. */
  const fillGraphSlot = (value: string) => {
    const pend = pendingGraphRef.current;
    if (!pend) return;
    const { plan, idx } = pend;
    const m = plan.missing[idx];
    const gs = plan.nodes[m.nodeIdx].slots.find((s) => s.slot.name === m.slot.name);
    if (gs) gs.value = extractSlot(m.slot, value) ?? value.trim();
    if (idx + 1 < plan.missing.length) { askGraphSlot(plan, idx + 1); return; }
    pendingGraphRef.current = null;
    void executeGraph(plan);
  };

  /** Begin a composition: ask for any missing params, else run it now. */
  const startGraph = (plan: GraphPlan): boolean => {
    push({ role: 'assistant', content: plan.summary });
    if (plan.missing.length) { askGraphSlot(plan, 0); return true; }
    void executeGraph(plan);
    return true;
  };

  /** Run a composed plan: producer (calc) → result text → renderer (image/pdf/QR). */
  const executeGraph = async (plan: GraphPlan) => {
    setGenerating(true); stopRef.current = false;
    push({ role: 'assistant', content: 'On it — calculating, then creating your file…' });
    try {
      const producer = plan.nodes[0];
      const result = runProducer(producer);
      if (!result) { setLast('⚠ I couldn’t compute that — please check the numbers.'); setGenerating(false); return; }
      const renderer = plan.nodes[1] ?? producer;
      if (renderer.toolId === 'gen-qr-code') {
        const QR = (await import('qrcode')).default;
        const url = await QR.toDataURL(result, { width: 320, margin: 1 });
        setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: 'assistant', content: result, kind: 'qr', url, filename: 'xonvert-qr.png' }; return c; });
      } else if (renderer.toolId === 'render-pdf') {
        const { textToPdf } = await import('@/engines/document');
        applyResult({ kind: 'file', blob: await textToPdf(result), filename: 'xonvert.pdf' });
      } else {
        // render-poster → a titled graphic; the model designs the layout.
        if (!(await ensureModel())) { setLast('⚠ Still starting up — try again in a moment.'); setGenerating(false); return; }
        const seed = Math.floor(Math.random() * 1e9);
        const { url, spec } = await composePoster(result, engineRef.current, seed);
        setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: 'assistant', content: spec.title || result, kind: 'art', url, prompt: result, seed, posterSpec: spec, filename: 'xonvert.png' }; return c; });
      }
      push({ role: 'assistant', content: `Done — I ran ${producer.name}${plan.nodes[1] ? ` → ${plan.nodes[1].name}` : ''}.` });
    } catch (e) { console.error(e); setLast('⚠ That didn’t work — please try again.'); }
    finally { setGenerating(false); }
  };

  /** Render the previous answer as a downloadable PDF ("save this as a PDF"). */
  const saveAnswerAsPdf = async (textBody: string): Promise<boolean> => {
    setGenerating(true);
    push({ role: 'assistant', content: 'Making a PDF…' });
    try {
      const { textToPdf } = await import('@/engines/document');
      applyResult({ kind: 'file', blob: await textToPdf(textBody, 'Xonvert answer'), filename: 'xonvert-answer.pdf' });
      return true;
    } catch { setLast('⚠ Couldn’t make the PDF.'); return true; }
    finally { setGenerating(false); }
  };

  /**
   * The decider brain. When the fast deterministic rules don't resolve a
   * request, the model makes ONE bounded choice over the few most relevant
   * tools: run/open a TOOL, SEARCH the web (it writes the query), or CHAT. The
   * choice is grammar-constrained so it can't hallucinate a tool or break JSON;
   * a deterministic fallback covers the cold/WASM/bad-output cases. Returns true
   * if it handled the request (search or tool); false to let chat take over.
   */
  const runAgent = async (text: string, file: File | null): Promise<boolean> => {
    const cRaw = file ? fileCategory(file) : null;
    const fc = (cRaw === 'image' || cRaw === 'audio' || cRaw === 'video') ? cRaw : null;
    const cands = candidatesFor(text, fc);

    let decision: Decision | null = null;
    if (engineRef.current && cands.length) {
      try {
        const { messages, schema } = triagePrompt(text, cands, !!file);
        const out = await engineRef.current.chat.completions.create({
          messages, temperature: 0, max_tokens: 80,
          response_format: { type: 'json_object', schema },
        });
        decision = parseDecision(stripThink(out.choices?.[0]?.message?.content ?? ''), cands);
      } catch { /* fall back below */ }
    }
    if (!decision) decision = fallbackDecision(text, cands, !!file);

    if (decision.action === 'search') return await trySearch(decision.query || text);

    if (decision.action === 'tool' && decision.tool) {
      const doc = docById(decision.tool);
      if (doc) {
        const eff = file ?? lastFileRef.current;
        const efc = eff ? fileCategory(eff) : null;
        const stageF = eff && (efc === 'image' || efc === 'audio' || efc === 'video') && fileMatchesCategory(doc, efc) ? eff : undefined;
        push({ role: 'assistant', content: stageF ? `I’ll open ${doc.name} with your file ready.` : `Here’s the tool for that — ${doc.blurb}`, kind: 'tool', toolName: doc.name, toolHref: doc.href, stageFile: stageF });
        return true;
      }
    }
    return false; // 'chat' → let the conversational fallback handle it
  };

  /**
   * Creative image handling: we can't *generate* a picture of a subject, but we
   * can FIND a real one (Wikipedia/web, CORS-clean) and make it the working file
   * so the user can then edit/stylise it ("make it black and white", "crop it").
   * Returns false if nothing was found, so the caller can decline honestly.
   */
  const tryFindImage = async (text: string): Promise<boolean> => {
    const { imageSubject, findImage } = await import('@/lib/ai/image-search');
    const subject = imageSubject(text);
    if (!subject || subject.length < 2) return false;
    setGenerating(true);
    push({ role: 'assistant', content: `Looking for an image of ${subject}…` });
    try {
      const img = await findImage(subject);
      if (!img) { setMessages((m) => m.slice(0, -1)); return false; }
      // FETCH the image to a blob FIRST, then display it via a blob: object URL.
      // An external <img src> (upload.wikimedia.org) gets blocked inline by our
      // CSP/hotlink rules (placeholder), even though a direct download works — a
      // same-origin blob URL displays reliably AND becomes the editable file.
      const fname = `${subject.replace(/\s+/g, '-').slice(0, 40)}.jpg`;
      let displayUrl = img.url;
      try {
        const r = await fetch(img.url, { mode: 'cors', referrerPolicy: 'no-referrer' });
        if (r.ok) {
          const b = await r.blob();
          lastFileRef.current = new File([b], `${subject}.jpg`, { type: b.type || 'image/jpeg' });
          displayUrl = URL.createObjectURL(b);
        }
      } catch { /* fall back to the external URL */ }
      setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: 'assistant', content: `Here’s an image of ${img.title} (via ${img.source}). It’s loaded now — I can edit it: try “make it black and white”, “crop it”, or “remove the background”.`, kind: 'art', url: displayUrl, filename: fname }; return c; });
      setFollowups(['make it black and white', 'remove the background', 'crop it', 'add text to it']);
      return true;
    } catch { setMessages((m) => m.slice(0, -1)); return false; }
    finally { setGenerating(false); }
  };

  /** Ask a free-text question; the user's next message becomes the answer. */
  const askText = (question: string, build: (answer: string) => string, file: File | null) => {
    awaitingTextRef.current = { build, file: file ?? lastFileRef.current };
    push({ role: 'assistant', content: question });
  };

  const isTextLike = (f: File) => f.type.startsWith('text/') || /\.(txt|md|csv|json|log|html?|xml|tsv|ini|ya?ml|srt|vtt)$/i.test(f.name);

  // Inline ops decode the whole file into memory; past these sizes a low-end
  // phone can crash the tab, so we hand off to the tool page instead (it can
  // stream / use a worker). Generous caps — normal files sail through.
  const inlineSizeOk = (f: File): boolean => {
    const c = fileCategory(f);
    const ext = (f.name.split('.').pop() ?? '').toLowerCase();
    const cap = c === 'image' ? 40e6 : c === 'audio' ? 150e6 : c === 'video' ? 200e6 : ext === 'pdf' ? 100e6 : 120e6;
    return f.size <= cap;
  };

  /**
   * Run a text tool inline. The "smart" part is finding the text to operate on —
   * after a colon, in quotes, in a pasted block, or inside an attached .txt —
   * so the user never has to leave the chat to uppercase, sort, dedupe, extract
   * emails, base64, find-and-replace, and the rest of the text toolbox.
   */
  const runTextInline = async (doc: IndexDoc, op: TextOp, message: string, file: File | null): Promise<boolean> => {
    let operand = extractOperand(message);
    if (!operand) {
      const f = file ?? lastFileRef.current;
      if (f && isTextLike(f)) { try { operand = (await f.text()).trim(); } catch { /* unreadable */ } }
    }
    if (!operand) {
      push({ role: 'assistant', content: `Sure — paste the text (or add it after a colon, e.g. “${doc.name}: your text here”) and I’ll ${op.verb}.` });
      return true;
    }
    let out: string;
    try { out = op.run(operand, message); }
    catch { push({ role: 'assistant', content: '⚠ I couldn’t process that text.' }); return true; }
    push({ role: 'assistant', content: out.length ? out : '(empty result)' });
    return true;
  };

  /**
   * Run a developer/generator tool inline. Transforms (JSON/XML format, hash,
   * slug, JWT decode) pull their input like text ops; generators (UUID,
   * password, lorem) need none.
   */
  const runDevInline = async (doc: IndexDoc, op: DevOp, message: string, file: File | null): Promise<boolean> => {
    let operand = '';
    if (op.needsInput) {
      let ex = extractOperand(message);
      if (!ex) { const f = file ?? lastFileRef.current; if (f && isTextLike(f)) { try { ex = (await f.text()).trim(); } catch { /* unreadable */ } } }
      if (!ex) { push({ role: 'assistant', content: `Paste the input (or add it after a colon) and I’ll ${op.verb}.` }); return true; }
      operand = ex;
    }
    let out: string;
    try { out = await op.run(operand, message); }
    catch { push({ role: 'assistant', content: '⚠ I couldn’t complete that.' }); return true; }
    push({ role: 'assistant', content: out.length ? out : '(empty result)' });
    return true;
  };

  /**
   * Multi-step planner branch. Decomposes a compound request into an ordered
   * tool chain, narrates the plan (so the user learns what we have), then runs
   * the runnable prefix end-to-end on-device and guides any remaining steps.
   * Returns false for single-step requests so the normal pipeline handles them.
   */
  /** Model hook for model-backed chain steps (e.g. ai-summarize). Non-streaming,
   *  think-stripped, bounded — one call per step. */
  const chainGenerate = async (system: string, user: string): Promise<string> => {
    if (!(await ensureModel())) return '';
    try {
      const out = await engineRef.current.chat.completions.create({ messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.2, max_tokens: 220 });
      return stripThink(out.choices?.[0]?.message?.content ?? '');
    } catch { return ''; }
  };

  const tryPlan = async (text: string, file: File | null): Promise<boolean> => {
    if (segment(text).length < 2) return false;
    const eff = file ?? lastFileRef.current;
    const plan = planRequest(text, { inputMedium: planMedium(eff) });
    if (plan.steps.length < 2) return false; // didn't decompose into a real chain

    push({ role: 'assistant', content: narratePlan(plan).text });

    // A pure text chain ("remove duplicate lines and sort them") runs on text
    // from the message (or an attached .txt) — no file upload needed.
    const allText = plan.steps.every((s) => textOpFor(s.toolId));
    let initial: File | string | null = eff;
    if (allText) {
      initial = extractOperand(text);
      if (!initial && eff && isTextLike(eff)) { try { initial = await eff.text(); } catch { /* unreadable */ } }
    }
    if (!initial) {
      if (allText) {
        push({ role: 'assistant', content: 'Paste the text (or add it after a colon) and I’ll run the whole sequence.' });
      } else {
        armedRef.current = text;
        push({ role: 'assistant', content: 'Attach the file and I’ll run the whole sequence, privately.', kind: 'attach' });
      }
      return true;
    }
    if (initial instanceof File && !inlineSizeOk(initial)) {
      const first = plan.steps[0];
      push({ role: 'assistant', content: `That file’s large — I’ll open ${first.name} with it loaded so it’s handled safely; run the steps there.`, kind: 'tool', toolName: first.name, toolHref: first.href, stageFile: initial });
      return true;
    }
    if (initial instanceof File) lastFileRef.current = initial;
    setGenerating(true); stopRef.current = false;
    push({ role: 'assistant', content: `Step 1/${plan.steps.length}: ${plan.steps[0].narration}…` });
    try {
      const outcome = await runChain(initial, plan.steps, (i, step) => setLast(`Step ${i + 1}/${plan.steps.length}: ${step.narration}…`), () => stopRef.current, { generate: chainGenerate });
      if (outcome.error === 'stopped') { setLast('Stopped.'); setGenerating(false); return true; }
      if (outcome.result && outcome.result.kind === 'text') {
        setLast(outcome.result.text || '(empty result)');
        if (outcome.ran > 1) push({ role: 'assistant', content: recapPlan(plan, outcome.ran) });
        setGenerating(false);
        return true;
      }
      if (outcome.result && (outcome.result.kind === 'file' || outcome.result.kind === 'image')) {
        applyResult(outcome.result);
        if (outcome.ran > 1) push({ role: 'assistant', content: recapPlan(plan, outcome.ran) });
      } else if (outcome.error) {
        setLast(`⚠ I got partway, then hit a snag: ${outcome.error}`);
      } else if (outcome.stoppedAt === 0) {
        setLast('Here’s how to run this — your file is ready in each tool:');
      }
      // Steps we can't run inline yet → guide them, file preloaded.
      if (outcome.stoppedAt >= 0 && outcome.stoppedAt < plan.steps.length) {
        const rest = plan.steps.slice(outcome.stoppedAt);
        const next = rest[0];
        const out = lastFileRef.current ?? eff;
        push({
          role: 'assistant',
          content: rest.length > 1
            ? `For the remaining ${rest.length} steps, start with ${next.name} — your file is loaded.`
            : `Last step: open ${next.name} — your file is loaded.`,
          kind: 'tool', toolName: next.name, toolHref: next.href, stageFile: out ?? undefined,
          alts: rest.slice(1, 4).map((s) => ({ label: s.name, href: s.href })),
        });
      }
    } catch (e) {
      console.error(e);
      setLast('⚠ That sequence failed partway through.');
    } finally {
      setGenerating(false);
    }
    return true;
  };

  // "Can you… / do you have a tool for… / how do I…" — answer grounded in the
  // real catalog (the top capability card + alternatives), never improvised.
  const CAPABILITY_Q = /\b(can (you|i)|could you|are you able|do you (have|support|offer)|is there (a|an|any|some)?\s*(tool|way|feature|option)|how (do|can|would|to) (i|you)|how to)\b/i;
  const tryCapabilityAnswer = (text: string): boolean => {
    if (!CAPABILITY_Q.test(text)) return false;
    if (segment(text).length >= 2) return false; // multi-step → let the planner handle
    if (extractOperand(text)) return false;      // they supplied text to act on → do it, don't just link
    const ctx = capabilityContext(text, 5);
    if (!ctx.confident || !ctx.tools.length) return false;
    const top = ctx.tools[0];
    push({
      role: 'assistant',
      content: `Yes — ${ctx.cards[0]}`,
      kind: 'tool', toolName: top.name, toolHref: top.href,
      alts: ctx.tools.slice(1, 4).map((t) => ({ label: t.name, href: t.href })),
    });
    return true;
  };

  /**
   * Stop generation. Sets the flag the streaming loops watch AND asks the
   * engine to actually interrupt (web-llm) so the GPU stops working — not just
   * a UI break. Also unsticks the UI in case a loop's `finally` can't run.
   */
  const handleStop = () => {
    stopRef.current = true;
    try { engineRef.current?.interruptGenerate?.(); } catch { /* not all engines support it */ }
    setGenerating(false);
  };

  /**
   * Document understanding: extract text / summarise / answer questions about a
   * dropped PDF or image (OCR), on-device. Returns true if handled.
   */
  const tryDocQA = async (text: string, file: File | null): Promise<boolean> => {
    const fresh = !!file && isDocument(file);   // a document provided THIS turn
    const f = file ?? lastFileRef.current;
    if (!f || !isDocument(f)) return false;
    const intent = docIntent(text);
    if (!intent) return false;
    // Don't hijack a general-knowledge question (e.g. "what is ipv4") into reading
    // a document that just happens to still be in context. A bare question only
    // counts as doc-Q&A if the file was provided this turn, or the message
    // explicitly refers to the document. Explicit "extract"/"summarise" intents
    // are operations on the file, so they're allowed through.
    const refersToDoc = DOC_REFERS_RE.test(text);
    if (intent === 'question' && !fresh && !refersToDoc) return false;
    lastFileRef.current = f;
    stopRef.current = false;
    setGenerating(true);
    push({ role: 'assistant', content: 'Reading the document…' });
    let docText = '';
    try { docText = await extractDocText(f); }
    catch { setLast('⚠ Could not read that document.'); setGenerating(false); return true; }
    if (stopRef.current) { setLast('Stopped.'); setGenerating(false); return true; }
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
    if (!(await ensureModel())) { setLast('⚠ Still starting up — try again in a moment.'); setGenerating(false); return true; }
    try {
      const stream = await engineRef.current.chat.completions.create({ messages: [{ role: 'system', content: sys }, { role: 'user', content: userMsg }], stream: true, temperature: 0.2 });
      let acc = '';
      for await (const ch of stream) { if (stopRef.current) break; acc += ch.choices[0]?.delta?.content ?? ''; setLast(stripThink(acc)); }
      acc = stripThink(acc);
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
    // 0.5) "What can I do with this?" — surface the file's action menu directly.
    if (/\b(what can (you|i) do|what (else )?can you do|what are my options|show( me)? (the )?options|what now)\b/i.test(text) && (file || lastFileRef.current)) {
      if (showFileActions((file ?? lastFileRef.current)!)) return true;
    }

    // 0.6) Decide the request FAMILY once, up front, and let it gate the
    //      ambiguous steps below — so a question ("bitcoin price") can't be
    //      grabbed by the capability gate, and an opinion ("best game 2026")
    //      can't fall through to tool routing. (Only count a file provided THIS
    //      turn as task-signal; a stale working file shouldn't make a question
    //      look like a job.)
    const family = classifyIntent(text, { hasFile: !!file, hasTopic: !!lastTopicRef.current });

    // 0.65) Too vague to act on confidently ("fix this", "do something", "the
    //        usual") — ASK instead of guessing a random tool. With a file, show
    //        what we can do with it; otherwise invite a clear request.
    if (/^\s*(fix (this|it)|do something( cool| nice| with (this|it))?|do your thing|make it (better|nice|cool|good|pretty)|the usual|whatever|surprise me|just do it|help me( with (this|it))?)\s*[?.!]*\s*$/i.test(text)) {
      const f = file ?? lastFileRef.current;
      if (f && showFileActions(f)) return true;
      push({ role: 'assistant', content: 'Happy to help — what would you like to do? I can convert, compress, edit, summarise, translate, generate, or just answer a question. Drop a file or tell me in your own words.' });
      return true;
    }

    // 0.7) "Save this as a PDF" — turn the previous answer into a document.
    if (!file && isSaveAsPdf(text) && lastAnswerRef.current) {
      if (await saveAnswerAsPdf(lastAnswerRef.current)) return true;
    }

    // 0.8) Composition: a request that wires a value PRODUCER (a calc/finance
    //      tool) into a RENDERER (image/pdf/QR) — "make an image with my loan
    //      calculation on it". Checked before media-subject (so it isn't read as
    //      "draw a picture of X") and before generative art.
    const graph = planGraph(text);
    if (graph.kind === 'compose') return startGraph(graph);

    // 1) Conversions — deterministic planner (validates target + file category).
    if (await handleConvert(text, file)) return true;

    // 1.5) A format conversion the inline planner didn't run (e.g. PDF→Word):
    //      open the converter, so a stray verb like "turn"/"change" can't match
    //      an editing tool (rotate) instead.
    if (CONVERT_PHRASE.test(text)) {
      const eff = file ?? lastFileRef.current;
      push({ role: 'assistant', content: 'Here’s the converter — drop your file and pick the exact format you want.', kind: 'tool', toolName: 'Convert', toolHref: '/convert', stageFile: eff ?? undefined });
      return true;
    }

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

    // 2.5) "What can you do / help" — an organized overview, not the small
    //       model improvising. Only when it's not about a specific file.
    if (!file && HELP_INTENT.test(text)) {
      push({ role: 'assistant', content: HELP_OVERVIEW });
      push({ role: 'assistant', content: 'Browse everything:', kind: 'tool', toolName: 'All tools', toolHref: '/tools', alts: [{ label: 'Apps', href: '/apps' }] });
      return true;
    }

    // 2.6) Capability questions ("can you…", "how do I…", "is there a tool for…")
    //       answered from the live catalog — the right tool + alternatives. Gated
    //       on the intent: "can you tell me the bitcoin price" is a factual
    //       question, NOT a capability question, so it must not match here.
    if (family === 'capability' && tryCapabilityAnswer(text)) return true;

    // 2.65) Specialized calculators (percent / tip / temperature / BMI) —
    //        computed inline before the general-question guard sends them to the
    //        chat model (which is bad at arithmetic).
    if (!file) {
      const calc = tryCalc(text);
      if (calc) { push({ role: 'assistant', content: calc.result, kind: 'calc' }); return true; }
      // Dice / coin / picker — pure randomisers, parsed from the message.
      const gr = tryGameRandom(text);
      if (gr) { push({ role: 'assistant', content: gr.result, kind: 'calc' }); return true; }
      // Time tools — cron explain, unix timestamp, ISO-8601.
      const tt = tryTime(text);
      if (tt) { push({ role: 'assistant', content: tt.result, kind: 'calc' }); return true; }
      // Finance — mortgage / savings / investment.
      const fin = tryFinance(text);
      if (fin) { push({ role: 'assistant', content: fin.result, kind: 'calc' }); return true; }
      // Symbolic/scientific math — lazy-load mathjs only for plausible math.
      if (/\b(derivative|differentiate|simplify|determinant|sqrt|sin|cos|tan|log|ln|exp|factorial|pi)\b|\^|\d\s*!/i.test(text)) {
        const { tryMath } = await import('@/lib/ai/math-ops');
        const mr = tryMath(text);
        if (mr) { push({ role: 'assistant', content: mr.result, kind: 'calc' }); return true; }
      }
    }

    // 2.7) Quick generators (UUID / password / lorem) — handled before the
    //       generative-art branch so "generate a uuid" runs the tool instead of
    //       being drawn as a picture.
    if (/\b(uuid|guid|password|passphrase|lorem|random data|sample data|fake data|test data|mock data)\b/i.test(text)) {
      const r = await routeToTool(text, null);
      const dOp = r.top && r.confidence !== 'weak' ? devOpFor(r.top.doc.id) : undefined;
      if (dOp) return await runDevInline(r.top!.doc, dOp, text, file);
    }

    // 2.71) CSS / code generators (gradient, box-shadow, glassmorphism…) — output
    //        ready-to-copy CSS text; routed before the generative-art branch.
    if (CSS_TRIGGER.test(text)) {
      const r = await routeToTool(text, null);
      const cOp = r.top && r.confidence !== 'weak' ? cssOpFor(r.top.doc.id) : undefined;
      if (cOp) { push({ role: 'assistant', content: cOp.run(text) }); return true; }
    }
    // 2.715) SEO snippet generators (meta/OG/Twitter/robots/JSON-LD) — text output.
    if (SEO_TRIGGER.test(text)) {
      const r = await routeToTool(text, null);
      const sOp = r.top && r.confidence !== 'weak' ? seoOpFor(r.top.doc.id) : undefined;
      if (sOp) { push({ role: 'assistant', content: sOp.run(text) }); return true; }
    }

    // 2.72) Game-name generators (fantasy/sci-fi/username/clan/…) — before the
    //        art branch so "generate a clan name" produces a name, not a picture.
    if (looksLikeGameName(text)) {
      const r = await routeToTool(text, null);
      const gOp = r.top && r.confidence !== 'weak' ? gameOpFor(r.top.doc.id) : undefined;
      if (gOp) { push({ role: 'assistant', content: gOp.run() }); return true; }
    }

    // 2.85) "Make an image that SAYS <text>" — render the words on a graphic
    //        with NO model (was mis-routed to SVG generation, which reloaded the
    //        model and produced nothing). Caught before media-subject/SVG.
    {
      const m = text.match(/\b(?:make|create|generate|design|give me|need|want|build)\b[\s\S]*?\b(?:image|picture|poster|graphic|banner|card|wallpaper)\b[\s\S]*?\b(?:that says|saying|says|that reads?|reading|writes?|write|with (?:the )?(?:text|words?|caption)(?: of)?|with)\b\s*[:\-]?\s*["“']?(.+?)["”']?\s*$/i);
      const phrase = m?.[1]?.trim();
      if (phrase && phrase.length >= 1 && phrase.length <= 80 && !/\b(my|loan|calculation|bmi|investment)\b/i.test(phrase)) {
        const { heuristicSpec, renderPoster } = await import('@/lib/ai/poster');
        const seed = Math.floor(Math.random() * 1e9);
        const spec = heuristicSpec(phrase); spec.title = phrase; spec.subtitle = '';
        const url = renderPoster(spec, seed);
        push({ role: 'assistant', content: phrase, kind: 'art', url, prompt: phrase, seed, posterSpec: spec, filename: 'xonvert.png' });
        return true;
      }
    }

    // 2.9) "Make me a picture of <subject>" — we can't synthesize a real
    //       depiction. Be honest and offer the picture things we DO (poster, QR,
    //       background removal), rather than emitting meaningless abstract art.
    if (family === 'media-subject') {
      // Don't just decline — try to FIND a real image of the subject and make it
      // editable. Only fall back to an honest decline if nothing's found.
      if (await tryFindImage(text)) return true;
      const d = declineMediaSubject(text);
      push({ role: 'assistant', content: d.message });
      setFollowups(d.suggestions);
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
        if (!(await ensureModel())) { setLast('⚠ Still starting up — try again in a moment.'); setGenerating(false); return true; }
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
        if (!(await ensureModel())) { push({ role: 'assistant', content: intent.prompt, kind: 'art', url: artToUrl(intent.prompt, seed), prompt: intent.prompt, seed }); setGenerating(false); return true; }
        const out = await engineRef.current.chat.completions.create({ messages: [{ role: 'system', content: svgSystemPrompt() }, { role: 'user', content: intent.prompt }], temperature: 0.5 });
        const svg = extractSvg(out.choices?.[0]?.message?.content ?? '');
        if (svg) push({ role: 'assistant', content: '', kind: 'svg', svg });
        else push({ role: 'assistant', content: intent.prompt, kind: 'art', url: artToUrl(intent.prompt, seed), prompt: intent.prompt, seed });
      } catch { push({ role: 'assistant', content: intent.prompt, kind: 'art', url: artToUrl(intent.prompt, seed), prompt: intent.prompt, seed }); }
      finally { setGenerating(false); }
      return true;
    }

    // 3.35) Reaching a friend (send a file, QR a link, start a call/chat). Runs
    //        BEFORE doc-Q&A and tool routing so "send this file to my friend" or
    //        "can I video-call my friend?" aren't read as a document or matched
    //        to video-editing tools.
    if (CONTACT_INTENT.test(text)) {
      const effFile = file ?? lastFileRef.current;
      const plan = classifyContact(text, !!effFile);
      if (plan.kind === 'send-file' && effFile) {
        lastFileRef.current = effFile;
        push({ role: 'assistant', content: 'I’ll open Send with your file — share the private link with your friend and the transfer starts automatically.', kind: 'tool', toolName: 'Send', toolHref: '/send', stageFile: effFile });
        return true;
      }
      if (plan.kind === 'qr') {
        try { const QR = (await import('qrcode')).default; const dataUrl = await QR.toDataURL(plan.url, { width: 320, margin: 1 }); push({ role: 'assistant', content: `Here’s a QR code for ${plan.url} — your friend can scan it, or download and send it.`, kind: 'qr', url: dataUrl, filename: 'xonvert-qr.png' }); }
        catch { push({ role: 'assistant', content: `I can share ${plan.url} — open Send to pass it along.`, kind: 'tool', toolName: 'Send', toolHref: '/send' }); }
        return true;
      }
      if (plan.kind === 'app') {
        const allOpts = [{ label: 'Video Call', href: '/call' }, { label: 'Voice Call', href: '/call?audio=1' }, { label: 'Group Chat', href: '/chat' }, { label: 'Send a file', href: '/send' }];
        push({ role: 'assistant', content: `Sure — I’ll open ${plan.name}. Start it, then share the private link with your friend.`, kind: 'tool', toolName: plan.name, toolHref: plan.href, alts: allOpts.filter((o) => o.href !== plan.href).slice(0, 3) });
        return true;
      }
      // Generic "send to a friend" with nothing specific yet.
      push({ role: 'assistant', content: 'Sure — attach a file and I’ll set up a private Send link, paste a link and I’ll make a QR, or pick one:', kind: 'tool', toolName: 'Send', toolHref: '/send', alts: [{ label: 'Video Call', href: '/call' }, { label: 'Voice Call', href: '/call?audio=1' }, { label: 'Group Chat', href: '/chat' }] });
      return true;
    }

    // 3.4) Document understanding — questions / summary / OCR on a PDF or image.
    if (await tryDocQA(text, file)) return true;

    // 3.45) Questions are NOT a job. A factual/informational/opinion question
    //       ("who invented X", "best game 2026"), or a follow-up ("tell me
    //       more"), is answered from the web — never routed to a tool. Calc,
    //       quick-skills and generators already ran above, so anything reaching
    //       here is genuinely informational.
    if (!file && (family === 'question' || family === 'followup' || (!lastFileRef.current && isGeneralQuestion(text)))) {
      // A bare follow-up ("tell me more") expands the previous answer's source.
      if (family === 'followup' && lastSourceRef.current) {
        if (await tryExpand(lastSourceRef.current)) return true;
      }
      // Conversational coherence: resolve pronouns / continuations against the
      // last topic so "where was he born?" becomes "where was Einstein born?".
      const { rewriteFollowup } = await import('@/lib/ai/followup');
      const rewritten = rewriteFollowup(text, lastTopicRef.current);
      const q = rewritten ?? (family === 'followup' && lastTopicRef.current ? lastTopicRef.current : text);
      if (await trySearch(q)) return true;
      // A genuine question we couldn't ground: admit it rather than forcing a
      // tool or letting the tiny model invent facts.
      if (family === 'question' || family === 'followup') {
        const d = declineNoAnswer();
        push({ role: 'assistant', content: d.message });
        return true;
      }
      return false;
    }

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

    // 3.7) Multi-step jobs — decompose into an ordered tool chain, narrate it,
    //       and run the whole sequence end-to-end on-device (the docx example).
    //       Runs before single-tool routing so compound requests aren't reduced
    //       to just their first action.
    if (await tryPlan(text, file)) return true;

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
      // Text tools: run inline on text from the message (or an attached .txt).
      const textOp = textOpFor(top.id);
      if (textOp) return await runTextInline(top, textOp, text, file);
      const devOp = devOpFor(top.id);
      if (devOp) return await runDevInline(top, devOp, text, file);
      // Subtitle transforms run on pasted/attached SRT/VTT, like text ops.
      const subOp = subtitleOpFor(top.id);
      if (subOp) return await runTextInline(top, subOp, text, file);
      // Color tools: answer inline if a colour is in the message, else open the tool.
      const colorOp = colorOpFor(top.id);
      if (colorOp) { const out = colorOp.run(text); if (out) { push({ role: 'assistant', content: out }); return true; } }

      // AI abilities (translate / summarize) routed as a single request — run on
      // the message's text (or attached/last text) through the SAME executor that
      // runs them in chains. No special-case branch per ability.
      if (top.id === 'ai-translate' || top.id === 'ai-summarize') {
        let operand = extractOperand(text);
        if (!operand) { const f = file ?? lastFileRef.current; if (f && isTextLike(f)) { try { operand = (await f.text()).trim(); } catch { /* unreadable */ } } }
        if (!operand) {
          const tr = top.id === 'ai-translate' ? detectTranslate(text) : null;
          askText(top.id === 'ai-translate' ? `What should I translate${tr ? ` to ${tr.toName}` : ''}?` : 'Paste the text to summarize.', (ans) => `${text}: ${ans}`, file);
          return true;
        }
        const plan = planRequest(text, {});
        if (plan.steps.length) {
          setGenerating(true); stopRef.current = false;
          push({ role: 'assistant', content: top.id === 'ai-translate' ? 'Translating…' : 'Summarizing…' });
          try {
            const out = await runChain(operand, plan.steps, () => {}, () => stopRef.current, { generate: chainGenerate });
            setLast(out.result?.kind === 'text' && out.result.text ? out.result.text : '⚠ I couldn’t complete that.');
          } catch { setLast('⚠ I couldn’t complete that.'); }
          finally { setGenerating(false); }
          return true;
        }
      }

      const cap = inlineCap(top.id);
      const effFile = file ?? lastFileRef.current;
      if (cap) {
        if (effFile && fileCategory(effFile) === cap.input) {
          if (!inlineSizeOk(effFile)) {
            push({ role: 'assistant', content: `That file’s quite large — I’ll open ${top.name} where it’s processed more safely. Your file is loaded.`, kind: 'tool', toolName: top.name, toolHref: top.href, stageFile: effFile });
            return true;
          }
          // Smart clarify: ask one crisp question when a key parameter is
          // genuinely missing (rather than guessing a default that may be wrong).
          const rule = CLARIFY_RULES[top.id];
          if (rule && !rule.has.test(text)) { askClarify(rule.question, rule.options, effFile); return true; }
          // Text overlay tools need the words — ask if none were given.
          if ((top.id === 'image-add-text' || top.id === 'image-watermark') && !/(say(?:ing)?|with|text|reads?|:|["“])/i.test(text)) {
            const wm = top.id === 'image-watermark';
            askText(wm ? 'What should the watermark say?' : 'What text should I add?', (ans) => `${wm ? 'watermark this image with' : 'add the text'} ${ans}`, effFile);
            return true;
          }
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

      // Executor-backed tools (PDF page ops, doc→PDF, format conversion) run
      // inline on a single file too — not only inside multi-step chains.
      if (hasRunner(top.id) && effFile) {
        const med = planMedium(effFile);
        const suits = top.id.startsWith('pdf-') ? med === 'pdf'
          : top.id === 'doc-convert' ? med === 'doc' || med === 'pdf'
          : top.id.includes('convert') ? med === 'image' || med === 'audio'
          : med != null;
        if (suits) {
          if (!inlineSizeOk(effFile)) {
            push({ role: 'assistant', content: `That file’s quite large — I’ll open ${top.name} where it’s processed more safely. Your file is loaded.`, kind: 'tool', toolName: top.name, toolHref: top.href, stageFile: effFile });
            return true;
          }
          const rule = CLARIFY_RULES[top.id];
          if (rule && !rule.has.test(text)) { askClarify(rule.question, rule.options, effFile); return true; }
          // Watermark needs text — ask for it (free-text) rather than stamping a default.
          if (top.id === 'pdf-watermark' && !/(say(?:ing)?|with|text|reads?|:|["“])/i.test(text)) {
            askText('What should the watermark say?', (ans) => `watermark this pdf with ${ans}`, effFile);
            return true;
          }
          const plan = planRequest(text, { inputMedium: med ?? undefined });
          const steps = plan.steps.length ? plan.steps : null;
          if (steps) {
            lastFileRef.current = effFile;
            setGenerating(true); stopRef.current = false;
            push({ role: 'assistant', content: steps.length > 1 ? narratePlan(plan).text : `Working on it — I’ll ${steps[0].narration}…` });
            try {
              const out = await runChain(effFile, steps, (i, s) => { if (steps.length > 1) setLast(`Step ${i + 1}/${steps.length}: ${s.narration}…`); }, () => stopRef.current, { generate: chainGenerate });
              if (out.error === 'stopped') setLast('Stopped.');
              else if (out.result) applyResult(out.result);
              else setLast('⚠ That didn’t work — the file may be unsupported.');
            } catch (e) { console.error(e); setLast('⚠ That didn’t work — the file may be unsupported.'); }
            finally { setGenerating(false); }
            return true;
          }
        }
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

    // Late fallback: a bare factual lookup ("eiffel tower height") that matched
    // no tool — answer it from the web before giving up to the chat model.
    if (!file && !lastFileRef.current && looksFactual(text)) {
      if (await trySearch(text)) return true;
    }
    return false;
  };

  /**
   * Detect a non-English request and translate it to English (browser built-in
   * translator → Opus-MT fallback), so the English router/search can handle it.
   * Returns the English text + source language, or null when it's English.
   */
  const toEnglishLang = async (text: string): Promise<{ text: string; lang: string } | null> => {
    try { const tr = await import('@/lib/ai/translate'); return await tr.toEnglish(text); }
    catch { return null; }
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
      const o = JSON.parse(stripThink(out.choices?.[0]?.message?.content ?? '{}') || '{}');
      return typeof o.tool === 'string' && ids.includes(o.tool) ? o.tool : null;
    } catch { return null; }
  };

  /** The full request pipeline. Shared by typed sends and armed file-drops. */
  const process = async (text: string, file: File | null) => {
    setSuggest([]);

    // A composition is paused for a parameter → this message fills that slot.
    if (pendingGraphRef.current && text.trim()) { fillGraphSlot(text.trim()); return; }

    // A free-text question is pending → take this message as the answer.
    if (awaitingTextRef.current && text.trim()) {
      const { build, file: f } = awaitingTextRef.current;
      awaitingTextRef.current = null;
      await routeAndAct(build(text.trim()), f);
      return;
    }

    // --- conversation memory: undo / again / same-to-this --------------------
    const REDO = /^\s*(do (it|that) again|again|once more|redo|repeat|same again)\s*$/i;
    const SAME = /\b(do the same|same (thing )?(to|for|with|on) (this|that|it|the )?|apply the same)\b/i;
    const UNDO = /^\s*(undo|go back|revert|never ?mind|that was wrong|previous( one)?)\s*$/i;

    if (UNDO.test(text)) {
      const prev = fileHistoryRef.current.pop();
      if (prev) { lastFileRef.current = prev; setFollowups([]); push({ role: 'assistant', content: `Reverted — back to **${prev.name}**. What next?` }); }
      else push({ role: 'assistant', content: 'Nothing to undo yet.' });
      return;
    }
    if ((REDO.test(text) || SAME.test(text)) && lastJobRef.current) {
      const target = file ?? lastFileRef.current;
      if (!target && !lastJobRef.current.match(/qr|palette|calc|draw|generate/i)) {
        push({ role: 'assistant', content: 'Attach the file you’d like me to do that to.' });
        return;
      }
      push({ role: 'assistant', content: `Sure — doing the same again${file ? ' to the new file' : ''}.` });
      await routeAndAct(lastJobRef.current, file);
      return;
    }
    // Remember this turn's wording as the "last job" — but never a bare
    // refinement command, or "again" would replay itself.
    if (text.trim() && !REDO.test(text) && !UNDO.test(text)) lastJobRef.current = text;

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

    sessionLangRef.current = null;

    // Non-Latin scripts (Arabic/Persian, CJK, Cyrillic, …) MUST be translated to
    // English BEFORE routing. Routing the raw foreign string lets its tokens make
    // a spurious lexical match that fires first (the Persian "PDF→Word" request
    // matched audio-tempo) — so the translate-retry never got a turn. Translate
    // up front, route on English, and remember the language for the reply.
    let primary = text;
    let englishText: string | null = null; // the English form, for the chat fallback
    if (looksNonLatin(text)) {
      const pre = await toEnglishLang(text);
      if (pre?.lang) sessionLangRef.current = pre.lang;
      if (pre && pre.text && pre.text.toLowerCase() !== text.toLowerCase()) { primary = pre.text; englishText = pre.text; }
    }
    if (await routeAndAct(primary, file)) return;

    // Latin text that's still another language (Spanish/French/…): the raw pass
    // above didn't match, so translate now and retry once in English.
    if (primary === text) {
      const det = await toEnglishLang(text);
      const en = det && det.text.toLowerCase() !== text.toLowerCase() ? det.text : null;
      if (det?.lang) sessionLangRef.current = det.lang;
      englishText = en;
      if (en && (await routeAndAct(en, file))) return;
    }

    // Reliable easter eggs (greetings, jokes, "who are you") — land before the
    // model so the fun is consistent, not the tiny model's hit-or-miss attempt.
    const fun = funReply(text);
    if (fun) { push({ role: 'assistant', content: fun }); if (voiceActiveRef.current) speak(fun); return; }

    // The decider brain: nothing deterministic matched, so let the model choose
    // what to do — run/open a tool, or search the web (writing its own query) —
    // instead of dumping the request on the weak chat model. Runs on the English
    // form so retrieval + triage are at full strength.
    if (await runAgent(englishText ?? text, file)) return;

    // Fallback — tool suggestions + the on-device model. When the user wrote in
    // another language, feed the model English (its strong language) and
    // translate the reply back, rather than let it stumble in Arabic/Thai/etc.
    const lang = sessionLangRef.current;
    const userForModel = lang && englishText ? englishText : text;
    setSuggest(suggestTools(englishText && englishText !== text ? englishText : text));
    setGenerating(true); stopRef.current = false;
    push({ role: 'assistant', content: '' });
    // This branch needs the model — wait for it now (it's been loading in the
    // background since the request came in).
    if (!(await ensureModel())) { setLast('⚠ The assistant is still starting up — try again in a moment.'); setGenerating(false); return; }
    // Only the recent turns — keeps the prompt small (less memory/compute) and
    // safely within the context window; older chat rarely changes the reply.
    const history = [...messages.slice(-8), { role: 'user' as const, content: userForModel }];
    // Ground the reply in the real catalog: when the message clearly relates to
    // tools we have, give the model their names/blurbs so it answers from fact
    // (and points to the right one) instead of improvising. General chat
    // (greetings, definitions) gets no injection, so it stays natural.
    const ctx = capabilityContext(userForModel, 5);
    const grounding = ctx.confident
      ? `\n\nRelevant Xonvert tools for this message — if one fits, name it and tell the user they can open it:\n${ctx.tools.map((t) => `- ${t.name}: ${t.blurb}`).join('\n')}`
      : '';
    const langNote = lang ? '\n\nRespond ONLY in clear English; your reply will be translated for the user.' : '';
    try {
      const stream = await engineRef.current.chat.completions.create({
        messages: [{ role: 'system', content: XONVERT_PERSONA + grounding + langNote }, ...history.map((m) => ({ role: m.role, content: m.content }))], stream: true, temperature: 0.6,
      });
      let acc = '';
      for await (const chunk of stream) { if (stopRef.current) break; acc += chunk.choices[0]?.delta?.content ?? ''; setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: 'assistant', content: stripThink(acc) }; return c; }); }
      acc = stripThink(acc);
      // Reply in the user's language: translate the finished English answer back.
      if (lang && acc.trim() && !stopRef.current) {
        try { const tr = await import('@/lib/ai/translate'); const out = await tr.fromEnglish(acc, lang); if (out) { acc = out; setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: 'assistant', content: acc }; return c; }); } } catch { /* keep English */ }
      }
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
  // Combine many files into one (merge PDFs, join audio, images→PDF).
  const runCombine = async (toolId: string, files: File[]) => {
    const runner = combineFor(toolId);
    if (!runner) { await processBatch('', files); return; }
    const total = files.reduce((s, f) => s + f.size, 0);
    if (total > 400e6) { push({ role: 'assistant', content: 'Those files are very large together — please combine them on the tool page so it stays smooth.' }); return; }
    setGenerating(true);
    push({ role: 'assistant', content: `Combining ${files.length} files…` });
    try { applyResult(await runner(files)); }
    catch (e) { console.error(e); setLast('⚠ Couldn’t combine those files — they may be in different or unsupported formats.'); }
    finally { setGenerating(false); }
  };

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
    setFollowups([]);
    // Deterministic work (routing, tools, text ops, chains) doesn't need the
    // model — only gate on "busy". Kick the model load in the background so it's
    // ready by the time a chat/creative request actually needs it.
    ensureLoaded();
    // Batch path: multiple files staged.
    if (pendingFiles.length > 1 && !generating) {
      const fs = pendingFiles;
      push({ role: 'user', content: `${text || 'Process these'}  ·  📎 ${fs.length} files` });
      setInput(''); setPendingFiles([]);
      // Combine into one ("merge these pdfs", "join these tracks") vs the
      // per-file batch (apply an op to each, return a zip).
      const combineTool = isCombineIntent(text) ? combineToolFor(fs, text) : null;
      if (combineTool) await runCombine(combineTool, fs);
      else await processBatch(text, fs);
      return;
    }
    const file = pendingFile;
    if ((!text && !file) || generating) return;
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
          <div ref={scrollRef} className="relative z-[1] flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-3 text-[var(--term-fg)] sm:p-4">
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
                  {recent.length > 0 && (
                    <div className="mt-5">
                      <div className="mb-1.5 flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.16em] text-[var(--term-dim)]">
                        <span>Recent</span>
                        <button type="button" onClick={() => { import('@/lib/ai/search-cache').then(({ clearSearchCache }) => clearSearchCache()).then(() => setRecent([])); }} className="text-[var(--term-dim)] underline-offset-2 hover:text-[var(--term-fg)] hover:underline">clear</button>
                      </div>
                      <div className="flex flex-wrap justify-center gap-1.5">
                        {recent.map((r) => (
                          <button key={r.ts} type="button" onClick={() => { push({ role: 'user', content: r.query }); void process(r.query, null); }} className="inline-flex items-center gap-1 border border-[var(--term-fg)]/25 bg-[var(--term-fg)]/[0.06] px-2.5 py-1 text-[12px] text-[var(--term-fg)] transition hover:bg-[var(--term-fg)]/[0.14]">{r.query}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`grid h-8 w-8 shrink-0 place-items-center border ${m.role === 'user' ? 'border-[var(--term-user)]/30 bg-[var(--term-user)]/10 text-[var(--term-user)]' : 'border-[var(--term-fg)]/30 bg-[var(--term-fg)]/10 text-[var(--term-fg)]'}`}>{m.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}</div>
                <div className="min-w-0 max-w-[calc(100%-2.75rem)] space-y-2 sm:max-w-[82%]">
                  {(!m.kind || m.kind === 'text' || m.kind === 'calc' || m.kind === 'attach' || m.kind === 'tool' || m.kind === 'menu' || m.kind === 'search') && m.content && (
                    <div className={`whitespace-pre-wrap break-words px-3 py-2 text-[14px] leading-relaxed ${m.role === 'user' ? 'border border-[var(--term-user)]/20 bg-[var(--term-user)]/10 text-[#cdeeff]' : 'text-[var(--term-fg)] terminal-glow'} ${m.kind === 'calc' ? 'text-[15px]' : ''}`}>
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
                  {m.clarify && m.clarify.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {m.clarify.map((o) => (
                        <button key={o.value} type="button" onClick={() => runClarify(o.value)} className="inline-flex items-center gap-1 border border-[var(--term-fg)]/30 bg-[var(--term-fg)]/[0.08] px-3 py-1.5 text-[12px] font-medium text-[var(--term-fg)] transition hover:bg-[var(--term-fg)]/[0.16]">{o.label}</button>
                      ))}
                    </div>
                  )}
                  {m.kind === 'search' && (
                    <div className="mt-1.5 space-y-2">
                      {m.sources && m.sources.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--term-dim)]">Sources</span>
                          {m.sources.map((s) => (
                            <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 border border-[var(--term-fg)]/25 bg-[var(--term-fg)]/[0.06] px-2.5 py-1 text-[12px] text-[var(--term-fg)] transition hover:bg-[var(--term-fg)]/[0.14]">{s.site} <ArrowRight className="h-3 w-3 -rotate-45" /></a>
                          ))}
                        </div>
                      )}
                      {m.related && m.related.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--term-dim)]">Related</span>
                          {m.related.map((r) => (
                            <button key={r} type="button" onClick={() => { push({ role: 'user', content: r }); void process(r, null); }} className="inline-flex items-center gap-1 border border-[var(--term-fg)]/30 bg-[var(--term-fg)]/[0.08] px-3 py-1.5 text-[12px] font-medium text-[var(--term-fg)] transition hover:bg-[var(--term-fg)]/[0.16]">{r}</button>
                          ))}
                        </div>
                      )}
                      <div className="text-[10px] text-[var(--color-fg-subtle)]">Looked this up from your device · facts come from the cited source, not the model</div>
                    </div>
                  )}
                  {m.kind === 'menu' && m.groups && (
                    <div className="space-y-2.5">
                      {m.groups.map((g) => (
                        <div key={g.title}>
                          <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-[var(--term-dim)]">{g.title}</div>
                          <div className="flex flex-wrap gap-1.5">
                            {g.actions.map((a) => (
                              <Link key={a.href} href={a.href} onClick={() => { if (m.stageFile) stageHandoff(m.stageFile); }} title={a.blurb} className="inline-flex items-center gap-1 border border-[var(--term-fg)]/25 bg-[var(--term-fg)]/[0.06] px-2.5 py-1 text-[12px] text-[var(--term-fg)] transition hover:bg-[var(--term-fg)]/[0.14]">{a.name}</Link>
                            ))}
                          </div>
                        </div>
                      ))}
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
            {followups.length > 0 && !generating && (
              <div className="flex flex-wrap items-center gap-2 pl-11">
                <span className="text-[11px] text-[var(--term-dim)]">next:</span>
                {followups.map((f) => (
                  <button key={f} type="button" onClick={() => runFollowup(f)} className="inline-flex items-center gap-1.5 border border-[var(--term-user)]/30 bg-[var(--term-user)]/[0.08] px-3 py-1.5 text-[12px] font-medium text-[var(--term-user)] transition hover:bg-[var(--term-user)]/[0.16]">{f}</button>
                ))}
              </div>
            )}
            {suggest.length > 0 && !generating && (
              <div className="flex flex-wrap gap-2 pl-11">
                {suggest.map((s) => (
                  <Link key={s.href} href={s.href} className="inline-flex items-center gap-1.5 border border-[var(--term-fg)]/30 bg-[var(--term-fg)]/[0.08] px-3 py-1.5 text-[12px] font-medium text-[var(--term-fg)] transition hover:bg-[var(--term-fg)]/[0.16]">{s.label} <ArrowRight className="h-3 w-3" /></Link>
                ))}
              </div>
            )}
          </div>
          <div className="relative z-10 shrink-0 border-t border-[#16241c] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
                  <span>{pendingFiles.length} files — say what to do (e.g. “merge them” or “convert all to webp”)</span>
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
                  placeholder={recording ? 'listening… tap ◼ to send' : 'type a command… (tools work right away)'}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
                  onPaste={(e) => { const it = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/')); const f = it?.getAsFile(); if (f) { e.preventDefault(); receiveFile(new File([f], `pasted-${Date.now()}.${(f.type.split('/')[1] || 'png')}`, { type: f.type })); } }}
                  className="max-h-44 min-h-[4.5rem] flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-relaxed text-[var(--term-fg)] caret-[var(--term-fg)] placeholder:text-[var(--term-dim)] focus:outline-none sm:min-h-[3.75rem] sm:text-[14px]" />
              </div>
              {/* Spacer pushes Send to the right on the mobile button row only. */}
              <div className="order-4 flex-1 sm:hidden" />
              {generating ? (
                <button type="button" onClick={(e) => { e.stopPropagation(); handleStop(); }} title="Stop" className="order-5 grid h-10 w-10 shrink-0 place-items-center bg-red-600 text-white sm:order-4"><Square className="h-4 w-4" /></button>
              ) : (
                <button type="button" onClick={send} disabled={!input.trim() && !pendingFile && pendingFiles.length < 2} title="Send" className="order-5 grid h-10 w-10 shrink-0 place-items-center bg-[var(--term-fg)] text-[#06140d] transition hover:brightness-110 disabled:bg-[#14201a] disabled:text-[var(--term-dim)] sm:order-4"><Send className="h-4 w-4" /></button>
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
