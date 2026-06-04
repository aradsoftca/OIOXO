export interface TocEntry {
  level: number;
  text: string;
  id: string;
  page?: number;
}

export function extractTocFromHtml(html: string): TocEntry[] {
  // Use DOMParser instead of `innerHTML =`. Setting innerHTML on a detached
  // div still fires `onerror`/`onload` handlers on injected `<img>` tags
  // (the spec doesn't gate active-content triggers on attachment), so a
  // hostile imported document could fire payloads here. DOMParser parses
  // into an inert document where image loads don't trigger and scripts
  // never run.
  const tmp = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
  const headings = tmp.querySelectorAll('h1, h2, h3, h4, h5, h6');
  const entries: TocEntry[] = [];
  headings.forEach((h, i) => {
    if (!h.id) h.id = `toc-${i}-${slugify(h.textContent ?? '')}`;
    const level = parseInt(h.tagName[1], 10);
    entries.push({ level, text: h.textContent ?? '', id: h.id });
  });
  return entries;
}

export function buildTocHtml(entries: TocEntry[], options: { numbered?: boolean; title?: string } = {}): string {
  const numbered = options.numbered ?? true;
  const title = options.title ?? 'Table of Contents';
  if (!entries.length) return '';
  const counters = [0, 0, 0, 0, 0, 0];
  const items: string[] = [];
  for (const entry of entries) {
    const lvl = Math.max(1, Math.min(6, entry.level));
    counters[lvl - 1]++;
    for (let i = lvl; i < counters.length; i++) counters[i] = 0;
    const prefix = numbered ? counters.slice(0, lvl).filter(n => n > 0).join('.') + ' ' : '';
    const indent = (lvl - 1) * 24;
    items.push(
      `<li style="list-style:none;margin-left:${indent}px;padding:2px 0;font-size:${Math.max(11, 14 - (lvl - 1))}px;">
        <a href="#${entry.id}" style="color:#1d6fd8;text-decoration:none;">${prefix}${escapeHtml(entry.text)}</a>
      </li>`
    );
  }
  return `<div class="toc" data-toc style="padding:12px;border:1px solid #ddd;margin:1em 0;background:#fafafa;">
    <h2 style="margin:0 0 8px;font-size:18px;font-weight:700;">${escapeHtml(title)}</h2>
    <ul style="margin:0;padding:0;">${items.join('')}</ul>
  </div>`;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface DocSection {
  id: string;
  title: string;
  startIndex: number;
}

export function readAloud(text: string, opts: { lang?: string; rate?: number; voice?: SpeechSynthesisVoice }): SpeechSynthesisUtterance | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const u = new SpeechSynthesisUtterance(text);
  if (opts.lang) u.lang = opts.lang;
  if (opts.rate) u.rate = opts.rate;
  if (opts.voice) u.voice = opts.voice;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
  return u;
}

export function stopReadAloud(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !window.speechSynthesis) return [];
  return window.speechSynthesis.getVoices();
}

export interface VoiceTypingHandler {
  start: () => void;
  stop: () => void;
  isSupported: boolean;
}

export function makeVoiceTyping(opts: {
  lang?: string;
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (err: string) => void;
}): VoiceTypingHandler {
  const W = window as any;
  const SR = W.SpeechRecognition ?? W.webkitSpeechRecognition;
  if (!SR) return { start: () => {}, stop: () => {}, isSupported: false };

  let recognition: any = null;
  let active = false;

  const start = () => {
    if (active) return;
    recognition = new SR();
    recognition.lang = opts.lang ?? 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (e: any) => {
      let finalText = '';
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interimText += t;
      }
      if (interimText && opts.onInterim) opts.onInterim(interimText);
      if (finalText) opts.onFinal(finalText);
    };
    recognition.onerror = (e: any) => opts.onError?.(e.error ?? 'unknown');
    recognition.onend = () => { active = false; };
    try {
      recognition.start();
      active = true;
    } catch (e) {
      opts.onError?.(String(e));
    }
  };

  const stop = () => {
    if (recognition && active) {
      try { recognition.stop(); } catch {}
    }
    active = false;
  };

  return { start, stop, isSupported: true };
}
