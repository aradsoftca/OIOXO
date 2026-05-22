'use client';
import * as React from 'react';
import { Download, Loader2 } from 'lucide-react';
import { PdfDrop, type PdfFileItem } from '@/components/tool/PdfDrop';
import { getPdfInfo, rotatePages, parseRange, download, type PdfInfo } from '@/engines/pdf';

export default function Tool() {
  const [item, setItem] = React.useState<PdfFileItem | null>(null);
  const [info, setInfo] = React.useState<PdfInfo | null>(null);
  const [angle, setAngle] = React.useState<90 | 180 | 270>(90);
  const [scope, setScope] = React.useState<'all' | 'some'>('all');
  const [pages, setPages] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const load = async (it: PdfFileItem) => {
    setItem(it); setError('');
    try { setInfo(await getPdfInfo(it.buffer)); }
    catch (e) { setError((e as Error).message); }
  };

  const run = async () => {
    if (!item || !info) return;
    setBusy(true); setError('');
    try {
      const targets = scope === 'all' ? 'all' : parseRange(pages, info.pageCount);
      if (scope === 'some' && (targets as number[]).length === 0) {
        setError('No valid pages selected.'); setBusy(false); return;
      }
      const out = await rotatePages(item.buffer, angle, targets);
      download(out, item.file.name.replace(/\.pdf$/i, '') + '-rotated.pdf');
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {!item && <PdfDrop loaded={false} onLoad={load} />}

      {item && info && (
        <>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{info.pageCount} pages</span>
            <button type="button" onClick={() => { setItem(null); setInfo(null); }}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change PDF</button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Rotation</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {([90, 180, 270] as const).map((a) => (
                    <button key={a} type="button" onClick={() => setAngle(a)}
                      className={`border py-2 text-[11px] font-bold transition ${angle === a ? 'border-[var(--color-cat-pdf)] bg-[var(--color-cat-pdf)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      {a}° {a === 90 ? '↻' : a === 180 ? '↕' : '↺'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Apply to</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['all', 'some'] as const).map((s) => (
                    <button key={s} type="button" onClick={() => setScope(s)}
                      className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${scope === s ? 'border-[var(--color-cat-pdf)] bg-[var(--color-cat-pdf)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      {s === 'all' ? 'All pages' : 'Specific pages'}
                    </button>
                  ))}
                </div>
                {scope === 'some' && (
                  <input value={pages} onChange={(e) => setPages(e.target.value)} placeholder="1, 3-5, 8"
                    className="mt-2 w-full bg-transparent border-b border-black/[0.1] py-1 font-mono text-[13px] outline-none focus:border-[var(--color-cat-pdf)]" />
                )}
              </div>
            </div>
            <aside>
              <button type="button" onClick={run} disabled={busy}
                className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-pdf)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {busy ? 'Rotating…' : 'Rotate & Download'}
              </button>
              {error && <div className="mt-2 text-[12px] text-red-600">{error}</div>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
