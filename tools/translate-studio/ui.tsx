'use client';

import * as React from 'react';
import { Loader2, Type as TypeIcon, Image as ImageIcon, Languages, Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { downloadBlob } from '@/engines/ffmpeg';
import { TRANSLATE_LANGUAGES as LANGS } from '@/lib/i18n/languages';
import { prepareImageEditor, translateText, type EditorBox } from '@/engines/doctranslate';
import { enforcePolicy } from '@/lib/limits/server-check';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';

const POLICY_KEY = 'translate-studio';

type Mode = 'choose' | 'text' | 'image' | 'subtitle';
interface TextEl { id: string; kind: 'text'; text: string; x: number; y: number; w: number; h: number; size: number; color: string; bg: string }
interface ImgEl { id: string; kind: 'image'; img: HTMLImageElement; x: number; y: number; w: number; h: number }
type El = TextEl | ImgEl;
let _eid = 0;

interface SubCue { start: string; end: string; text: string }
// Parse SRT or VTT into cues (timestamps kept verbatim so re-emit is exact).
function parseSubtitle(raw: string): SubCue[] {
  const txt = raw.replace(/\r/g, '').replace(/^WEBVTT.*?\n\n/s, '');
  const cues: SubCue[] = [];
  for (const block of txt.split(/\n\n+/)) {
    const lines = block.split('\n').filter(l => l.trim() !== '');
    if (!lines.length) continue;
    let i = 0;
    if (/^\d+$/.test(lines[0].trim())) i = 1; // SRT index line
    const tm = /([\d:.,]+)\s*-->\s*([\d:.,]+)/.exec(lines[i] || '');
    if (!tm) continue;
    cues.push({ start: tm[1], end: tm[2], text: lines.slice(i + 1).join('\n') });
  }
  return cues;
}
function serializeSrt(cues: SubCue[]): string {
  return cues.map((c, i) => `${i + 1}\n${c.start.replace('.', ',')} --> ${c.end.replace('.', ',')}\n${c.text}`).join('\n\n') + '\n';
}
function serializeVtt(cues: SubCue[]): string {
  return 'WEBVTT\n\n' + cues.map(c => `${c.start.replace(',', '.')} --> ${c.end.replace(',', '.')}\n${c.text}`).join('\n\n') + '\n';
}

export default function TranslationStudio() {
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const [mode, setMode] = React.useState<Mode>('choose');
  const [from, setFrom] = React.useState('auto');
  const [to, setTo] = React.useState('en');
  const [busy, setBusy] = React.useState(false);
  const [phase, setPhase] = React.useState('');
  const [ratio, setRatio] = React.useState(0);
  const [error, setError] = React.useState('');

  // text mode
  const [src, setSrc] = React.useState('');
  const [outText, setOutText] = React.useState('');

  // image mode
  const [bg, setBg] = React.useState<HTMLImageElement | null>(null);
  const [imgW, setImgW] = React.useState(0);
  const [imgH, setImgH] = React.useState(0);
  const [els, setEls] = React.useState<El[]>([]);
  const [sel, setSel] = React.useState<string | null>(null);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const drag = React.useRef<{ id: string; ox: number; oy: number; ex: number; ey: number } | null>(null);
  const imgInput = React.useRef<HTMLInputElement | null>(null);

  // Track every blob URL handed to an `<img>` here. The browser does NOT
  // auto-revoke blob URLs when the holding Image is GC'd — the URL keeps the
  // blob pinned. Without this set every translate/addImage call leaked one
  // URL until tab close.
  const blobUrlsRef = React.useRef<Set<string>>(new Set());
  React.useEffect(() => () => {
    for (const u of blobUrlsRef.current) { try { URL.revokeObjectURL(u); } catch { /* */ } }
    blobUrlsRef.current.clear();
  }, []);
  const trackBlobUrl = (url: string) => { blobUrlsRef.current.add(url); return url; };

  const selEl = els.find((e) => e.id === sel) || null;
  const displayW = Math.min(720, imgW || 720);
  const scale = imgW ? displayW / imgW : 1;

  // ---- text mode ----
  const runText = async () => {
    if (!src.trim()) return;
    const ok = await enforcePolicy(POLICY_KEY, isPro, policyGate.fire, []);
    if (!ok) return;
    setBusy(true); setError(''); setRatio(0);
    try {
      const { text } = await translateText(src, { to, from: from === 'auto' ? undefined : from, onProgress: (p, r) => { setPhase(p); setRatio(r); } });
      setOutText(text);
    } catch { setError('Could not translate.'); } finally { setBusy(false); }
  };

  // ---- subtitle mode (SRT / VTT) ----
  const [subName, setSubName] = React.useState('');
  const [subOut, setSubOut] = React.useState<{ blob: Blob; ext: string; count: number } | null>(null);

  const loadSubtitle = async (file: File) => {
    const ok = await enforcePolicy(POLICY_KEY, isPro, policyGate.fire, []);
    if (!ok) return;
    setMode('subtitle'); setBusy(true); setError(''); setRatio(0); setSubOut(null); setSubName(file.name);
    try {
      const raw = await file.text();
      const isVtt = /\.vtt$/i.test(file.name) || /^WEBVTT/.test(raw.trim());
      const cues = parseSubtitle(raw);
      if (!cues.length) { setError('No subtitle cues found.'); setBusy(false); return; }
      // Translate all cue texts in one batched call (newline-joined preserves order).
      const joined = cues.map(c => c.text.replace(/\n/g, ' ⏎ ')).join('\n');
      const { text } = await translateText(joined, { to, from: from === 'auto' ? undefined : from, onProgress: (p, r) => { setPhase(p); setRatio(r); } });
      const outLines = text.split('\n');
      cues.forEach((c, i) => { c.text = (outLines[i] ?? c.text).replace(/ ⏎ /g, '\n'); });
      const serialized = isVtt ? serializeVtt(cues) : serializeSrt(cues);
      setSubOut({ blob: new Blob([serialized], { type: isVtt ? 'text/vtt' : 'application/x-subrip' }), ext: isVtt ? 'vtt' : 'srt', count: cues.length });
    } catch { setError('Could not translate this subtitle file.'); }
    finally { setBusy(false); setPhase(''); }
  };

  // ---- image mode ----
  const loadImage = async (file: File) => {
    const ok = await enforcePolicy(POLICY_KEY, isPro, policyGate.fire, []);
    if (!ok) return;
    setMode('image'); setBusy(true); setError(''); setRatio(0); setEls([]); setBg(null);
    try {
      const data = await prepareImageEditor(file, { to, from: from === 'auto' ? undefined : from, onProgress: (p, r) => { setPhase(p); setRatio(r); } });
      // Revoke any existing bg URL — if the user retranslates we're about
      // to replace it. Tracked via blobUrlsRef for unmount-time cleanup.
      const img = new Image(); img.src = trackBlobUrl(URL.createObjectURL(data.bg));
      await img.decode().catch(() => {});
      setBg(img); setImgW(data.width); setImgH(data.height);
      setEls(data.boxes.map((b: EditorBox) => ({
        id: b.id, kind: 'text' as const, text: b.text, x: b.x, y: b.y, w: b.w, h: b.h,
        size: Math.max(10, Math.round(b.h * 0.72)), color: '#111111', bg: '#ffffff',
      })));
      setFrom((f) => f === 'auto' ? data.from : f);
    } catch { setError('Could not read this image.'); setMode('choose'); }
    finally { setBusy(false); setPhase(''); }
  };

  const patch = (id: string, p: Partial<El>) => setEls((es) => es.map((e) => e.id === id ? { ...e, ...p } as El : e));
  const del = (id: string) => { setEls((es) => es.filter((e) => e.id !== id)); if (sel === id) setSel(null); };
  const addText = () => { const e: TextEl = { id: `e${++_eid}`, kind: 'text', text: 'New text', x: imgW * 0.3, y: imgH * 0.45, w: imgW * 0.4, h: imgH * 0.05, size: Math.round(imgH * 0.035), color: '#111111', bg: '#ffffff' }; setEls((es) => [...es, e]); setSel(e.id); };
  const addImage = async (file: File) => {
    const img = new Image();
    // Tracked so unmount-time cleanup revokes it. The previous one-liner
    // dropped the URL on the floor and leaked it per insertion.
    img.src = trackBlobUrl(URL.createObjectURL(file));
    await img.decode().catch(() => {});
    const w = imgW * 0.25, h = w * (img.naturalHeight / img.naturalWidth || 1);
    const e: ImgEl = { id: `e${++_eid}`, kind: 'image', img, x: imgW * 0.05, y: imgH * 0.05, w, h };
    setEls((es) => [...es, e]); setSel(e.id);
  };

  const onDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation(); setSel(id);
    const el = els.find((x) => x.id === id); if (!el) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { id, ox: e.clientX, oy: e.clientY, ex: el.x, ey: el.y };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const d = drag.current; const dx = (e.clientX - d.ox) / scale, dy = (e.clientY - d.oy) / scale;
    patch(d.id, { x: d.ex + dx, y: d.ey + dy } as Partial<El>);
  };
  const onUp = () => { drag.current = null; };

  // ---- exports ----
  const flatten = async (): Promise<HTMLCanvasElement> => {
    const c = document.createElement('canvas'); c.width = imgW; c.height = imgH;
    const ctx = c.getContext('2d')!;
    if (bg) ctx.drawImage(bg, 0, 0, imgW, imgH); else { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, imgW, imgH); }
    ctx.textBaseline = 'middle';
    for (const e of els) {
      if (e.kind === 'image') { ctx.drawImage(e.img, e.x, e.y, e.w, e.h); continue; }
      if (!e.text.trim()) continue;
      ctx.fillStyle = e.bg; if (e.bg !== 'none') ctx.fillRect(e.x - 1, e.y - 1, e.w + 2, e.h + 2);
      let size = e.size; ctx.font = `${size}px system-ui, "Noto Sans", sans-serif`;
      while (size > 8 && ctx.measureText(e.text).width > e.w) { size -= 1; ctx.font = `${size}px system-ui, sans-serif`; }
      ctx.fillStyle = e.color; ctx.fillText(e.text, e.x, e.y + e.h / 2);
    }
    return c;
  };
  const plainText = () => els.filter((e) => e.kind === 'text').sort((a, b) => a.y - b.y).map((e) => (e as TextEl).text).join('\n');

  const exportStyled = async (kind: 'png' | 'pdf') => {
    const c = await flatten();
    if (kind === 'png') { const b: Blob = await new Promise((r) => c.toBlob((x) => r(x!), 'image/png')); downloadBlob(b, 'translation.png'); return; }
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    const jpg: Blob = await new Promise((r) => c.toBlob((x) => r(x!), 'image/jpeg', 0.92));
    const img = await doc.embedJpg(await jpg.arrayBuffer());
    const pg = doc.addPage([imgW, imgH]); pg.drawImage(img, { x: 0, y: 0, width: imgW, height: imgH });
    downloadBlob(new Blob([new Uint8Array(await doc.save())], { type: 'application/pdf' }), 'translation.pdf');
  };
  const exportText = async (kind: 'txt' | 'pdf' | 'docx') => {
    const text = mode === 'text' ? outText : plainText();
    if (!text.trim()) return;
    if (kind === 'txt') return downloadBlob(new Blob([text], { type: 'text/plain' }), 'translation.txt');
    if (kind === 'docx') { const { textToDocx } = await import('@/engines/doc/docx-write'); return downloadBlob(await textToDocx(text), 'translation.docx'); }
    const { renderTextToPdf } = await import('@/engines/text-render'); downloadBlob(await renderTextToPdf(text), 'translation.pdf');
  };

  // ---- render ----
  const langRow = (
    <div className="flex flex-wrap items-center gap-2">
      <select value={from} onChange={(e) => setFrom(e.target.value)} className="border border-black/[0.12] bg-[var(--color-surface-1)] px-2 py-1.5 text-[13px] outline-none">
        <option value="auto">Detect language</option>{LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
      </select>
      <span className="text-[var(--color-fg-subtle)]">→</span>
      <select value={to} onChange={(e) => setTo(e.target.value)} className="border border-black/[0.12] bg-[var(--color-surface-1)] px-2 py-1.5 text-[13px] outline-none">
        {LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
      </select>
    </div>
  );

  if (mode === 'choose') {
    return (
      <div className="space-y-5">
        {policyGate.element}
        {langRow}
        <div className="grid gap-4 sm:grid-cols-2">
          <button type="button" onClick={() => setMode('text')} className="flex flex-col items-center gap-2 border-2 border-dashed border-black/[0.14] bg-[var(--color-surface-1)] px-6 py-10 text-center hover:border-[var(--color-cat-text)]">
            <TypeIcon className="h-7 w-7 text-[var(--color-cat-text)]" /><div className="text-[14px] font-semibold">Translate text</div>
            <div className="text-[11px] text-[var(--color-fg-muted)]">Paste text → edit → export PDF / Word / TXT</div>
          </button>
          <label className="flex cursor-pointer flex-col items-center gap-2 border-2 border-dashed border-black/[0.14] bg-[var(--color-surface-1)] px-6 py-10 text-center hover:border-[var(--color-cat-text)]">
            <ImageIcon className="h-7 w-7 text-[var(--color-cat-text)]" /><div className="text-[14px] font-semibold">Translate an image / scan</div>
            <div className="text-[11px] text-[var(--color-fg-muted)]">OCR → translate → edit in original layout</div>
            <div className="text-[10px] text-[var(--color-fg-subtle)]">Tip: set the document’s language above for the most accurate reading.</div>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadImage(f); }} />
          </label>
          <label className="flex cursor-pointer flex-col items-center gap-2 border-2 border-dashed border-black/[0.14] bg-[var(--color-surface-1)] px-6 py-10 text-center hover:border-[var(--color-cat-text)]">
            <Languages className="h-7 w-7 text-[var(--color-cat-text)]" /><div className="text-[14px] font-semibold">Translate subtitles</div>
            <div className="text-[11px] text-[var(--color-fg-muted)]">SRT / VTT → translate every cue → keep timing</div>
            <input type="file" accept=".srt,.vtt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadSubtitle(f); e.currentTarget.value = ''; }} />
          </label>
        </div>
        <p className="text-[11px] text-[var(--color-fg-subtle)]">For multi-page PDFs or Word files, use the <a href="/tools/doc-translate" className="underline">Document Translator</a>. Everything here runs on your device.</p>
      </div>
    );
  }

  if (mode === 'subtitle') {
    return (
      <div className="space-y-4">
        {policyGate.element}
        <div className="flex items-center justify-between">{langRow}
          <button type="button" onClick={() => { setMode('choose'); setSubOut(null); }} className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Back</button>
        </div>
        <div className="border border-black/[0.1] bg-[var(--color-surface-1)] p-4">
          <div className="text-[13px] font-semibold">{subName || 'Subtitle file'}</div>
          {busy && <div className="mt-2 text-[12px] text-[var(--color-fg-muted)]">{phase || 'Translating'}… {Math.round(ratio * 100)}%</div>}
          {error && <div className="mt-2 text-[12px] text-red-600">{error}</div>}
          {subOut && !busy && (
            <div className="mt-3 flex items-center gap-3">
              <span className="text-[12px] text-[var(--color-fg-muted)]">Translated {subOut.count} cues — timing preserved.</span>
              <button type="button" onClick={() => downloadBlob(subOut.blob, `${(subName || 'subtitles').replace(/\.[^.]+$/, '')}-${to}.${subOut.ext}`)}
                className="bg-[var(--color-cat-text)] px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-white">Download .{subOut.ext}</button>
            </div>
          )}
          {!busy && !subOut && (
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 border border-black/[0.12] px-3 py-2 text-[12px] font-semibold">
              Choose an SRT / VTT file
              <input type="file" accept=".srt,.vtt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadSubtitle(f); e.currentTarget.value = ''; }} />
            </label>
          )}
        </div>
        <p className="text-[11px] text-[var(--color-fg-subtle)]">Every cue is translated on your device; timestamps stay exactly as-is so the file drops straight back into your video.</p>
      </div>
    );
  }

  if (mode === 'text') {
    return (
      <div className="space-y-4">
        {policyGate.element}
        <div className="flex items-center justify-between">{langRow}
          <button type="button" onClick={() => setMode('choose')} className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Back</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <textarea value={src} onChange={(e) => setSrc(e.target.value)} rows={14} placeholder="Paste text to translate…" className="w-full resize-y border border-black/[0.1] bg-[var(--color-surface-1)] p-3 text-[14px] outline-none focus:border-[var(--color-cat-text)]" />
          <textarea value={outText} onChange={(e) => setOutText(e.target.value)} rows={14} placeholder="Translation (editable)…" className="w-full resize-y border border-black/[0.1] bg-[var(--color-surface-2)] p-3 text-[14px] outline-none" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={runText} disabled={busy || !src.trim()} className="flex items-center gap-2 bg-[var(--color-cat-text)] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}{busy ? `Translating… ${Math.round(ratio * 100)}%` : 'Translate'}
          </button>
          {outText && <>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">Download</span>
            <button type="button" onClick={() => exportText('txt')} className="border border-black/[0.12] px-3 py-2 text-[12px] font-semibold">TXT</button>
            <button type="button" onClick={() => exportText('pdf')} className="border border-black/[0.12] px-3 py-2 text-[12px] font-semibold">PDF</button>
            <button type="button" onClick={() => exportText('docx')} className="border border-black/[0.12] px-3 py-2 text-[12px] font-semibold">Word</button>
          </>}
        </div>
        {error && <div className="text-[12px] text-red-600">{error}</div>}
      </div>
    );
  }

  // image editor mode
  return (
    <div className="space-y-3">
      {policyGate.element}
      <div className="flex flex-wrap items-center gap-2">{langRow}
        <button type="button" onClick={() => { setMode('choose'); setBg(null); setEls([]); }} className="ml-auto text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Start over</button>
      </div>

      {busy ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 border border-black/[0.08] bg-[var(--color-surface-1)]">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--color-cat-text)]" />
          <div className="text-[13px] text-[var(--color-fg-muted)]">{phase || 'Working'}… {Math.round(ratio * 100)}%</div>
        </div>
      ) : bg && (
        <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
          {/* canvas editor */}
          <div className="overflow-auto border border-black/[0.08] bg-[var(--color-surface-2)] p-2">
            <div ref={wrapRef} onPointerMove={onMove} onPointerUp={onUp} onClick={() => setSel(null)}
              className="relative mx-auto" style={{ width: displayW, height: imgH * scale }}>
              <img src={bg.src} alt="" className="absolute inset-0 h-full w-full select-none" draggable={false} />
              {els.map((e) => (
                <div key={e.id} onPointerDown={(ev) => onDown(ev, e.id)} onClick={(ev) => ev.stopPropagation()}
                  className={cn('absolute cursor-move overflow-hidden', sel === e.id && 'outline outline-2 outline-[var(--color-cat-text)]')}
                  style={{ left: e.x * scale, top: e.y * scale, width: e.w * scale, height: e.h * scale }}>
                  {e.kind === 'image'
                    ? <img src={e.img.src} alt="" className="h-full w-full" draggable={false} />
                    : <div style={{ background: e.bg === 'none' ? 'transparent' : e.bg, color: e.color, fontSize: Math.max(7, e.size * scale), lineHeight: `${e.h * scale}px`, fontWeight: 600, whiteSpace: 'nowrap' }}>{e.text}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* side panel */}
          <div className="space-y-3">
            <div className="flex gap-1.5">
              <button type="button" onClick={addText} className="flex flex-1 items-center justify-center gap-1.5 border border-black/[0.12] px-2 py-2 text-[12px] font-semibold hover:bg-[var(--color-surface-2)]"><Plus className="h-3.5 w-3.5" /> Text</button>
              <button type="button" onClick={() => imgInput.current?.click()} className="flex flex-1 items-center justify-center gap-1.5 border border-black/[0.12] px-2 py-2 text-[12px] font-semibold hover:bg-[var(--color-surface-2)]"><ImageIcon className="h-3.5 w-3.5" /> Image</button>
              <input ref={imgInput} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void addImage(f); e.target.value = ''; }} />
            </div>

            {selEl ? (
              <div className="space-y-2 border border-black/[0.08] bg-[var(--color-surface-1)] p-3 text-[12px]">
                {selEl.kind === 'text' && <>
                  <textarea value={selEl.text} onChange={(e) => patch(selEl.id, { text: e.target.value })} rows={2} className="w-full resize-y border border-black/[0.1] bg-[var(--color-surface-2)] p-2 text-[13px] outline-none" />
                  <label className="flex items-center justify-between">Size<input type="range" min={8} max={120} value={selEl.size} onChange={(e) => patch(selEl.id, { size: +e.target.value })} /></label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1">Text<input type="color" value={selEl.color} onChange={(e) => patch(selEl.id, { color: e.target.value })} /></label>
                    <label className="flex items-center gap-1">Box<input type="color" value={selEl.bg === 'none' ? '#ffffff' : selEl.bg} onChange={(e) => patch(selEl.id, { bg: e.target.value })} /></label>
                    <button type="button" onClick={() => patch(selEl.id, { bg: selEl.bg === 'none' ? '#ffffff' : 'none' })} className="text-[11px] underline">{selEl.bg === 'none' ? 'show box' : 'clear box'}</button>
                  </div>
                </>}
                <button type="button" onClick={() => del(selEl.id)} className="flex items-center gap-1.5 text-[12px] font-semibold text-red-600"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
              </div>
            ) : <p className="text-[11px] text-[var(--color-fg-subtle)]">Click an item to edit its text, size, colors or position. Drag to move.</p>}

            <div className="space-y-2 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Export — same style</div>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => exportStyled('png')} className="flex-1 bg-[var(--color-cat-text)] px-2 py-2 text-[11px] font-bold uppercase tracking-wider text-white">PNG</button>
                <button type="button" onClick={() => exportStyled('pdf')} className="flex-1 bg-[var(--color-cat-text)] px-2 py-2 text-[11px] font-bold uppercase tracking-wider text-white">PDF</button>
              </div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Export — plain text</div>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => exportText('txt')} className="flex-1 border border-black/[0.12] px-2 py-2 text-[11px] font-semibold">TXT</button>
                <button type="button" onClick={() => exportText('pdf')} className="flex-1 border border-black/[0.12] px-2 py-2 text-[11px] font-semibold">PDF</button>
                <button type="button" onClick={() => exportText('docx')} className="flex-1 border border-black/[0.12] px-2 py-2 text-[11px] font-semibold">Word</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {error && <div className="text-[12px] text-red-600">{error}</div>}
    </div>
  );
}
